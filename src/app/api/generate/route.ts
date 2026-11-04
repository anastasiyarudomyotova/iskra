import { ERRORS } from "@/lib/server/api-errors";
import { generateStructured } from "@/lib/server/gemini";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { answersPrompt, GENERATE_INSTRUCTION } from "@/lib/server/prompts";
import {
  generateRequestSchema,
  generateResponseSchema,
  LIMITS,
} from "@/lib/server/schemas";

// Cache Components in Next.js 16 enforces the default Node.js runtime.
// A `runtime` segment export is intentionally omitted (it is unsupported here).
export async function POST(request: Request): Promise<Response> {
  try {
    const body = generateRequestSchema.safeParse(
      await readJson(request, LIMITS.generateBodyBytes),
    );
    if (!body.success) throw ERRORS.input();
    const result = await generateStructured({
      systemInstruction: GENERATE_INSTRUCTION,
      content: [{ type: "text", text: answersPrompt(body.data.answers) }],
      schema: generateResponseSchema,
      maxOutputTokens: 8192,
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
