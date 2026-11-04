import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/draft/route";
import { jsonRequest, mockGemini, sentBody, SYNTHETIC_ANSWERS, TEST_KEY } from "./fixtures";
const request = (answers: unknown = SYNTHETIC_ANSWERS) => jsonRequest("/api/draft", { answers });
const sample = () => ({ blocks: [
  { heading: null, type: "paragraph", items: [{ text: "Работать с учебным каталогом товаров.", source_topic: "current_project", evidence: SYNTHETIC_ANSWERS.current_project }] },
  { heading: "Обязанности", type: "bullet_list", items: [
    { text: "Проверять учебные отчёты и отвечать на вопросы команды.", source_topic: "daily_tasks", evidence: SYNTHETIC_ANSWERS.daily_tasks },
    { text: "Продолжать развитие каталога и добавить поиск по категориям.", source_topic: "next_six_months", evidence: SYNTHETIC_ANSWERS.next_six_months },
    { text: "Использовать табличный редактор и основы работы с данными.", source_topic: "tools_and_knowledge", evidence: SYNTHETIC_ANSWERS.tools_and_knowledge },
  ] },
] });
describe("POST /api/draft", () => {
  it("returns a grounded professional vacancy document, not four answer sections", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); const mock = mockGemini(sample()); const response = await POST(request());
    expect(response.status).toBe(200); const result = await response.json(); expect(result).toEqual(sample()); expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].items[0].text).not.toBe(SYNTHETIC_ANSWERS.current_project);
    expect(JSON.stringify(result.blocks)).not.toMatch(/зарплат|Москва|должность|опыт/i);
    const sent = sentBody(mock); expect(sent.model).toBe("gemini-3.5-flash-lite"); expect(sent.store).toBe(false); expect(sent.background).toBe(false); expect(sent.system_instruction).toContain("Не выдумывай");
  });
  it.each(["invented evidence", "invented number", "invented city", "extra field", "invented heading", "multiple paragraph items", "empty blocks"])("rejects %s", async mode => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); const result = sample(); const item = result.blocks[0].items[0];
    if (mode === "invented evidence") item.evidence = "вымышленная зарплата";
    if (mode === "invented number") item.text = "Проверять 300 отчётов.";
    if (mode === "invented city") item.text = "Работать в Москве.";
    if (mode === "extra field") Object.assign(item, { salary: "100000" });
    if (mode === "invented heading") result.blocks[0].heading = "Зарплата";
    if (mode === "multiple paragraph items") result.blocks[0].items.push(item);
    if (mode === "empty blocks") result.blocks = [];
    mockGemini(result); const response = await POST(request()); expect(response.status).toBe(502); expect((await response.json()).code).toBe("INVALID_MODEL_OUTPUT");
  });
  it("logs only the provider HTTP status for diagnosis", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(`private ${TEST_KEY}`, { status: 400 })));
      const response = await POST(request());
      expect(response.status).toBe(502);
      expect((await response.json()).code).toBe("UPSTREAM_ERROR");
      expect(log).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith("Gemini draft upstream HTTP status:", 400);
    } finally {
      log.mockRestore();
    }
  });
  it("fails safely on provider error and invalid input", async () => {
    vi.stubEnv("GEMINI_API_KEY", TEST_KEY); vi.stubGlobal("fetch", vi.fn(async () => new Response("provider secret", { status: 500 })));
    const response = await POST(request()); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("provider secret");
    expect((await POST(request({ ...SYNTHETIC_ANSWERS, daily_tasks: "" }))).status).toBe(400);
  });
});
