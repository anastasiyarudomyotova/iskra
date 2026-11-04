// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Home from "@/app/page";

const answer = "Это вымышленный ответ для тестирования.";
afterEach(() => { cleanup(); Reflect.deleteProperty(navigator, "mediaDevices"); });

function start() {
  render(React.createElement(Home));
  fireEvent.click(screen.getByRole("button", { name: "Начать создание" }));
  const field = screen.getByRole("textbox", { name: /Текст ответа/ }) as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: answer } });
  return field;
}

function stream() {
  const stop = vi.fn();
  return { media: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

class FakeRecorder {
  static latest: FakeRecorder;
  stream: MediaStream;
  mimeType = "audio/webm";
  state = "inactive";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor(media: MediaStream) { this.stream = media; FakeRecorder.latest = this; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
}
function mockRecorder() {
  const audio = stream();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue(audio.media) } });
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  return audio;
}

describe("intro navigation", () => {
  it("keeps the question layout invisible when returning to the intro", () => {
    const { container } = render(React.createElement(Home));
    const question = container.querySelector<HTMLElement>(".question-screen")!;
    expect(question.getAttribute("aria-hidden")).toBe("true");
    expect(question.hasAttribute("inert")).toBe(true);
    expect(question.style.opacity).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Начать создание" }));
    expect(question.getAttribute("aria-hidden")).toBe("false");
    expect(question.hasAttribute("inert")).toBe(false);
    expect(question.style.opacity).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /Назад/ }));
    expect(screen.getByRole("button", { name: "Начать создание" })).toBeTruthy();
    expect(question.getAttribute("aria-hidden")).toBe("true");
    expect(question.hasAttribute("inert")).toBe(true);
    expect(question.style.opacity).toBe("0");
  });
});

describe("voice negative paths", () => {
  it("keeps the answer on unsupported microphone and permission denial", async () => {
    const field = start();
    fireEvent.click(screen.getByRole("button", { name: "Записать ответ" }));
    expect(field.value).toBe(answer);
    expect(screen.getByText(/Запись не поддерживается/)).toBeTruthy();
    vi.stubGlobal("MediaRecorder", class {});
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) } });
    fireEvent.click(screen.getByRole("button", { name: /Попробовать снова/ }));
    await screen.findByText(/Не удалось начать запись/);
    expect(field.value).toBe(answer);
    expect(field.disabled).toBe(false);
  });

  it("locks pending permission and releases the stream if recorder construction fails", async () => {
    const field = start();
    let resolve!: (value: MediaStream) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(r => { resolve = r; }));
    const audio = stream();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    vi.stubGlobal("MediaRecorder", class { constructor() { throw new Error("unsupported"); } });
    const button = screen.getByRole("button", { name: "Записать ответ" });
    fireEvent.click(button); fireEvent.click(button);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolve(audio.media); });
    expect(audio.stop).toHaveBeenCalledOnce();
    expect(field.value).toBe(answer);
    expect(field.disabled).toBe(false);
    expect(screen.getByText(/Не удалось начать запись/)).toBeTruthy();
  });

  it("keeps the answer when recording emits an error or an empty blob", async () => {
    const audio = mockRecorder(); const field = start();
    fireEvent.click(screen.getByRole("button", { name: "Записать ответ" }));
    await screen.findByText("Идёт запись");
    act(() => FakeRecorder.latest.onerror?.());
    expect(screen.getByText(/Запись прервалась/)).toBeTruthy();
    expect(field.value).toBe(answer); expect(audio.stop).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Попробовать снова/ }));
    await screen.findByText("Идёт запись");
    fireEvent.click(screen.getByRole("button", { name: /Завершить запись/ }));
    expect(await screen.findByText(/Запись пуста/)).toBeTruthy();
    expect(field.value).toBe(answer); expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["timeout", "network", "empty transcript"])("keeps the answer on transcription %s", async (mode) => {
    mockRecorder(); const field = start();
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (mode === "network") throw new TypeError("network");
      return mode === "timeout" ? new Response(null, { status: 504 }) : Response.json({ transcript: "", uncertainWords: [] });
    }));
    fireEvent.click(screen.getByRole("button", { name: "Записать ответ" }));
    await screen.findByText("Идёт запись");
    act(() => FakeRecorder.latest.ondataavailable?.({ data: new Blob(["synthetic"]) }));
    fireEvent.click(screen.getByRole("button", { name: /Завершить запись/ }));
    await waitFor(() => expect(field.disabled).toBe(false));
    expect(field.value).toBe(answer);
    expect(screen.getByRole("alert").textContent).toMatch(/Попробуйте|подключение/);
  });

  it("releases a late stream after unmount", async () => {
    let resolve!: (value: MediaStream) => void;
    const audio = stream();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(() => new Promise<MediaStream>(r => { resolve = r; })) } });
    vi.stubGlobal("MediaRecorder", class {});
    start(); fireEvent.click(screen.getByRole("button", { name: "Записать ответ" }));
    cleanup();
    await act(async () => { resolve(audio.media); });
    expect(audio.stop).toHaveBeenCalledOnce();
  });
});

describe("generation requests", () => {
  it("prevents duplicate submission and retains answers after failure", async () => {
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(r => { resolve = r; }));
    vi.stubGlobal("fetch", fetchMock);
    const field = start();
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByRole("button", { name: /Подтвердить и далее/ }));
      fireEvent.change(field, { target: { value: answer } });
    }
    const button = screen.getByRole("button", { name: /Создать черновик/ });
    fireEvent.click(button); fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(new Response(null, { status: 503 })); });
    await waitFor(() => expect(screen.getByText(/ваши данные сохранены/)).toBeTruthy());
    expect(field.value).toBe(answer);
  });
});
