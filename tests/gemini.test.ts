import { afterEach, describe, expect, it, vi } from "vitest";
import { generateStructured } from "@/lib/server/gemini";
import { LIMITS, transcriptSchema } from "@/lib/server/schemas";
import {
  interactionResponse,
  SYNTHETIC_TRANSCRIPT,
  TEST_KEY,
} from "./fixtures";

function call() {
  return generateStructured({
    systemInstruction: "Synthetic test only",
    content: [{ type: "text", text: "Synthetic test only" }],
    schema: transcriptSchema,
    maxOutputTokens: 128,
  });
}

afterEach(() => vi.useRealTimers());

describe("Gemini transport", () => {
  it("actually arms the configured deadline and passes its signal to fetch", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      ),
    );
    const pending = call();
    const assertion = expect(pending).rejects.toMatchObject({
      status: 504,
      code: "UPSTREAM_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(LIMITS.geminiTimeoutMs);
    await assertion;
  });

  it("times out a stalled provider response body and does not retry", async () => {
    vi.useFakeTimers();
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const mock = vi.fn<typeof fetch>(async (_url, init) => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener(
            "abort",
            () => controller.error(init.signal?.reason),
            { once: true },
          );
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", mock);
    const pending = call();
    const assertion = expect(pending).rejects.toMatchObject({
      status: 504,
      code: "UPSTREAM_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(LIMITS.geminiTimeoutMs);
    await assertion;
    expect(mock).toHaveBeenCalledOnce();
  });

  it.each(["0", "99999", "not-a-date"])(
    "bounds invalid or excessive Retry-After: %s",
    async (value) => {
      vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(null, {
              status: 429,
              headers: { "Retry-After": value },
            }),
        ),
      );
      const response = await call().catch((error) => error);
      expect(response.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(response.retryAfterSeconds).toBeLessThanOrEqual(300);
    },
  );

  it("rejects an oversized provider response without returning it", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("x".repeat(LIMITS.geminiResponseBytes + 1)),
      ),
    );
    await expect(call()).rejects.toMatchObject({
      status: 502,
      code: "INVALID_MODEL_OUTPUT",
    });
  });

  it("rejects malformed JSON inside a valid interaction envelope", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: "```json\n{}\n```" }],
            },
          ],
        }),
      ),
    );
    await expect(call()).rejects.toMatchObject({ status: 502 });
  });

  it("accepts split final text blocks but ignores thoughts", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const json = JSON.stringify(SYNTHETIC_TRANSCRIPT);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "completed",
          steps: [
            {
              type: "thought",
              content: [{ type: "text", text: "ignore this" }],
            },
            {
              type: "model_output",
              content: [
                { type: "text", text: json.slice(0, 12) },
                { type: "text", text: json.slice(12) },
              ],
            },
          ],
        }),
      ),
    );
    await expect(call()).resolves.toEqual(SYNTHETIC_TRANSCRIPT);
  });

  it("rejects non-text final output", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "image", data: "synthetic" }],
            },
          ],
        }),
      ),
    );
    await expect(call()).rejects.toMatchObject({ status: 502 });
  });

  it.each([400, 401, 403, 404, 500])(
    "does not expose upstream error details for HTTP %s",
    async (status) => {
      vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(`private ${TEST_KEY}`, { status })),
      );
      const error = await call().catch((value) => value);
      expect(error.status).toBe(status >= 500 ? 503 : 502);
      expect(error.message).not.toContain(TEST_KEY);
      expect(error.message).not.toContain("private");
    },
  );

  it("rejects unsafe model configuration without making a request", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    vi.stubEnv("GEMINI_MODEL", "https://attacker.invalid/model");
    await expect(call()).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not accept an empty or whitespace-only secret", async () => {
    vi.stubEnv("GEMINI_API_KEY", " \t ");
    await expect(call()).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses a completed interaction, not an arbitrary top-level text field", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...interactionResponse(SYNTHETIC_TRANSCRIPT),
          output_text: "untrusted shortcut",
        }),
      ),
    );
    await expect(call()).resolves.toEqual(SYNTHETIC_TRANSCRIPT);
  });
});
