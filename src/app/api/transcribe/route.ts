import { withAiAdmission } from "@/lib/server/ai-limiter";
import { ERRORS } from "@/lib/server/api-errors";
import { validateAudio } from "@/lib/server/audio";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { assertGeminiConfigured, generateStructured } from "@/lib/server/gemini";
import { TRANSCRIBE_INSTRUCTION } from "@/lib/server/prompts";
import {
  LIMITS,
  transcribeRequestSchema,
  transcriptSchema,
} from "@/lib/server/schemas";

// Cache Components in Next.js 16 enforces the default Node.js runtime.
// A `runtime` segment export is intentionally omitted (it is unsupported here).
export async function POST(request: Request): Promise<Response> {
  try {
    const body = transcribeRequestSchema.safeParse(
      await readJson(request, LIMITS.transcribeBodyBytes),
    );
    if (!body.success) throw ERRORS.input();
    const audio = await validateAudio(
      body.data.audioBase64,
      body.data.mimeType,
    );
    assertGeminiConfigured();
    const result = await withAiAdmission(request, "transcribe", body.data, terminal => generateStructured({
      onTerminal: terminal,
      systemInstruction: TRANSCRIBE_INSTRUCTION,
      content: [
        { type: "audio", data: audio.data, mime_type: audio.mimeType },
        {
          type: "text",
          text: "Расшифруй эту запись строго по системным правилам и JSON-схеме.",
        },
      ],
      schema: transcriptSchema,
      maxOutputTokens: 4096,
    }));
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
