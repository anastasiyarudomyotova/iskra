import { describe, expect, it } from "vitest";
import { sectionsFromGenerated, serializeDraft } from "@/lib/draft";
import { SYNTHETIC_ANSWERS } from "./fixtures";

describe("draft formatting", () => {
  it("uses only answers and copies readable plain headings and bullets", () => {
    const answers = Object.values(SYNTHETIC_ANSWERS); const topics = ["daily_tasks", "current_project", "next_six_months", "tools_and_knowledge"] as const; const sections = sectionsFromGenerated(topics.map((topic, i) => ({ topic, items: [{ text: answers[i] }] })));
    expect(sections).toEqual(answers);
    const text = serializeDraft(sections);
    for (const answer of answers) expect(text).toContain(answer);
    expect(text).toContain("Ежедневные задачи\n• "); expect(text).toContain("Планы на полгода\n• ");
    for (const invented of ["Зарплата", "Должность", "Москва", "Опыт"]) expect(text).not.toContain(invented);
    expect(text).not.toMatch(/<[^>]+>|^#{1,6} /m);
  });
  it("copies current edits and does not add facts to empty sections", () => {
    const text = serializeDraft(["Изменённый текст\nВторая строка", "", "", ""]);
    expect(text).toContain("• Изменённый текст\n• Вторая строка"); expect(text).not.toContain("Не указано");
  });
});
