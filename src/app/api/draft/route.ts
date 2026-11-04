import { ERRORS } from "@/lib/server/api-errors";
import { draftResponseSchema, DRAFT_INSTRUCTION, validDraft } from "@/lib/server/draft-generation";
import { generateStructured } from "@/lib/server/gemini";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { generateRequestSchema, LIMITS } from "@/lib/server/schemas";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = generateRequestSchema.safeParse(await readJson(request, LIMITS.generateBodyBytes));
    if (!body.success) throw ERRORS.input();
    const result = await generateStructured({
      model: "gemini-3.5-flash-lite", systemInstruction: DRAFT_INSTRUCTION,
      content: [{ type: "text", text: `Составь черновик из этих ответов:\n${JSON.stringify(body.data.answers)}` }],
      schema: draftResponseSchema, maxOutputTokens: 8192,
    });
    if (!validDraft(result, body.data.answers)) throw ERRORS.malformed();
    return jsonResponse(result);
  } catch (error) { return errorResponse(error); }
}
