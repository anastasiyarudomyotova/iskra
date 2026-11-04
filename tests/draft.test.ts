import { describe, expect, it } from "vitest";
import { documentFromBlocks, plainText } from "@/lib/draft";

describe("single draft document", () => {
  it("builds flexible paragraphs and lists, not the four questions", () => {
    const doc = documentFromBlocks([
      { heading: null, type: "paragraph", items: [{ text: "Работа над учебным каталогом." }] },
      { heading: "Обязанности", type: "bullet_list", items: [{ text: "Проверять отчёты." }, { text: "Отвечать команде." }] },
    ]);
    expect(plainText(doc)).toBe("Работа над учебным каталогом.\n\nОбязанности\n\n• Проверять отчёты.\n• Отвечать команде.");
    expect(plainText(doc)).not.toContain("Ежедневные задачи");
  });
  it("serializes manually formatted ordered lists and ignores inline marks", () => {
    const doc = { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Заголовок", marks: [{ type: "bold" }] }] }, { type: "orderedList", content: ["Раз", "Два"].map(text => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })) }] };
    expect(plainText(doc)).toBe("Заголовок\n\n1. Раз\n2. Два");
  });
});
