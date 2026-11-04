import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/draft/route";
import { jsonRequest, mockGemini, sentBody, SYNTHETIC_ANSWERS, TEST_KEY } from "./fixtures";
import { topics } from "@/lib/server/completeness";
const request = (answers: unknown = SYNTHETIC_ANSWERS) => jsonRequest("/api/draft", { answers });
const sample = () => ({ sections: [
  { topic: "daily_tasks", items: [{ text: "Проверять учебные отчёты и отвечать на вопросы команды.", source_topic: "daily_tasks", evidence: SYNTHETIC_ANSWERS.daily_tasks }] },
  { topic: "current_project", items: [{ text: "Работать с учебным каталогом товаров.", source_topic: "current_project", evidence: SYNTHETIC_ANSWERS.current_project }] },
  { topic: "next_six_months", items: [{ text: "Продолжать развитие каталога и добавить поиск по категориям.", source_topic: "next_six_months", evidence: SYNTHETIC_ANSWERS.next_six_months }] },
  { topic: "tools_and_knowledge", items: [{ text: "Использовать табличный редактор и основы работы с данными.", source_topic: "tools_and_knowledge", evidence: SYNTHETIC_ANSWERS.tools_and_knowledge }] },
] });

describe("POST /api/draft", () => {
  it("returns a synthetic professional rewrite, grounded in the four answers", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); vi.stubEnv("GEMINI_MODEL", "another-model"); const mock = mockGemini(sample());
    const response = await POST(request()); expect(response.status).toBe(200); const result = await response.json(); expect(result).toEqual(sample());
    expect(result.sections.map((s: { topic: string }) => s.topic)).toEqual(topics);
    expect(result.sections[0].items[0].text).not.toBe(SYNTHETIC_ANSWERS.daily_tasks);
    expect(JSON.stringify(result.sections.map((s: { items: { text: string }[] }) => s.items.map(i => i.text)))).not.toMatch(/зарплат|Москва|должность|опыт/i);
    const sent = sentBody(mock); expect(sent.model).toBe("gemini-3.5-flash-lite"); expect(sent.store).toBe(false); expect(sent.background).toBe(false);
    expect(sent.system_instruction).toContain("Не выдумывай");
  });
  it("accepts a section without facts", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); const result = sample(); result.sections[2].items = []; mockGemini(result);
    expect((await POST(request())).status).toBe(200);
  });
  it.each(["invented evidence", "invented number", "invented city", "duplicate", "extra field"])("rejects %s", async mode => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); const result = sample(); const item = result.sections[0].items[0];
    if (mode === "invented evidence") item.evidence = "вымышленная зарплата";
    if (mode === "invented number") item.text = "Проверять 300 отчётов.";
    if (mode === "invented city") item.text = "Работать в Москве.";
    if (mode === "duplicate") result.sections[1].topic = result.sections[0].topic;
    if (mode === "extra field") Object.assign(item, { salary: "100000" });
    mockGemini(result); const response = await POST(request()); expect(response.status).toBe(502); expect((await response.json()).code).toBe("INVALID_MODEL_OUTPUT");
  });
  it("fails safely on provider error and invalid input", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); vi.stubGlobal("fetch", vi.fn(async () => new Response("provider secret", { status: 500 })));
    const response = await POST(request()); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("provider secret");
    expect((await POST(request({ ...SYNTHETIC_ANSWERS, daily_tasks: "" }))).status).toBe(400);
  });
});
