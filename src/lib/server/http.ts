import "server-only";

import { ApiError, ERRORS } from "./api-errors";

export const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;

export function jsonResponse(body: unknown, status = 200, retryAfter?: number) {
  const headers = new Headers(RESPONSE_HEADERS);
  if (retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
  return Response.json(body, { status, headers });
}

/** Read at most maxBytes; never rely on the spoofable Content-Length header. */
export async function readBoundedText(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw ERRORS.payloadTooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    // A transport failure is not a validation result and must not be logged.
    throw error instanceof ApiError ? error : ERRORS.json();
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw ERRORS.json();
  }
}

export async function readJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Используйте Content-Type: application/json.",
    );
  }
  const declaredSize = request.headers.get("content-length");
  if (
    declaredSize &&
    /^\d+$/.test(declaredSize) &&
    Number(declaredSize) > maxBytes
  ) {
    throw ERRORS.payloadTooLarge();
  }
  if (!request.body) throw ERRORS.json();

  const text = await readBoundedText(request.body, maxBytes);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw ERRORS.json();
  }
}

export function errorResponse(error: unknown): Response {
  // Do not serialize unknown errors: they may contain a key or submitted data.
  const safe = error instanceof ApiError ? error : ERRORS.unavailable();
  return jsonResponse(
    { error: safe.message, code: safe.code, retryable: safe.retryable },
    safe.status,
    safe.retryAfterSeconds,
  );
}
