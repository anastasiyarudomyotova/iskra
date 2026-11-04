import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as draft } from "@/app/api/draft/route";
import { POST as completeness } from "@/app/api/completeness/route";
import { POST as generate } from "@/app/api/generate/route";
import { POST as transcribe } from "@/app/api/transcribe/route";
import { LIMITS } from "@/lib/server/schemas";
import {
  interactionResponse,
  SYNTHETIC_ANSWERS,
  SYNTHETIC_VACANCY,
  syntheticWav,
  TEST_KEY,
} from "./fixtures";

const routes = [
  [draft, { answers: SYNTHETIC_ANSWERS }],
  [completeness, { draft: "Вымышленный текст вакансии." }],
  [generate, { answers: SYNTHETIC_ANSWERS }],
  [
    transcribe,
    { audioBase64: syntheticWav().toString("base64"), mimeType: "audio/wav" },
  ],
] as const;
const request = (body: unknown) =>
  new Request("https://example.test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
  vi.stubEnv("GEMINI_MODEL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("ISKRA_LIMITER_HMAC_KEY", "");
});

describe("provider guardrails without shared storage", () => {
  it.each(routes)(
    "pins the model without Redis or an idempotency header",
    async (post, body) => {
      const mock = vi.fn<typeof fetch>(async () =>
        Response.json(interactionResponse({})),
      );
      vi.stubGlobal("fetch", mock);
      await post(request(body));
      expect(mock).toHaveBeenCalledOnce();
      const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(JSON.parse(String(init?.body)).model).toBe(
        "gemini-3.5-flash-lite",
      );
    },
  );
  it.each(routes)(
    "rejects an unapproved model before a provider call",
    async (post, body) => {
      vi.stubEnv("GEMINI_MODEL", "gemini-other");
      const mock = vi.fn();
      vi.stubGlobal("fetch", mock);
      expect((await post(request(body))).status).toBe(503);
      expect(mock).not.toHaveBeenCalled();
    },
  );
  it("preserves the legacy response and may call the provider again on retry", async () => {
    const mock = vi.fn(async () =>
      Response.json(interactionResponse({ vacancy: SYNTHETIC_VACANCY })),
    );
    vi.stubGlobal("fetch", mock);
    for (let i = 0; i < 2; i++) {
      const response = await generate(request({ answers: SYNTHETIC_ANSWERS }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ vacancy: SYNTHETIC_VACANCY });
    }
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("keeps maximum raw audio with JSON overhead below the platform limit", () => {
    const encoded = Buffer.alloc(LIMITS.audioBytes).toString("base64");
    expect(
      Buffer.byteLength(
        JSON.stringify({ audioBase64: encoded, mimeType: "audio/wav" }),
      ),
    ).toBeLessThan(LIMITS.transcribeBodyBytes);
    expect(LIMITS.transcribeBodyBytes).toBeLessThan(4_500_000);
  });
});
