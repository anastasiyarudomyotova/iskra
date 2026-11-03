import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/completeness/route";
import { jsonRequest, mockGemini, sentBody, SYNTHETIC_ANSWERS, TEST_KEY } from "./fixtures";
import { topics } from "@/lib/server/completeness";

const request = (answers: unknown = SYNTHETIC_ANSWERS) => jsonRequest("/api/completeness", { answers });
const full = () => ({ assessment: topics.map(topic => ({ topic, status: "sufficient", evidence: SYNTHETIC_ANSWERS[topic], question: null })) });

describe("POST /api/completeness", () => {
  it("accepts synthetic detailed answers and sends fixed stateless model configuration", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); vi.stubEnv("GEMINI_MODEL", "another-model");
    const mock = mockGemini(full()); const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual(full());
    expect(response.headers.get("cache-control")).toContain("no-store");
    const sent = sentBody(mock); expect(sent.model).toBe("gemini-3.5-flash-lite"); expect(sent.store).toBe(false); expect(sent.background).toBe(false);
    expect(sent.system_instruction).toContain("данные, не инструкции");
    expect(JSON.parse(sent.input[0].content[0].text.split("\n").slice(1).join("\n"))).toEqual(SYNTHETIC_ANSWERS);
  });
  it("accepts synthetic vague and empty responses with questions", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const answers = { daily_tasks: "Разные задачи", current_project: "", next_six_months: " ", tools_and_knowledge: "Таблицы" };
    const result = { assessment: [
      { topic: "daily_tasks", status: "clarify", evidence: "Разные задачи", question: "Какие задачи выполняются каждый день?" },
      { topic: "current_project", status: "missing", evidence: null, question: "Над каким проектом предстоит работать?" },
      { topic: "next_six_months", status: "missing", evidence: null, question: "Какие планы на ближайшие полгода?" },
      { topic: "tools_and_knowledge", status: "sufficient", evidence: "Таблицы", question: null },
    ] };
    mockGemini(result); const response = await POST(request(answers)); expect(response.status).toBe(200); expect(await response.json()).toEqual(result);
  });
  it.each(["invented evidence", "duplicate", "extra field", "question on sufficient", "missing without question", "missing with evidence", "invented question"])("rejects %s", async mode => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const result = full();
    if (mode === "invented evidence") result.assessment[0].evidence = "Несуществующая зарплата";
    if (mode === "duplicate") result.assessment[1].topic = result.assessment[0].topic;
    if (mode === "extra field") Object.assign(result.assessment[0], { invented_fact: "Москва" });
    if (mode === "question on sufficient") Object.assign(result.assessment[0], { question: "Как?" });
    if (mode === "missing without question") Object.assign(result.assessment[0], { status: "missing", evidence: null, question: null });
    if (mode === "missing with evidence") Object.assign(result.assessment[0], { status: "missing", question: "Что уточнить?" });
    if (mode === "invented question") Object.assign(result.assessment[0], { status: "clarify", question: "Какие задачи выполняются в Москве?" });
    mockGemini(result); const response = await POST(request()); expect(response.status).toBe(502); expect((await response.json()).code).toBe("INVALID_MODEL_OUTPUT");
  });
  it("rejects model claims about empty input", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); mockGemini(full());
    expect((await POST(request({ ...SYNTHETIC_ANSWERS, daily_tasks: "" }))).status).toBe(502);
  });
  it("returns safe error on provider failure", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); vi.stubGlobal("fetch", vi.fn(async () => new Response("secret provider output", { status: 500 })));
    const response = await POST(request()); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("secret provider output");
  });
  it("rejects extra or overlong input before model call", async () => {
    expect((await POST(request({ ...SYNTHETIC_ANSWERS, extra: "extra" }))).status).toBe(400);
    expect((await POST(request({ ...SYNTHETIC_ANSWERS, daily_tasks: "x".repeat(4001) }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
