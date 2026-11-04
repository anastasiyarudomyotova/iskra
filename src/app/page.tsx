"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clipboard, FileText, Mic, RotateCcw, Sparkles, Square, Plus, BriefcaseBusiness, Settings, PenLine, AudioLines, CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DRAFT_TOPICS, documentFromBlocks, plainText } from "@/lib/draft";
import { RichDraftEditor } from "@/components/rich-draft-editor";
import type { Editor, JSONContent } from "@tiptap/react";

const questions = [
  { title: "Какие задачи сотрудник выполняет каждый день?", hint: "Расскажите о двух-трёх основных задачах, из которых складывается рабочий день", example: "Например: общается с клиентами, готовит отчёты, координирует работу команды" },
  { title: "Над каким проектом работает сотрудник?", hint: "Расскажите о проекте, над которым он работает сейчас или работал последние шесть месяцев", example: "Например: запуск нового сервиса для клиентов" },
  { title: "Что изменится в ближайшие полгода?", hint: "Продолжит ли сотрудник этот проект или перейдёт на новый? Расскажите, какой именно", example: "Например: продолжит развивать сервис и запустит новые функции" },
  { title: "Что нужно знать и уметь?", hint: "Расскажите об инструментах, программах и знаниях, необходимых для работы", example: "Например: Excel, управление проектами, аналитика" },
];
const keys = ["daily_tasks", "current_project", "next_six_months", "tools_and_knowledge"] as const;
const mock = process.env.NEXT_PUBLIC_ISKRA_MOCK === "true";
type AssessmentItem = { topic: typeof keys[number]; status: "sufficient" | "clarify" | "missing"; evidence: string | null; question: string };

async function api(path: string, body: object) {
  let response: Response;
  try { response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
  catch { throw new Error("Нет связи с сервером. Проверьте подключение и попробуйте ещё раз"); }
  if (!response.ok) throw new Error(response.status === 429 || response.status === 503 ? "Сервис сейчас перегружен или исчерпан лимит. Попробуйте позже." : "Сервис пока недоступен. Попробуйте ещё раз.");
  try { return await response.json(); } catch { throw new Error("Сервис вернул некорректный ответ. Попробуйте ещё раз"); }
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
  const [draft, setDraft] = useState<JSONContent | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const editorRef = useRef<Editor | null>(null);
  const draftTextRef = useRef("");
  const [draftSource, setDraftSource] = useState<string[] | null>(null);
  const [editingFromResult, setEditingFromResult] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentItem[] | null>(null);
  const [assessmentState, setAssessmentState] = useState<"idle" | "loading" | "error" | "ready" | "stale">("idle");
  const assessmentVersion = useRef(0);
  const generationVersion = useRef(0);
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
        const audioBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Не удалось прочитать запись")); reader.readAsDataURL(blob); });
        const data = await api("/api/transcribe", { audioBase64, mimeType: blob.type });
        if (typeof data.transcript !== "string" || !data.transcript.trim()) throw new Error("Не удалось распознать речь. Попробуйте ещё раз или введите текст");
        transcript = data.transcript;
        if (Array.isArray(data.uncertainWords) && data.uncertainWords.length) setNotice(`Проверьте слова: ${data.uncertainWords.join(", ")}`);
      }
      setVoiceError(false); setAnswerError(""); setAnswers(a => a.map((v, i) => i === step ? transcript : v)); setConfirmed(c => c.map((v, i) => i === step ? false : v));
      setNotice(n => n || "Текст готов — проверьте и отредактируйте его перед подтверждением");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Не удалось распознать запись. Попробуйте ещё раз"); }
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
  async function checkCompleteness(source: string) {
    const version = ++assessmentVersion.current;
    setAssessment(null); setAssessmentState("loading");
    if (source.length > 16000) { setAssessmentState("error"); return; }
    try {
      const result = await api("/api/completeness", { draft: source });
      if (version !== assessmentVersion.current) return;
      if (!Array.isArray(result.assessment) || result.assessment.length !== 4) throw new Error("Некорректный ответ");
      setAssessment(result.assessment); setAssessmentState("ready");
    } catch {
      if (version === assessmentVersion.current) setAssessmentState("error");
    }
  }
  async function generate(nextAnswers = answers) {
    const version = ++generationVersion.current;
    setStatus("generating"); setMessage("");
    try {
      const result = await api("/api/draft", { answers: Object.fromEntries(keys.map((key, i) => [key, nextAnswers[i]])) });
      if (version !== generationVersion.current) return;
      if (!Array.isArray(result.blocks) || !result.blocks.length) throw new Error("Некорректный ответ");
      const generated = documentFromBlocks(result.blocks);
      const generatedText = plainText(generated);
      draftTextRef.current = generatedText;
      setDraft(generated); setEditorVersion(v => v + 1); setDraftSource([...nextAnswers]); setCopied(false);
      setMessage(""); setVoiceError(false); setScreen("result"); setEditingFromResult(false);
      void checkCompleteness(generatedText);
    } catch {
      if (version === generationVersion.current) setMessage("Не удалось подготовить черновик. Попробуйте ещё раз; ваши данные сохранены.");
    } finally {
      if (version === generationVersion.current) setStatus("idle");
    }
  }
  function next() {
    if (!answers[step].trim()) { setAnswerError("Добавьте ответ, чтобы продолжить"); return; }
    if (answers[step].trim().length < 15) { setAnswerError("Ответ получился коротким. Добавьте, пожалуйста, немного подробностей"); return; }
    setConfirmed(c => c.map((v, i) => i === step ? true : v)); setMessage(""); setAnswerError(""); setNotice("");
    if (editingFromResult) { setScreen("result"); setEditingFromResult(false); }
    else if (step < 3) setStep(step + 1); else void generate();
  }
  async function copy() {
    try {
      const editor = editorRef.current;
      if (!editor) throw new Error("Редактор ещё загружается");
      const text = plainText(editor.getJSON());
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        try { await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([editor.getHTML()], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]); }
        catch { await navigator.clipboard.writeText(text); }
      } else await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch { setMessage("Не удалось скопировать текст. Выделите его и скопируйте вручную"); }
  }
  function changeDraft(content: JSONContent) {
    const text = plainText(content);
    setDraft(content); setCopied(false);
    if (text !== draftTextRef.current) { draftTextRef.current = text; assessmentVersion.current++; setAssessment(null); setAssessmentState("stale"); }
    if (status === "generating") { generationVersion.current++; setStatus("idle"); setMessage("Создание отменено: черновик был изменён."); }
  }
  const openAnswer = (i: number) => {
    if (status !== "idle" || !confirmed[i]) return;
    setEditingFromResult(screen === "result"); setStep(i); setScreen("wizard"); setMessage(""); setAnswerError(""); setNotice("");
  };
  const reset = () => {
    setScreen("intro"); setStep(0); setAnswers(["", "", "", ""]); setConfirmed([false, false, false, false]); setDraft(null); draftTextRef.current = ""; setDraftSource(null); setAssessment(null); setAssessmentState("idle"); assessmentVersion.current++; generationVersion.current++; setStatus("idle"); setEditingFromResult(false); setCopied(false); setMessage(""); setAnswerError(""); setNotice("");
  };
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Основной раздел">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><Sparkles size={20}/></span><span>искра<span className="brand-period">.</span></span></div>
        <div className="nav-caption">Меню</div>
        <div className="nav-item selected" aria-current="page"><span>Создать вакансию</span><Plus size={17}/></div>
        <button type="button" className="nav-item nav-demo" disabled aria-label="Вакансии — демонстрационный раздел"><BriefcaseBusiness size={17}/><span>Вакансии</span><small>Демо</small></button>
        <button type="button" className="nav-item nav-demo" disabled aria-label="Настройки — демонстрационный раздел"><Settings size={17}/><span>Настройки</span><small>Демо</small></button>
      </nav>
      <div className="app-main">
        <main className="workspace">
          {mock && <div className="mock-banner">Демонстрационный режим записи; создание черновика и его проверка используют ИИ</div>}
          <div className="workspace-grid">
            <section className={`main-panel ${screen === "intro" ? "intro-panel" : ""}`} aria-label={screen === "result" ? "Черновик вакансии" : "Мастер вопросов"}>
              {screen === "intro" && <div className="intro-screen">
                <div className="intro-kicker" hidden><Sparkles size={16}/></div>
                <div className="intro-orbit" aria-hidden="true"><span className="orbit-line one"/><span className="orbit-line two"/><span className="orbit-core"><Sparkles size={38} strokeWidth={1.4}/></span><span className="orbit-star">✳</span></div>
                <h2>Хорошая вакансия<br/><em>начинается с разговора</em></h2>
                <p className="intro-lead">Мы зададим 4 вопроса, на которые можно ответить голосом. Искра поможет собрать ваши ответы в черновик вакансии</p>
                <Button className="action-primary" onClick={() => setScreen("wizard")}>Начать создание <ArrowRight/></Button>
                <p className="intro-privacy" hidden></p>
              </div>}
              {screen !== "result" ? <div className="question-screen" inert={screen === "intro"} aria-hidden={screen === "intro"}>
                <div className="question-top"><h2 key={step}>{questions[step].title}</h2><div className="question-badge"><span/> ВОПРОС {String(step + 1).padStart(2, "0")} <span className="badge-muted">/ 04</span></div></div>
                <p className="question-hint">{questions[step].hint}</p>
                  <div className="input-heading" hidden><div className="input-icon"><AudioLines size={20}/></div><div><h3></h3><p></p></div><span className="input-label">ГОЛОС ИЛИ ТЕКСТ</span></div>
                  <div className={`voice-box ${status === "recording" ? "voice-active" : status === "transcribing" ? "voice-processing" : ""}`}>
                    <div className="voice-body">
                      <div className="signal-art" aria-hidden="true">
                        <svg className="signal-arcs" viewBox="0 0 180 120" fill="none"><path d="M27 89C7 60 23 22 57 14"/><path d="M153 89c20-29 4-67-30-75"/><path d="M40 82C28 61 37 37 57 29"/><path d="M140 82c12-21 3-45-17-53"/><circle cx="90" cy="60" r="36"/></svg>
                        {status === "recording" ? <div className="waveform"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div> : status === "transcribing" ? <div className="processing-symbol"/> : <div className="signal-center">{notice.includes("Текст готов") || notice.startsWith("Проверьте слова") ? <Check size={23}/> : <Mic size={22}/>}</div>}
                      </div>
                      <div className="voice-copy"><div className="voice-status" role="status" aria-live="polite"><span className="voice-indicator"/><b>{status === "recording" ? "Идёт запись" : status === "transcribing" ? "Расшифровываем запись" : notice.includes("Текст готов") || notice.startsWith("Проверьте слова") ? "Расшифровка готова" : voiceError && message ? "Не удалось обработать запись" : "Готовы записать ответ"}</b></div><p>{status === "recording" ? "Говорите свободно — мы вас слушаем" : status === "transcribing" ? "Превращаем ваши слова в текст. Это может занять немного времени" : notice.includes("Текст готов") || notice.startsWith("Проверьте слова") ? "Проверьте текст ниже и при необходимости измените его" : "Нажмите на кнопку и расскажите о роли своими словами"}</p>
                        <div className="voice-actions"><Button variant="outline" className="voice-button" disabled={status === "transcribing" || status === "generating"} onClick={() => status === "recording" ? stopRecording() : void startRecording()}>{status === "recording" ? <><Square size={16}/> <span>Завершить запись · <span className="record-timer">{`00:${String(elapsed).padStart(2, "0")}`}</span></span></> : <><Mic size={16}/> {voiceError && message ? "Попробовать снова" : "Записать ответ"}</>}</Button>{status === "recording" && <Button variant="ghost" className="cancel-button" onClick={() => stopRecording(true)}>Отменить</Button>}</div>
                      </div>
                    </div>
                  </div>
                  <p className="voice-privacy">{mock ? "Деморежим: запись не отправляется, расшифровка вымышленная" : null}</p>
                  <div className="input-divider"><span/> ИЛИ ВВЕДИТЕ ТЕКСТ <span/></div>
                  <label className="text-label" htmlFor="answer">{notice && !message ? "Текст ответа · можно редактировать" : "Текст ответа"}</label>
                  <textarea id="answer" aria-invalid={!!answerError} aria-describedby={answerError ? "answer-error" : undefined} value={answers[step]} onChange={e => changeAnswer(e.target.value)} placeholder={questions[step].example} disabled={status !== "idle"}/>
                  <div className="answer-footer"><span id="answer-hint" hidden></span><span>{answers[step].length} символов</span></div>
                {answerError && <div id="answer-error" className="feedback error" role="alert"><CircleAlert size={17}/>{answerError}</div>}
                {message && <div className="feedback error" role="alert"><CircleAlert size={17}/><span>{message}</span></div>}
                {notice && <div className="feedback success" role="status"><CheckCircle2 size={17}/>{notice}</div>}
                {status === "generating" && <span className="sr-only" role="status">Готовим черновик</span>}
                <div className="question-actions"><Button variant="ghost" className="action-back" disabled={status !== "idle"} onClick={() => { setMessage(""); setAnswerError(""); setNotice(""); if (step === 0) setScreen("intro"); else setStep(step - 1); }}><ArrowLeft/> Назад</Button><Button className={`action-primary ${!answers[step].trim() ? "action-empty" : ""}`} disabled={status !== "idle"} onClick={next}>{status === "generating" ? <><LoaderCircle className="draft-spinner" aria-hidden="true"/> Готовим черновик…</> : editingFromResult ? "Вернуться к черновику" : step === 3 ? "Создать черновик" : "Подтвердить и далее"}<ArrowRight/></Button></div>
                <div className="gentle-note" hidden><Sparkles size={17}/><p><b></b></p></div>
              </div> : draft && <div className="result-screen">
                <div className="question-top"><h2>Ваш черновик <em>готов</em></h2><div className="question-badge"><span/> ФИНАЛЬНЫЙ ЭТАП</div></div><p className="question-hint">Отредактируйте текст и проверьте его перед использованием</p>
                <div className="result-box"><div className="result-heading"><div><FileText size={19}/><b>Описание вакансии</b></div><Button variant="outline" className="copy-button" onClick={copy}>{copied ? <Check/> : <Clipboard/>}{copied ? "Скопировано" : "Скопировать как есть"}</Button></div>
                  <RichDraftEditor key={editorVersion} content={draft} editorRef={editorRef} onChange={changeDraft}/>
                </div>
                {message && <div className="feedback error" role="alert">{message}</div>}
                {status === "generating" && <span className="sr-only" role="status">Готовим черновик</span>}
                {draftSource && answers.some((value, i) => value !== draftSource[i]) && <div className="draft-stale"><p>Ответы изменились. Черновик остался без изменений.</p><Button variant="outline" onClick={() => { if (window.confirm("Пересоздать черновик из ответов с помощью ИИ? Ваши правки черновика будут заменены только после успешной генерации.")) void generate(answers); }} disabled={status === "generating"}>{status === "generating" ? <><LoaderCircle className="draft-spinner" aria-hidden="true"/> Готовим черновик…</> : "Обновить черновик из ответов"}</Button></div>}
                <div className="result-actions"><Button variant="ghost" className="action-back" onClick={() => openAnswer(3)}><ArrowLeft/> К ответам</Button><Button variant="outline" onClick={reset}><RotateCcw/> Начать заново</Button></div>
              </div>}
            </section>
            {screen === "result" ? <aside className="review-panel assessment-panel" aria-label="Оценка полноты">
              <div className="assessment-heading"><h2>Оценка полноты</h2><p>ИИ проверяет текст черновика и предлагает уточнения. Решение остаётся за вами.</p></div>
              <p className="assessment-privacy">Для проверки текст черновика отправляется в ИИ. Замечания не меняют текст.</p>
              {assessmentState === "loading" && <p role="status" className="assessment-message">Проверяем черновик…</p>}
              {assessmentState === "stale" && <div className="assessment-message" role="status"><p>Черновик изменён. Проверка устарела.</p><Button variant="outline" onClick={() => void checkCompleteness(draftTextRef.current)}>Проверить заново</Button></div>}
              {assessmentState === "error" && <div role="alert" className="assessment-message"><p>{draft && plainText(draft).length > 16000 ? "Для проверки сократите текст до 16 000 символов. Черновик можно скопировать как есть." : "Не удалось проверить черновик. Его можно скопировать как есть."}</p><Button variant="outline" onClick={() => void checkCompleteness(draftTextRef.current)}>Повторить проверку</Button></div>}
              {assessmentState === "ready" && assessment && <div className="assessment-list">{DRAFT_TOPICS.map((topic, i) => { const item = assessment.find(value => value.topic === topic.key); if (!item) return null; return <section className="assessment-item" key={topic.key}><div className="assessment-item-title"><h3>{topic.title}</h3><span className={`assessment-status ${item.status}`}>{item.status === "sufficient" ? "Достаточно" : item.status === "clarify" ? "Уточнить" : "Нет данных"}</span></div>{item.evidence && <p className="assessment-evidence">В черновике: «{item.evidence}»</p>}{item.question && <p className="assessment-question">{item.question}</p>}<button className="edit-answer" onClick={() => openAnswer(i)}><PenLine size={12}/> Уточнить ответ</button></section>; })}</div>}
            </aside> :             <aside className="review-panel" aria-label="Прогресс и ответы">
              <div className="review-header"><div><h2>Ваш прогресс</h2><p>Всё важное — здесь</p></div><div className="progress-ring" role="progressbar" aria-label="Подтверждено ответов" aria-valuemin={0} aria-valuemax={4} aria-valuenow={count}><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="progress-track" cx="50" cy="50" r="43"/><circle className="progress-value" cx="50" cy="50" r="43" strokeDasharray={`${count / 4 * 270.18} 270.18`}/></svg><div><b>{count}<small>/4</small></b></div></div></div>
              <div className="review-divider"/>
              <div className="review-list">{questions.map((q, i) => <div className={`review-item ${screen === "wizard" && step === i ? "current" : ""}`} key={q.title}><div className={`review-number ${confirmed[i] ? "done" : ""}`}>{confirmed[i] ? <Check size={14}/> : String(i + 1).padStart(2, "0")}</div><div className="review-content"><b>{["Ежедневные задачи", "Текущий проект", "Ближайшие полгода", "Инструменты и знания"][i]}</b><p>{confirmed[i] ? answers[i] : screen === "wizard" && step === i ? "Текущий вопрос" : "Пока не заполнено"}</p>{confirmed[i] && <button className="edit-answer" disabled={status !== "idle"} onClick={() => openAnswer(i)}><PenLine size={12}/> Изменить</button>}</div></div>)}</div>
              <p className="review-foot" hidden></p>
            </aside>}
          </div>
        </main>
      </div>
    </div>
  );
}
