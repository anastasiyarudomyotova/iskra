import "server-only";

import { z } from "zod";
import { ApiError, ERRORS } from "./api-errors";
import { readBoundedText } from "./http";
import { LIMITS, modelJsonSchema } from "./schemas";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
// Fixed HTTPS origin: neither a caller nor an environment variable can redirect
// the credential to another host. The key is a header, never a query parameter.
const INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

type Content =
  | { type: "text"; text: string }
  | { type: "audio"; data: string; mime_type: string };

function configuration(modelOverride?: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const configuredModel = process.env.GEMINI_MODEL?.trim();
  const model = modelOverride || configuredModel || DEFAULT_GEMINI_MODEL;
  if (
    (configuredModel && configuredModel !== DEFAULT_GEMINI_MODEL) ||
    model !== DEFAULT_GEMINI_MODEL ||
    !apiKey ||
    apiKey.length > 512 ||
    /\s/.test(apiKey) ||
    !/^[a-z0-9][a-z0-9.-]{0,127}$/i.test(model)
  ) {
    // Deliberately do not distinguish a missing, expired or invalid secret.
    throw ERRORS.unavailable();
  }
  return { apiKey, model };
}

/** Check availability before spending limiter quota. */
export function assertGeminiConfigured() { configuration(); }

function retryAfter(response: Response): number {
  const value = response.headers.get("retry-after");
  if (!value) return 30;
  const seconds = /^\d+$/.test(value)
    ? Number(value)
    : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.min(300, Math.max(1, seconds)) : 30;
}

const interactionSchema = z.looseObject({
  status: z.literal("completed"),
  steps: z.array(
    z.looseObject({ type: z.string(), content: z.unknown().optional() }),
  ),
});
const textContentSchema = z.looseObject({
  type: z.literal("text"),
  text: z.string(),
});

function outputText(payload: unknown): string {
  const interaction = interactionSchema.safeParse(payload);
  if (!interaction.success) throw ERRORS.malformed();
  const output = interaction.data.steps.findLast(
    (step) => step.type === "model_output",
  );
  if (!output || !Array.isArray(output.content) || output.content.length === 0)
    throw ERRORS.malformed();
  const parts = output.content.map((part) => textContentSchema.safeParse(part));
  if (parts.some((part) => !part.success)) throw ERRORS.malformed();
  const text = parts
    .map((part) => part.data!.text)
    .join("")
    .trim();
  if (!text) throw ERRORS.malformed();
  return text;
}

/** One stateless, non-streaming Interactions request; no SDK telemetry or retries. */
export async function generateStructured<T>(options: {
  systemInstruction: string;
  content: Content[];
  schema: z.ZodType<T>;
  modelSchema?: z.ZodType;
  logUpstreamStatus?: boolean;
  maxOutputTokens: number;
  model?: string;
  onTerminal?: () => void;
}): Promise<T> {
  const { apiKey, model } = configuration(options.model);
  const controller = new AbortController();
  const deadline = setTimeout(
    () => controller.abort(new DOMException("Gemini deadline", "TimeoutError")),
    LIMITS.geminiTimeoutMs,
  );
  let response: Response;
  try {
    response = await fetch(INTERACTIONS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model,
        store: false,
        background: false,
        system_instruction: options.systemInstruction,
        input: [{ type: "user_input", content: options.content }],
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: modelJsonSchema(options.modelSchema ?? options.schema),
        },
        generation_config: {
          max_output_tokens: options.maxOutputTokens,
          thinking_level: "low",
        },
      }),
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(deadline);
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    )
      throw ERRORS.timeout();
    throw ERRORS.upstream();
  }

  try {
    if (!response.ok) {
      if (options.logUpstreamStatus) console.error("Gemini upstream status:", response.status);
      // Do not read or log provider error bodies: they can echo submitted data.
      await response.body?.cancel().catch(() => undefined);
      // HTTP errors may originate from a gateway while work continues.
      if (response.status === 429)
        throw ERRORS.rateLimited(retryAfter(response));
      if (response.status >= 500) throw ERRORS.upstream();
      throw new ApiError(
        502,
        "UPSTREAM_ERROR",
        "Сервис не смог обработать запрос. Попробуйте позже или введите ответ вручную.",
        true,
      );
    }

    let payload: unknown;
    try {
      if (!response.body) throw ERRORS.malformed();
      const text = await readBoundedText(response.body, LIMITS.geminiResponseBytes);
      payload = JSON.parse(text) as unknown;
      if (payload && typeof payload === "object" && "status" in payload &&
          typeof payload.status === "string" && ["completed", "failed", "cancelled", "incomplete"].includes(payload.status)) {
        options.onTerminal?.();
      }
    } catch {
      if (controller.signal.aborted) throw ERRORS.timeout();
      throw ERRORS.malformed();
    }
    let json: unknown;
    try {
      json = JSON.parse(outputText(payload)) as unknown;
    } catch {
      throw ERRORS.malformed();
    }
    const result = options.schema.safeParse(json);
    if (!result.success) throw ERRORS.malformed();
    return result.data;
  } finally {
    clearTimeout(deadline);
  }
}
