import { describe, expect, it, vi } from "vitest";
import { POST as draft } from "@/app/api/draft/route";
import { POST as completeness } from "@/app/api/completeness/route";
import { jsonRequest, mockGemini, SYNTHETIC_ANSWERS, TEST_KEY } from "./fixtures";

const routes = [
  { name: "draft", post: draft, body: { answers: SYNTHETIC_ANSWERS } },
  { name: "completeness", post: completeness, body: { draft: "Вымышленный текст." } },
];

describe.each(routes)("$name shared negative paths", ({ name, post, body }) => {
  const request = () => jsonRequest(`/api/${name}`, body);
  it("rejects missing key before calling provider", async () => {
    const res = await post(request());
    expect(res.status).toBe(503); expect((await res.json()).code).toBe("SERVICE_UNAVAILABLE"); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([[429, 429, "RATE_LIMITED"], [503, 503, "UPSTREAM_ERROR"], [400, 502, "UPSTREAM_ERROR"]] as const)("maps upstream %i without leaking its body", async (upstream, expected, code) => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`private ${TEST_KEY}`, { status: upstream })));
    const res = await post(request()); const text = await res.text();
    expect(res.status).toBe(expected); expect(JSON.parse(text).code).toBe(code); expect(text).not.toContain(TEST_KEY);
    expect(res.headers.get("cache-control")).toContain("no-store"); expect(fetch).toHaveBeenCalledOnce();
  });
  it("rejects a malformed model response safely", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); mockGemini({ unexpected: "synthetic" });
    const res = await post(request()); expect(res.status).toBe(502); expect((await res.json()).code).toBe("INVALID_MODEL_OUTPUT");
  });
  it("returns safe timeout and does not retry", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("deadline", "TimeoutError"); }));
    const res = await post(request()); expect(res.status).toBe(504); expect((await res.json()).code).toBe("UPSTREAM_TIMEOUT"); expect(fetch).toHaveBeenCalledOnce();
  });
  it("rejects wrong content type, malformed JSON and oversized bodies before fetch", async () => {
    const make = (value: string, type: string) => new Request(`http://localhost/api/${name}`, { method: "POST", headers: { "Content-Type": type }, body: value });
    expect((await post(make("{}", "text/plain"))).status).toBe(415);
    expect((await post(make("{", "application/json"))).status).toBe(400);
    expect((await post(make("x".repeat(65537), "application/json"))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
});
