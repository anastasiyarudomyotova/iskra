import "server-only";

import { z } from "zod";

export const LIMITS = {
  audioBytes: 4 * 1024 * 1024,
  audioDurationSeconds: 60,
  // Allow the container's final partial audio frame without extending the UI limit.
  audioDurationToleranceSeconds: 0.25,
  transcribeBodyBytes: 6 * 1024 * 1024,
  generateBodyBytes: 64 * 1024,
  answerCharacters: 4000,
  geminiResponseBytes: 256 * 1024,
  geminiTimeoutMs: 30_000,
} as const;

export const AUDIO_MIME_TYPES: Readonly<Record<string, string>> = {
  "audio/webm": "audio/webm",
  "audio/ogg": "audio/ogg",
  "application/ogg": "audio/ogg",
  "audio/mp4": "audio/mp4",
  "audio/m4a": "audio/m4a",
  "audio/x-m4a": "audio/m4a",
  "audio/mpeg": "audio/mpeg",
  "audio/mp3": "audio/mp3",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/aac": "audio/aac",
  "audio/flac": "audio/flac",
  "audio/x-flac": "audio/flac",
  "audio/aiff": "audio/aiff",
  "audio/x-aiff": "audio/aiff",
};

const shortText = (max: number) => z.string().trim().min(1).max(max);
const textList = (maxItems: number, maxLength: number) =>
  z.array(shortText(maxLength)).max(maxItems);

export const transcribeRequestSchema = z.strictObject({
  audioBase64: z
    .string()
    .min(1)
    .max(4 * Math.ceil(LIMITS.audioBytes / 3)),
  mimeType: z.string().min(1).max(128),
});

export const generateRequestSchema = z.strictObject({
  answers: z.strictObject({
    daily_tasks: shortText(LIMITS.answerCharacters),
    current_project: shortText(LIMITS.answerCharacters),
    next_six_months: shortText(LIMITS.answerCharacters),
    tools_and_knowledge: shortText(LIMITS.answerCharacters),
  }),
});

export const transcriptSchema = z.strictObject({
  transcript: shortText(12_000),
  language: shortText(80),
  uncertainWords: textList(100, 200),
});

export const vacancySchema = z.strictObject({
  position_title: shortText(300),
  summary: shortText(4000),
  responsibilities: textList(30, 1000),
  project_context: shortText(6000),
  tools_and_knowledge: textList(50, 500),
  missing_information: textList(30, 1000),
  vacancy_text: shortText(20_000),
});

export const generateResponseSchema = z.strictObject({
  vacancy: vacancySchema,
});

export type TranscribeRequest = z.infer<typeof transcribeRequestSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type GenerateResponse = z.infer<typeof generateResponseSchema>;

/** The provider gets the same strict shape that we subsequently enforce locally. */
export function modelJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, {
    target: "draft-7",
    io: "output",
  });
  delete jsonSchema.$schema;
  return jsonSchema;
}
