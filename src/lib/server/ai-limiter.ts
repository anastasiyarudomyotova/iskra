import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { ApiError, ERRORS } from "./api-errors";

// A single primary-side EVAL is responsible for all admission decisions.
// Redis TIME, not client clocks, is the authority for every rolling window.
export const ADMIT_LUA = `
local nowparts = redis.call('TIME')
local now = nowparts[1] * 1000 + math.floor(nowparts[2] / 1000)
local iprate, ipactive, globalactive, daily, operation = unpack(KEYS)
local lease, fingerprint, route = ARGV[1], ARGV[2], ARGV[3]
local ttl, day, minute = 90000, 86400000, 60000
if redis.call('EXISTS', operation) == 1 then return {2, 0} end
redis.call('ZREMRANGEBYSCORE', iprate, '-inf', now - minute)
redis.call('ZREMRANGEBYSCORE', daily, '-inf', now - day)
redis.call('ZREMRANGEBYSCORE', ipactive, '-inf', now)
redis.call('ZREMRANGEBYSCORE', globalactive, '-inf', now)
local function wait(key, duration)
  local first = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return math.max(1, math.ceil((tonumber(first[2]) + duration - now) / 1000))
end
local retry = 0
if redis.call('ZCARD', iprate) >= 6 then retry = math.max(retry, wait(iprate, minute)) end
if redis.call('ZCARD', daily) >= 12 then retry = math.max(retry, wait(daily, day)) end
if redis.call('ZCARD', ipactive) >= 2 then retry = math.max(retry, wait(ipactive, 0)) end
if redis.call('ZCARD', globalactive) >= 3 then retry = math.max(retry, wait(globalactive, 0)) end
if retry > 0 then return {1, retry} end
redis.call('ZADD', iprate, now, lease)
redis.call('PEXPIRE', iprate, minute + 1000)
redis.call('ZADD', daily, now, lease)
redis.call('PEXPIRE', daily, day + 1000)
redis.call('ZADD', ipactive, now + ttl, lease)
redis.call('PEXPIRE', ipactive, ttl + 1000)
redis.call('ZADD', globalactive, now + ttl, lease)
redis.call('PEXPIRE', globalactive, ttl + 1000)
redis.call('HSET', operation, 'body', fingerprint, 'route', route, 'lease', lease, 'state', 'reserved')
redis.call('PEXPIRE', operation, day)
return {0, 0}
`;

export const RELEASE_LUA = `
if redis.call('HGET', KEYS[3], 'lease') ~= ARGV[1] then return 0 end
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('HSET', KEYS[3], 'state', 'finished')
return 1
`;

type Config = { url: string; token: string; secret: string };
function config(): Config {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const secret = process.env.ISKRA_LIMITER_HMAC_KEY;
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".upstash.io") || parsed.username || parsed.password || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash || !token || !secret || secret.length < 32) throw new Error();
    return { url: parsed.origin, token, secret };
  } catch { throw ERRORS.unavailable(); }
}

async function evalRedis(c: Config, script: string, keys: string[], args: string[]): Promise<unknown> {
  try {
    const response = await fetch(c.url, {
      method: "POST", headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", script, String(keys.length), ...keys, ...args]),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error();
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("result" in result) || "error" in result) throw new Error();
    return (result as { result: unknown }).result;
  } catch { throw ERRORS.unavailable(); }
}

/** Validate before calling this helper; it never stores raw data or addresses. */
export async function withAiAdmission<T>(request: Request, route: string, body: unknown, run: (terminal: () => void) => Promise<T>): Promise<T> {
  const c = config();
  // Trust Vercel's overwritten header only on Vercel, never user-supplied headers in local hosting.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.trim() : undefined;
  if (!ip || !isIP(ip)) throw ERRORS.unavailable();
  const supplied = request.headers.get("idempotency-key");
  if (supplied && !/^[a-zA-Z0-9_-]{16,128}$/.test(supplied)) throw ERRORS.input();
  // Legacy /api/generate clients keep working without a header; they cannot be deduplicated.
  if (!supplied && route !== "generate") throw ERRORS.input();
  const intent = supplied || randomUUID();
  const mac = (domain: string, text: string) => createHmac("sha256", c.secret).update(domain).update("\0").update(text).digest("hex");
  const ipHash = mac("ip", ip);
  const opHash = mac("operation", `${route}\0${intent}`);
  const bodyHash = mac("body", JSON.stringify(body));
  const lease = randomUUID();
  const keys = [`iskra:rate:${ipHash}`, `iskra:active:${ipHash}`, "iskra:active:global", "iskra:daily", `iskra:op:${opHash}`];
  const result = await evalRedis(c, ADMIT_LUA, keys, [lease, bodyHash, route]);
  if (!Array.isArray(result) || result.length !== 2 || !Number.isSafeInteger(result[0]) || !Number.isSafeInteger(result[1])) throw ERRORS.unavailable();
  if (result[0] === 1 && result[1] >= 1 && result[1] <= 86400) throw ERRORS.rateLimited(result[1]);
  if (result[0] === 2 && result[1] === 0) throw new ApiError(409, "DUPLICATE_OPERATION", "Эта операция уже отправлена. Начните новую, если хотите повторить.");
  if (result[0] !== 0 || result[1] !== 0) throw ERRORS.unavailable();
  let terminal = false;
  try { return await run(() => { terminal = true; }); }
  finally {
    // A timeout/network failure is ambiguous; retain its lease until expiry.
    if (terminal) await evalRedis(c, RELEASE_LUA, [keys[1], keys[2], keys[4]], [lease]).catch(() => undefined);
  }
}
