import { beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASE_LUA, withAiAdmission } from "@/lib/server/ai-limiter";
import { POST as draft } from "@/app/api/draft/route";
import { POST as review } from "@/app/api/completeness/route";
import { POST as legacy } from "@/app/api/generate/route";
import { POST as transcribe } from "@/app/api/transcribe/route";
import { RedisLuaFixture } from "./limiter-redis-fixture";
import { SYNTHETIC_ANSWERS, syntheticWav, TEST_KEY } from "./fixtures";

let redis: RedisLuaFixture;
let serial = 0;
const body = { text: "synthetic-private-answer" };
function request(ip = "192.0.2.1", intent = `intent_${String(++serial).padStart(12,"0")}`) {
  return new Request("https://example.test/api/draft", { method: "POST", headers: { "x-vercel-forwarded-for": ip, "idempotency-key": intent } });
}
function admit(req: Request, run = async (terminal: () => void) => { terminal(); return "ok"; }) {
  return withAiAdmission(req, "draft", body, run);
}
beforeEach(() => {
  redis = new RedisLuaFixture(); serial = 0;
  vi.stubEnv("VERCEL", "1"); vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://test.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only-token"); vi.stubEnv("ISKRA_LIMITER_HMAC_KEY", "synthetic-hmac-key-not-a-secret-123456");
  vi.stubGlobal("fetch", vi.fn(redis.fetch));
});

describe("shared Redis admission", () => {
  it("limits per-IP rolling rate and returns exact retry time", async () => {
    for (let i=0;i<6;i++) await admit(request());
    await expect(admit(request())).rejects.toMatchObject({status:429,retryAfterSeconds:60});
    redis.advance(60_000); expect(await admit(request())).toBe("ok");
  });
  it("enforces 12 calls per rolling day across IPs, without refunding failures", async () => {
    for (let i=0;i<12;i++) await admit(request(`192.0.2.${i+1}`));
    await expect(admit(request("192.0.2.50"))).rejects.toMatchObject({status:429,retryAfterSeconds:86400});
    redis.advance(86_400_000); expect(await admit(request("192.0.2.50"))).toBe("ok");
  });
  it("enforces per-IP and global concurrency across concurrent callers", async () => {
    let finish!: () => void; const gate = new Promise<void>(r => finish=r);
    const a = admit(request(), async terminal => { await gate; terminal(); return "ok"; });
    const b = admit(request(), async terminal => { await gate; terminal(); return "ok"; });
    await vi.waitFor(() => expect(redis.requests.length).toBe(2));
    await expect(admit(request())).rejects.toMatchObject({status:429,retryAfterSeconds:90});
    const c = admit(request("192.0.2.2"), async terminal => { await gate; terminal(); return "ok"; });
    await vi.waitFor(() => expect(redis.requests.length).toBe(4));
    await expect(admit(request("192.0.2.3"))).rejects.toMatchObject({status:429,retryAfterSeconds:90});
    finish(); await Promise.all([a,b,c]); expect(await admit(request("192.0.2.4"))).toBe("ok");
  });
  it("holds uncertain slots until TTL and never refunds quota", async () => {
    for (let i=0;i<3;i++) await expect(admit(request(`192.0.2.${i+1}`), async () => { throw new Error("uncertain"); })).rejects.toThrow();
    await expect(admit(request("192.0.2.9"))).rejects.toMatchObject({status:429,retryAfterSeconds:90});
    redis.advance(90_000); expect(await admit(request("192.0.2.9"))).toBe("ok");
    for (let i=0;i<8;i++) await admit(request(`192.0.2.${i+10}`));
    await expect(admit(request("192.0.2.100"))).rejects.toMatchObject({status:429});
  });
  it("rejects repeated operation keys while allowing identical new intents", async () => {
    const key="sameintent_123456789"; await admit(request("192.0.2.1",key));
    await expect(admit(request("192.0.2.1",key))).rejects.toMatchObject({status:409});
    expect(await admit(request())).toBe("ok");
  });
  it("sends no source text or raw IP to storage", async () => {
    await admit(request()); const sent=redis.requests.join(" ");
    expect(sent).not.toContain("synthetic-private-answer"); expect(sent).not.toContain("192.0.2.1");
  });
  it("fails closed when storage config is absent, unavailable or ambiguous", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", ""); const fn=vi.fn(); await expect(admit(request(),fn)).rejects.toMatchObject({status:503}); expect(fn).not.toHaveBeenCalled();
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-only-token");
    vi.stubGlobal("fetch",vi.fn(async()=>{ throw new Error("network"); })); await expect(admit(request(),fn)).rejects.toMatchObject({status:503});
    vi.stubGlobal("fetch",vi.fn(async()=>Response.json({result:[0]}))); await expect(admit(request(),fn)).rejects.toMatchObject({status:503}); expect(fn).not.toHaveBeenCalled();
  });
});

describe("routes use shared admission", () => {
  it.each([
    ["draft", draft, {answers:SYNTHETIC_ANSWERS}], ["completeness", review, {draft:"Synthetic draft"}],
    ["generate", legacy, {answers:SYNTHETIC_ANSWERS}], ["transcribe", transcribe, {audioBase64:syntheticWav().toString("base64"),mimeType:"audio/wav"}],
  ] as const)("%s admits before calling provider", async (name, post, value) => {
    vi.stubEnv("GEMINI_API_KEY",TEST_KEY);
    const fetchMock=vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => String(url).includes("upstash.io") ? redis.fetch(url,init) : new Response(null,{status:503}));
    vi.stubGlobal("fetch",fetchMock);
    const req = new Request(`https://example.test/api/${name}`, {method:"POST",headers:{"content-type":"application/json","x-vercel-forwarded-for":"192.0.2.1","idempotency-key":"operation_123456789"},body:JSON.stringify(value)});
    expect((await post(req)).status).toBe(503);
    expect(redis.requests).toHaveLength(1); // HTTP error is ambiguous; retain lease
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([draft, review, legacy, transcribe])("rejects invalid input before admission", async post => {
    const req=new Request("https://example.test",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    expect((await post(req)).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
  });
});

describe("additional security boundaries", () => {
  it("retains operation identity for 24h then permits it again", async () => {
    const key="retainedintent_123456";
    await admit(request("192.0.2.1",key));
    redis.advance(86_399_999);
    await expect(admit(request("192.0.2.1",key))).rejects.toMatchObject({status:409});
    redis.advance(1);
    expect(await admit(request("192.0.2.1",key))).toBe("ok");
  });
  it("preserves legacy generate requests without an operation key", async () => {
    const req = new Request("https://example.test/api/generate",{method:"POST",headers:{"x-vercel-forwarded-for":"192.0.2.1"}});
    expect(await withAiAdmission(req,"generate",body,async terminal=>{terminal(); return "ok";})).toBe("ok");
  });
  it("rejects non-pinned model before storage and provider", async () => {
    vi.stubEnv("GEMINI_API_KEY",TEST_KEY); vi.stubEnv("GEMINI_MODEL","gemini-other");
    const req=new Request("https://example.test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({answers:SYNTHETIC_ANSWERS})});
    expect((await draft(req)).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not admit or call provider for oversized audio JSON", async () => {
    vi.stubEnv("GEMINI_API_KEY",TEST_KEY);
    const req=new Request("https://example.test",{method:"POST",headers:{"content-type":"application/json"},body:"x".repeat(4*1024*1024+1)});
    expect((await transcribe(req)).status).toBe(413); expect(fetch).not.toHaveBeenCalled();
  });
  it("raw audio limit plus base64 and JSON overhead fits below 4 MiB", async () => {
    const { LIMITS } = await import("@/lib/server/schemas");
    const audio=Buffer.alloc(LIMITS.audioBytes).toString("base64");
    expect(Buffer.byteLength(JSON.stringify({audioBase64:audio,mimeType:"audio/webm;codecs=opus"}))).toBeLessThan(LIMITS.transcribeBodyBytes);
    expect(LIMITS.transcribeBodyBytes).toBeLessThan(4_500_000);
  });
});

describe("end-to-end admission with mocked transports", () => {
  function draftRequest(key: string) {
    return new Request("https://example.test/api/draft", {method:"POST",headers:{"content-type":"application/json","x-vercel-forwarded-for":"192.0.2.20","idempotency-key":key},body:JSON.stringify({answers:SYNTHETIC_ANSWERS})});
  }
  it("does not call Gemini twice for one key, but permits a new intent", async () => {
    vi.stubEnv("GEMINI_API_KEY",TEST_KEY);
    let calls=0;
    vi.stubGlobal("fetch",vi.fn(async (url:RequestInfo | URL, init?:RequestInit) => {
      if (String(url).includes("upstash.io")) return redis.fetch(url,init);
      calls++;
      return Response.json({status:"completed",steps:[{type:"model_output",content:[{type:"text",text:"{}"}]}]});
    }));
    expect((await draft(draftRequest("same_operation_12345"))).status).toBe(502);
    expect((await draft(draftRequest("same_operation_12345"))).status).toBe(409);
    expect((await draft(draftRequest("next_operation_12345"))).status).toBe(502);
    expect(calls).toBe(2);
    expect(redis.requests.filter(x => JSON.parse(x)[1] === RELEASE_LUA).length).toBe(2);
  });
  it("returns 429 and Retry-After before calling Gemini when the rate cap is reached", async () => {
    for(let i=0;i<6;i++) await withAiAdmission(request("192.0.2.20"),"draft",body,async done=>{done(); return "ok";});
    vi.stubEnv("GEMINI_API_KEY",TEST_KEY);
    const response=await draft(draftRequest("rate_operation_12345"));
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("60");
  });
  it("missing limiter configuration does not call Gemini on any route", async () => {
    vi.stubEnv("GEMINI_API_KEY",TEST_KEY); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    for (const [post, value] of [[draft,{answers:SYNTHETIC_ANSWERS}],[review,{draft:"Synthetic draft"}],[legacy,{answers:SYNTHETIC_ANSWERS}],[transcribe,{audioBase64:syntheticWav().toString("base64"),mimeType:"audio/wav"}]] as const) {
      const req=new Request("https://example.test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)});
      expect((await post(req)).status).toBe(503);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
