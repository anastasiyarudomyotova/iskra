import { withAiAdmission } from "@/lib/server/ai-limiter";
import { ERRORS } from "@/lib/server/api-errors";
import { completenessRequestSchema, completenessResponseSchema, COMPLETENESS_INSTRUCTION, validAssessment } from "@/lib/server/completeness";
import { assertGeminiConfigured, generateStructured } from "@/lib/server/gemini";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/schemas";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = completenessRequestSchema.safeParse(await readJson(request, LIMITS.generateBodyBytes));
    if (!body.success) throw ERRORS.input();
    assertGeminiConfigured();
    const result = await withAiAdmission(request, "completeness", body.data, terminal => generateStructured({
      onTerminal: terminal,
      model: "gemini-3.5-flash-lite", systemInstruction: COMPLETENESS_INSTRUCTION,
      content: [{ type: "text", text: `Оцени только этот текст черновика:\n${JSON.stringify(body.data.draft)}` }],
      schema: completenessResponseSchema, maxOutputTokens: 4096,
    }));
    if (!validAssessment(result, body.data.draft)) throw ERRORS.malformed();
    return jsonResponse(result);
  } catch (error) { return errorResponse(error); }
}
