// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { fireEvent } from "@testing-library/react";
import StarterKit from "@tiptap/starter-kit";
import { plainText } from "@/lib/draft";

describe("editor schema safety", () => {
  it("sanitizes clipboard HTML on paste through the editor", () => {
    const editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit.configure({ heading: { levels: [2] }, link: false })], content: "<p></p>" });
    try {
      fireEvent.paste(editor.view.dom, { clipboardData: { getData: (type: string) => type === "text/html" ? '<p onclick="alert(1)"><a href="javascript:alert(1)">Учебный текст</a><img src=x onerror="alert(1)"></p>' : type === "text/plain" ? "Учебный текст" : "", files: [] } });
      expect(editor.getHTML()).toContain("Учебный текст");
      expect(editor.getHTML()).not.toMatch(/<a\b|<img\b|onclick|onerror|javascript:/i);
    } finally { editor.destroy(); }
  });
  it("discards unsafe elements and URL/event attributes from inserted HTML", () => {
    const editor = new Editor({ extensions: [StarterKit.configure({ heading: { levels: [2] }, link: false })], content: "<p>Начало</p>" });
    try {
      editor.commands.setContent('<h2 onclick="alert(1)">Учебный заголовок</h2><p><a href="javascript:alert(1)" onmouseover="alert(1)">Текст</a><img src=x onerror="alert(1)"></p><ul><li>Пункт</li></ul>');
      const html = editor.getHTML();
      expect(html).not.toMatch(/<a\b|<img\b|onclick|onerror|onmouseover|javascript:/i);
      expect(html).toContain("<h2>Учебный заголовок</h2>");
      expect(plainText(editor.getJSON())).toContain("• Пункт");
    } finally { editor.destroy(); }
  });
});
