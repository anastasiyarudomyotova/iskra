// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Home from "@/app/page";

afterEach(() => { cleanup(); Reflect.deleteProperty(navigator, "clipboard"); });
const text = "Вымышленный учебный ответ для проверки.";
const result = { blocks: [{ heading: "Обязанности", type: "bullet_list", items: [{ text: "Проверять учебные отчёты." }] }] };
const assessment = { assessment: ["daily_tasks", "current_project", "next_six_months", "tools_and_knowledge"].map(topic => ({ topic, status: "missing", evidence: null, question: "Что уточнить?" })) };

async function openDraft() {
  render(React.createElement(Home));
  fireEvent.click(screen.getByRole("button", { name: "Начать создание" }));
  for (let i = 0; i < 4; i++) {
    fireEvent.change(screen.getByRole("textbox", { name: /Текст ответа/ }), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: i === 3 ? /Создать черновик/ : /Подтвердить и далее/ }));
  }
  return await screen.findByRole("textbox", { name: "Текст вакансии" });
}

describe("review and copy behavior", () => {
  it("ignores a stale review after edits and copies current text when review fails", async () => {
    let resolveReview!: (r: Response) => void;
    const fetchMock = vi.fn(async (path: string | URL | Request, init?: RequestInit) => {
      void init;
      if (path === "/api/draft") return Response.json(result);
      return new Promise<Response>(r => { resolveReview = r; });
    });
    vi.stubGlobal("fetch", fetchMock);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.stubGlobal("ClipboardItem", undefined);
    const editor = await openDraft();
    fireEvent.paste(editor, { clipboardData: { getData: (type: string) => type === "text/plain" ? "Новая учебная правка" : "", files: [] } });
    await screen.findByText("Черновик изменён. Проверка устарела.");
    await act(async () => { resolveReview(Response.json(assessment)); });
    expect(screen.queryByText("Нет данных")).toBeNull();
    const retry = screen.getByRole("button", { name: "Проверить заново" });
    fireEvent.click(retry); fireEvent.click(retry);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sent = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(sent.draft).toContain("Новая учебная правка");
    await act(async () => { resolveReview(new Response(null, { status: 503 })); });
    expect(await screen.findByText(/Не удалось проверить черновик/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Скопировать как есть" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain("Новая учебная правка");
  });

  it("does not let a delayed regeneration overwrite a manual edit", async () => {
    let finish!: (value: Response) => void; let draftCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (path: string | URL | Request) => {
      if (path !== "/api/draft") return new Response(null, { status: 503 });
      if (++draftCalls === 1) return Response.json(result);
      return new Promise<Response>(resolve => { finish = resolve; });
    }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await openDraft();
    fireEvent.click(screen.getByRole("button", { name: /К ответам/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Текст ответа/ }), { target: { value: "Изменённый вымышленный ответ для проверки." } });
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к черновику" }));
    fireEvent.click(screen.getByRole("button", { name: "Обновить черновик из ответов" }));
    const editor = screen.getByRole("textbox", { name: "Текст вакансии" });
    fireEvent.paste(editor, { clipboardData: { getData: (type: string) => type === "text/plain" ? "Ручная правка" : "", files: [] } });
    await screen.findByText(/Создание отменено/);
    await act(async () => { finish(Response.json({ blocks: [{ heading: null, type: "paragraph", items: [{ text: "Опоздавший результат" }] }] })); });
    expect(editor.textContent).toContain("Ручная правка");
    expect(editor.textContent).not.toContain("Опоздавший результат");
  });

  it("tries plain text after HTML clipboard failure and reports denied clipboard", async () => {
    vi.stubGlobal("fetch", vi.fn(async (path: string | URL | Request) => path === "/api/draft" ? Response.json(result) : new Response(null, { status: 503 })));
    const write = vi.fn().mockRejectedValue(new Error("denied"));
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write, writeText } });
    vi.stubGlobal("ClipboardItem", class { constructor(public data: Record<string, Blob>) {} });
    await openDraft();
    fireEvent.click(screen.getByRole("button", { name: "Скопировать как есть" }));
    expect(await screen.findByText(/Не удалось скопировать текст/)).toBeTruthy();
    expect(write).toHaveBeenCalledOnce(); expect(writeText).toHaveBeenCalledOnce();
    expect(Object.keys(write.mock.calls[0][0][0].data)).toEqual(["text/html", "text/plain"]);
    expect(writeText.mock.calls[0][0]).toContain("• Проверять учебные отчёты.");
  });
});
