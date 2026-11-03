"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clipboard, FileText, Mic, RotateCcw, Sparkles, Square, BriefcaseBusiness, PenLine, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const questions = [
  { title: "Какие задачи сотрудник выполняет каждый день?", hint: "Расскажите о двух-трёх основных задачах, из которых складывается рабочий день", example: "Например: общается с клиентами, готовит отчёты, координирует работу команды" },
  { title: "Над каким проектом работает сотрудник?", hint: "Расскажите о проекте, над которым он работает сейчас или работал последние шесть месяцев", example: "Например: запуск нового сервиса для клиентов" },
  { title: "Что изменится в ближайшие полгода?", hint: "Продолжит ли сотрудник этот проект или перейдёт на новый? Расскажите, какой именно", example: "Например: продолжит развивать сервис и запустит новые функции" },
  { title: "Что нужно знать и уметь?", hint: "Расскажите об инструментах, программах и знаниях, необходимых для работы", example: "Например: Excel, управление проектами, аналитика" },
];
const keys = ["daily_tasks", "current_project", "next_six_months", "tools_and_knowledge"] as const;
const mock = process.env.NEXT_PUBLIC_ISKRA_MOCK === "true";
type Vacancy = { vacancy_text: string; missing_information: string[] };

async function api(path: string, body: object) {
  let response: Response;
  try { response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error("Нет связи с сервером. Проверьте подключение и попробуйте ещё раз."); }
  if (!response.ok) throw new Error(response.status === 429 || response.status === 503 ? "Сервис сейчас перегружен или исчерпан лимит. Попробуйте позже." : "Сервис пока недоступен. Попробуйте ещё раз.");
  try { return await response.json(); } catch { throw new Error("Сервис вернул некорректный ответ. Попробуйте ещё раз."); }
}

export default function Home() {
  const [screen, setScreen] = useState<"intro" | "wizard" | "result">("intro");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(["", "", "", ""]);
  const [confirmed, setConfirmed] = useState([false, false, false, false]);
  const [status, setStatus] = useState<"idle" | "recording" | "transcribing" | "generating">("idle");
  const [message, setMessage] = useState("");
  const [answerError, setAnswerError] = useState("");
  const [voiceError, setVoiceError] = useState(false);
  const [notice, setNotice] = useState("");
  const [vacancy, setVacancy] = useState<Vacancy | null>(null);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => () => { cancelled.current = true; if (timer.current) clearTimeout(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); recorder.current?.stream.getTracks().forEach(t => t.stop()); }, []);
  useEffect(() => {
    if (status !== "recording") return;
    const started = Date.now();
    const interval = setInterval(() => setElapsed(Math.min(60, Math.floor((Date.now() - started) / 1000))), 250);
    return () => clearInterval(interval);
  }, [status]);
  const count = confirmed.filter(Boolean).length;
  const changeAnswer = (value: string) => { setAnswers(a => a.map((v, i) => i === step ? value : v)); setConfirmed(c => c.map((v, i) => i === step ? false : v)); setMessage(""); setAnswerError(""); setNotice(""); };
  async function transcribe(blob: Blob) {
    setVoiceError(true);
    if (!blob.size) { setMessage("Запись пуста. Попробуйте ещё раз или введите ответ вручную"); setStatus("idle"); return; }
    setStatus("transcribing"); setMessage("");
    try {
      let transcript: string;
      if (mock) { await new Promise(r => setTimeout(r, 700)); transcript = "Это демонстрационная расшифровка. Замените её своим ответом."; }
      else {
        const audioBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Не удалось прочитать запись.")); reader.readAsDataURL(blob); });
        const data = await api("/api/transcribe", { audioBase64, mimeType: blob.type });
        if (typeof data.transcript !== "string" || !data.transcript.trim()) throw new Error("Не удалось распознать речь. Попробуйте ещё раз или введите текст.");
        transcript = data.transcript;
        if (Array.isArray(data.uncertainWords) && data.uncertainWords.length) setNotice(`Проверьте слова: ${data.uncertainWords.join(", ")}`);
      }
      setVoiceError(false); setAnswerError(""); setAnswers(a => a.map((v, i) => i === step ? transcript : v)); setConfirmed(c => c.map((v, i) => i === step ? false : v));
      setNotice(n => n || "Текст готов — проверьте и отредактируйте его перед подтверждением");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Не удалось распознать запись. Попробуйте ещё раз."); }
    finally { setStatus("idle"); }
  }
  async function startRecording() {
    setMessage(""); setAnswerError(""); setNotice(""); setVoiceError(true);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setMessage("Запись не поддерживается в этом браузере. Введите ответ вручную"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); recorder.current = r; chunks.current = []; cancelled.current = false;
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach(t => t.stop()); if (timer.current) clearTimeout(timer.current); if (!cancelled.current) void transcribe(new Blob(chunks.current, { type: r.mimeType })); };
      r.onerror = () => { cancelled.current = true; stream.getTracks().forEach(t => t.stop()); setStatus("idle"); setMessage("Запись прервалась. Попробуйте снова или введите ответ вручную"); };
      r.start(); setElapsed(0); setStatus("recording");
      timer.current = setTimeout(() => { cancelled.current = true; if (r.state === "recording") r.stop(); setStatus("idle"); setMessage("Запись слишком длинная: максимум 60 секунд. Попробуйте ещё раз или введите текст"); }, 60000);
    } catch { setStatus("idle"); setMessage("Не удалось получить доступ к микрофону. Проверьте разрешение браузера или введите ответ вручную"); }
  }
  function stopRecording(cancel = false) { cancelled.current = cancel; if (recorder.current?.state === "recording") recorder.current.stop(); if (cancel) { setStatus("idle"); setNotice("Запись отменена. Можно попробовать снова или ввести ответ вручную"); } }
  async function generate(nextAnswers = answers) {
    setStatus("generating"); setMessage(""); setVoiceError(false);
    try {
      let result: Vacancy;
      if (mock) {
        await new Promise(r => setTimeout(r, 700));
        result = { vacancy_text: `Описание вакансии\n\nЕжедневные задачи\n${nextAnswers[0]}\n\nТекущий проект\n${nextAnswers[1]}\n\nБлижайшие полгода\n${nextAnswers[2]}\n\nИнструменты и знания\n${nextAnswers[3]}`, missing_information: ["Название должности не указано"] };
      } else {
        const data = await api("/api/generate", { answers: Object.fromEntries(keys.map((key, i) => [key, nextAnswers[i]])) });
        if (typeof data.vacancy?.vacancy_text !== "string" || !data.vacancy.vacancy_text.trim() || !Array.isArray(data.vacancy.missing_information) || !data.vacancy.missing_information.every((x: unknown) => typeof x === "string")) throw new Error("Сервис вернул неполное описание. Попробуйте ещё раз.");
        result = data.vacancy;
      }
      setVacancy(result); setScreen("result");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Не удалось подготовить вакансию. Попробуйте ещё раз."); }
    finally { setStatus("idle"); }
  }
  function next() {
    if (!answers[step].trim()) { setAnswerError("Добавьте ответ, чтобы продолжить"); return; }
    if (answers[step].trim().length < 15) { setAnswerError("Ответ получился коротким. Добавьте, пожалуйста, немного подробностей"); return; }
    setConfirmed(c => c.map((v, i) => i === step ? true : v)); setMessage(""); setAnswerError(""); setNotice("");
    if (step < 3) setStep(step + 1); else void generate();
  }
  async function copy() { try { await navigator.clipboard.writeText(vacancy?.vacancy_text || ""); setCopied(true); } catch { setMessage("Не удалось скопировать текст. Выделите его и скопируйте вручную"); } }
  const openAnswer = (i: number) => {
    if (status !== "idle" || !confirmed[i]) return;
    setStep(i); setScreen("wizard"); setMessage(""); setAnswerError(""); setNotice("");
  };
  const reset = () => {
    setScreen("intro"); setStep(0); setAnswers(["", "", "", ""]); setConfirmed([false, false, false, false]); setVacancy(null); setMessage(""); setAnswerError(""); setNotice("");
  };
  const transcriptReady = notice.includes("Текст готов") || notice.startsWith("Проверьте слова");
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Основной раздел">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><Sparkles size={20}/></span><span>искра<span className="brand-period">.</span></span></div>
        <div className="nav-item selected" aria-current="page"><BriefcaseBusiness size={18}/><span>Вакансии</span></div>
      </nav>
      <main className="workspace">
        <div className="workspace-inner">
          <header className="workspace-heading">
            <div><h1>Создание вакансии</h1><p>Мы зададим 4 вопроса — отвечайте голосом или текстом, а Искра подготовит черновик вакансии</p></div>
            <div className="progress-wrap"><div className="progress-ring" role="progressbar" aria-label="Подтверждено ответов" aria-valuemin={0} aria-valuemax={4} aria-valuenow={count}><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="progress-track" cx="50" cy="50" r="43"/><circle className="progress-value" cx="50" cy="50" r="43" strokeDasharray={`${count / 4 * 270.18} 270.18`}/></svg><b>{count}<small>/4</small></b></div><span>ответов<br/>подтверждено</span></div>
          </header>
          {mock && <div className="mock-banner">Демонстрационный режим — Gemini не используется</div>}
          <section className="main-panel" aria-label={screen === "result" ? "Черновик вакансии" : "Вопросы о вакансии"}>
            {screen === "intro" ? <div className="intro-screen">
              <div className="intro-illustration" aria-hidden="true"><svg viewBox="0 0 210 150" fill="none"><circle cx="105" cy="75" r="46"/><circle cx="105" cy="75" r="64"/><path d="M24 75h24M162 75h24M105 0v18M105 132v18"/><path d="M91 76h7l5-15 6 28 5-13h6"/></svg></div>
              <div className="intro-badges"><span><CheckCircle2 size={16}/> Ответьте на 4 вопроса</span><span><Mic size={16}/> Голосом или текстом</span></div>
              <Button className="action-primary intro-action" onClick={() => setScreen("wizard")}>Начать создание <ArrowRight/></Button>
            </div> : screen === "wizard" ? <div className="question-screen">
              <div className="question-top"><span className="question-badge">ВОПРОС {String(step + 1).padStart(2, "0")} <span>/ 04</span></span></div>
              <h2 key={step}>{questions[step].title}</h2><p className="question-hint">{questions[step].hint}</p>
              <div className={`voice-box ${status === "recording" ? "voice-active" : status === "transcribing" ? "voice-processing" : ""}`}>
                <div className="signal-art" aria-hidden="true"><svg className="signal-arcs" viewBox="0 0 160 104" fill="none"><path d="M23 77C8 55 20 23 48 16"/><path d="M137 77c15-22 3-54-25-61"/><path d="M35 71C26 54 33 34 48 28"/><path d="M125 71c9-17 2-37-13-43"/><circle cx="80" cy="52" r="31"/></svg>
                  {status === "recording" ? <div className="waveform"><span/><span/><span/><span/><span/><span/><span/><span/><span/></div> : status === "transcribing" ? <div className="processing-symbol"/> : <div className="signal-center">{transcriptReady ? <Check size={22}/> : <Mic size={22}/>}</div>}
                </div>
                <div className="voice-content"><div className="voice-status" role="status" aria-live="polite"><b>{status === "recording" ? "Идёт запись" : status === "transcribing" ? "Расшифровываем запись" : transcriptReady ? "Расшифровка готова" : voiceError && message ? "Не удалось обработать запись" : "Готовы записать ответ"}</b></div><p>{status === "recording" ? `Говорите свободно · 00:${String(elapsed).padStart(2, "0")} / 01:00` : status === "transcribing" ? "Подождите немного" : transcriptReady ? "Проверьте текст ниже" : voiceError && message ? "Попробуйте ещё раз или введите текст" : "До 60 секунд"}</p></div>
                <div className="voice-actions"><Button variant="outline" className="voice-button" disabled={status === "transcribing" || status === "generating"} onClick={() => status === "recording" ? stopRecording() : void startRecording()}>{status === "recording" ? <><Square/> Завершить запись</> : <><Mic/> {voiceError && message ? "Попробовать снова" : "Записать ответ"}</>}</Button>{status === "recording" && <Button variant="ghost" className="cancel-button" onClick={() => stopRecording(true)}>Отменить</Button>}</div>
              </div>
              <p className="voice-privacy">{mock ? "Деморежим: запись не отправляется, расшифровка демонстрационная" : "Запись будет обработана ИИ для расшифровки"}</p>
              <div className="input-divider"><span/> ИЛИ ВВЕДИТЕ ТЕКСТ <span/></div>
              <label className="text-label" htmlFor="answer">{transcriptReady ? "Расшифровка · можно редактировать" : "Текст ответа"}</label>
              <textarea id="answer" aria-invalid={!!answerError} aria-describedby={answerError ? "answer-error" : undefined} value={answers[step]} onChange={e => changeAnswer(e.target.value)} placeholder={questions[step].example} disabled={status !== "idle"}/>
              <div className="answer-footer">{answers[step].length} символов</div>
              {answerError && <div id="answer-error" className="feedback error" role="alert"><CircleAlert size={17}/>{answerError}</div>}
              {message && <div className="feedback error" role="alert"><CircleAlert size={17}/><span>{message}</span></div>}
              {notice && <div className="feedback success" role="status"><CheckCircle2 size={17}/>{notice}</div>}
              <div className="question-actions"><Button variant="ghost" className="action-back" disabled={status !== "idle"} onClick={() => { setMessage(""); setAnswerError(""); setNotice(""); if (step === 0) setScreen("intro"); else setStep(step - 1); }}><ArrowLeft/> Назад</Button><Button className={`action-primary ${!answers[step].trim() ? "action-empty" : ""}`} disabled={status !== "idle"} onClick={next}>{status === "generating" ? "Готовим черновик…" : step === 3 ? "Создать черновик" : "Подтвердить и далее"}<ArrowRight/></Button></div>
            </div> : vacancy && <div className="result-screen">
              <div className="question-badge">ФИНАЛЬНЫЙ ЭТАП</div><h2>Ваш черновик готов</h2><p className="question-hint">Проверьте и дополните описание перед использованием</p>
              <div className="result-heading"><div><FileText size={19}/><b>Описание вакансии</b></div><Button variant="outline" className="copy-button" onClick={copy}><Clipboard/>{copied ? "Скопировано" : "Скопировать"}</Button></div><label className="sr-only" htmlFor="vacancy">Текст вакансии</label><textarea id="vacancy" className="result-text" value={vacancy.vacancy_text} onChange={e => { setVacancy({ ...vacancy, vacancy_text: e.target.value }); setCopied(false); }}/>
              {message && <div className="feedback error" role="alert">{message}</div>}
              <div className="result-missing"><b>Что ещё стоит уточнить</b><p>{vacancy.missing_information.length ? vacancy.missing_information.join(" · ") : "Проверьте черновик перед использованием"}</p></div>
              <div className="review-title"><h3>Ваши ответы</h3><span>4 ИЗ 4</span></div><div className="review-list">{questions.map((q, i) => <div className="review-item" key={q.title}><div><b>{q.title}</b><p>{answers[i]}</p></div><Button variant="ghost" onClick={() => openAnswer(i)}><PenLine/> Изменить</Button></div>)}</div>
              <div className="result-actions"><Button variant="ghost" className="action-back" onClick={() => openAnswer(3)}><ArrowLeft/> К ответам</Button><Button variant="outline" onClick={reset}><RotateCcw/> Начать заново</Button></div>
            </div>}
          </section>
        </div>
      </main>
    </div>
  );
}
