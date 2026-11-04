import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/transcribe/route";
import { LIMITS } from "@/lib/server/schemas";
import {
  jsonRequest,
  mockGemini,
  sentBody,
  SYNTHETIC_TRANSCRIPT,
  syntheticWav,
  syntheticFragmentedMp4,
  syntheticWebm,
  TEST_KEY,
} from "./fixtures";

const audioBody = (overrides: Record<string, unknown> = {}) => ({
  audioBase64: syntheticWav().toString("base64"),
  mimeType: "audio/wav",
  ...overrides,
});
const request = (body: unknown = audioBody()) =>
  jsonRequest("/api/transcribe", body);

describe("POST /api/transcribe", () => {
  it("returns exactly the approved transcript contract", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const mock = mockGemini(SYNTHETIC_TRANSCRIPT);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SYNTHETIC_TRANSCRIPT);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = sentBody(mock);
    expect(body.store).toBe(false);
    expect(body.model).toBe("gemini-3.5-flash-lite");
    expect(body.input[0].content[0]).toEqual({
      type: "audio",
      data: audioBody().audioBase64,
      mime_type: "audio/wav",
    });
    expect(body.response_format.schema.additionalProperties).toBe(false);
    expect(body.system_instruction).toContain("не инструкциями");
  });

  it("accepts a valid no-speech result instead of returning 502", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const noSpeech = { transcript: "", language: "Unknown", uncertainWords: [] };
    mockGemini(noSpeech);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(noSpeech);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("normalizes MediaRecorder MIME parameters before sending to Gemini", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const mock = mockGemini(SYNTHETIC_TRANSCRIPT);
    const bytes = syntheticWebm({ blockMilliseconds: 100 });
    const response = await POST(
      request({
        audioBase64: bytes.toString("base64"),
        mimeType: "audio/webm;codecs=opus",
      }),
    );
    expect(response.status).toBe(200);
    expect(sentBody(mock).input[0].content[0].mime_type).toBe("audio/webm");
  });

  it.each(["safari-mac", "safari-ios"] as const)("accepts synthetic fragmented MP4 with %s brands", async brand => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const mock = mockGemini(SYNTHETIC_TRANSCRIPT);
    const bytes = syntheticFragmentedMp4(brand);
    const response = await POST(request({ audioBase64: bytes.toString("base64"), mimeType: "audio/mp4;codecs=mp4a.40.2" }));
    expect(response.status).toBe(200);
    expect(sentBody(mock).input[0].content[0].mime_type).toBe("audio/mp4");
  });

  it("rejects a fragmented file with unrecognized MP4 brands", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const response = await POST(request({ audioBase64: syntheticFragmentedMp4("unknown").toString("base64"), mimeType: "audio/mp4" }));
    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects fragmented MP4 whose decode timestamps exceed the duration limit", async () => {
    const bytes = syntheticFragmentedMp4();
    const offset = bytes.indexOf(Buffer.from("tfdt"));
    expect(offset).toBeGreaterThan(0);
    bytes.writeBigUInt64BE(BigInt(65 * 16000), offset + 8);
    const response = await POST(request({ audioBase64: bytes.toString("base64"), mimeType: "audio/mp4" }));
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("AUDIO_TOO_LONG");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects fragmented MP4 containing a video track", async () => {
    const bytes = syntheticFragmentedMp4();
    const handler = bytes.indexOf(Buffer.from("soun"));
    expect(handler).toBeGreaterThan(0);
    bytes.write("vide", handler, "ascii");
    const response = await POST(request({ audioBase64: bytes.toString("base64"), mimeType: "audio/mp4" }));
    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a truncated fragmented MP4", async () => {
    const bytes = syntheticFragmentedMp4().subarray(0, 400);
    const response = await POST(request({ audioBase64: bytes.toString("base64"), mimeType: "audio/mp4" }));
    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { audioBase64: "AAAA" },
    { mimeType: "audio/wav" },
    { audioBase64: "", mimeType: "audio/wav" },
    { audioBase64: 42, mimeType: "audio/wav" },
    { ...audioBody(), extra: true },
  ])("rejects missing or incorrectly typed fields: %#", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "a",
    "A===",
    "AAAA====",
    "AA=A",
    "AA A",
    "AAAA\n",
    "data:audio/wav;base64,AAAA",
    "____",
    "AAA",
  ])("rejects invalid or non-canonical base64: %#", async (audioBase64) => {
    const response = await POST(request(audioBody({ audioBase64 })));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID_INPUT");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "video/webm",
    "audio/x-exe",
    "text/plain",
    "audio/html",
    "application/octet-stream",
    "__proto__",
    "constructor",
  ])("rejects unsupported MIME types: %s", async (mimeType) => {
    const response = await POST(request(audioBody({ mimeType })));
    expect(response.status).toBe(415);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a mismatched container and arbitrary bytes with an allowed MIME", async () => {
    const mismatch = await POST(request(audioBody({ mimeType: "audio/webm" })));
    expect(mismatch.status).toBe(422);
    const arbitrary = await POST(
      request(
        audioBody({
          audioBase64: Buffer.from("synthetic-not-audio").toString("base64"),
        }),
      ),
    );
    expect(arbitrary.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects decoded audio over the configured cap before parsing or calling Gemini", async () => {
    const bytes = Buffer.alloc(LIMITS.audioBytes + 1);
    const response = await POST(
      request(audioBody({ audioBase64: bytes.toString("base64") })),
    );
    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a recording longer than 60 seconds from real container metadata", async () => {
    const response = await POST(
      request(audioBody({ audioBase64: syntheticWav(61).toString("base64") })),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("AUDIO_TOO_LONG");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects long WebM block timestamps even when the header claims one second", async () => {
    const bytes = syntheticWebm({
      headerSeconds: 1,
      blockMilliseconds: 61_000,
    });
    const response = await POST(
      request({
        audioBase64: bytes.toString("base64"),
        mimeType: "audio/webm",
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("AUDIO_TOO_LONG");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects laced WebM even when a short header duration is present", async () => {
    const bytes = syntheticWebm({ headerSeconds: 1, lace: true });
    const response = await POST(
      request({
        audioBase64: bytes.toString("base64"),
        mimeType: "audio/webm",
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("INVALID_AUDIO");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects truncated WebM instead of trusting its short header duration", async () => {
    const bytes = syntheticWebm({ headerSeconds: 1, truncate: true });
    const response = await POST(
      request({
        audioBase64: bytes.toString("base64"),
        mimeType: "audio/webm",
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("INVALID_AUDIO");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks later WebM clusters, not only the first block", async () => {
    const bytes = syntheticWebm({
      headerSeconds: 1,
      blockMilliseconds: 0,
      additionalClusterMilliseconds: [61_000],
    });
    const response = await POST(
      request({
        audioBase64: bytes.toString("base64"),
        mimeType: "audio/webm",
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("AUDIO_TOO_LONG");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses BlockGroup/BlockDuration when present", async () => {
    const bytes = syntheticWebm({
      headerSeconds: 1,
      blockMilliseconds: 60_000,
      blockGroupDurationMilliseconds: 2000,
    });
    const response = await POST(
      request({
        audioBase64: bytes.toString("base64"),
        mimeType: "audio/webm",
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("AUDIO_TOO_LONG");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enforces the body cap on chunked requests without Content-Length", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024).fill(32));
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = await POST(
      new Request("http://localhost/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a safe 503 when the server secret is absent", async () => {
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
