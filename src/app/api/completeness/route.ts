import { ERRORS } from "@/lib/server/api-errors";
import { completenessRequestSchema, completenessResponseSchema, COMPLETENESS_INSTRUCTION, validAssessment } from "@/lib/server/completeness";
import { generateStructured } from "@/lib/server/gemini";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { LIMITS } from "@/lib/server/schemas";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = completenessRequestSchema.safeParse(await readJson(request, LIMITS.generateBodyBytes));
    if (!body.success) throw ERRORS.input();
    const result = await generateStructured({
      model: "gemini-3.5-flash-lite", systemInstruction: COMPLETENESS_INSTRUCTION,
      content: [{ type: "text", text: `Оцени только эти ответы:\n${JSON.stringify(body.data.answers)}` }],
      schema: completenessResponseSchema, maxOutputTokens: 4096,
    });
    if (!validAssessment(result, body.data.answers)) throw ERRORS.malformed();
    return jsonResponse(result);
  } catch (error) { return errorResponse(error); }
}
