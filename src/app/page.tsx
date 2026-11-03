"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clipboard, FileText, Mic, RotateCcw, Sparkles, Square, BriefcaseBusiness, PenLine, AudioLines, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

const questions = [
  { title: "Какие задачи сотрудник выполняет каждый день?", hint: "Расскажите о двух-трёх основных задачах, из которых складывается рабочий день.", example: "Например: общается с клиентами, готовит отчёты, координирует работу команды" },
  { title: "Над каким проектом работает сотрудник?", hint: "Расскажите о проекте, над которым он работает сейчас или работал последние шесть месяцев.", example: "Например: запуск нового сервиса для клиентов" },
  { title: "Что изменится в ближайшие полгода?", hint: "Продолжит ли сотрудник этот проект или перейдёт на новый? Расскажите, какой именно.", example: "Например: продолжит развивать сервис и запустит новые функции" },
  { title: "Что нужно знать и уметь?", hint: "Расскажите об инструментах, программах и знаниях, необходимых для работы.", example: "Например: Excel, управление проектами, аналитика" },
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
    if (!blob.size) { setMessage("Запись пуста. Попробуйте ещё раз или введите ответ вручную."); setStatus("idle"); return; }
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
      setNotice(n => n || "Текст готов. Проверьте и отредактируйте его перед подтверждением.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Не удалось распознать запись. Попробуйте ещё раз."); }
    finally { setStatus("idle"); }
  }
  async function startRecording() {
    setMessage(""); setAnswerError(""); setNotice(""); setVoiceError(true);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setMessage("Запись не поддерживается в этом браузере. Введите ответ вручную."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); recorder.current = r; chunks.current = []; cancelled.current = false;
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach(t => t.stop()); if (timer.current) clearTimeout(timer.current); if (!cancelled.current) void transcribe(new Blob(chunks.current, { type: r.mimeType })); };
      r.onerror = () => { cancelled.current = true; stream.getTracks().forEach(t => t.stop()); setStatus("idle"); setMessage("Запись прервалась. Попробуйте снова или введите ответ вручную."); };
      r.start(); setElapsed(0); setStatus("recording");
      timer.current = setTimeout(() => { cancelled.current = true; if (r.state === "recording") r.stop(); setStatus("idle"); setMessage("Запись слишком длинная: максимум 60 секунд. Попробуйте ещё раз или введите текст."); }, 60000);
    } catch { setStatus("idle"); setMessage("Не удалось получить доступ к микрофону. Проверьте разрешение браузера или введите ответ вручную."); }
  }
  function stopRecording(cancel = false) { cancelled.current = cancel; if (recorder.current?.state === "recording") recorder.current.stop(); if (cancel) { setStatus("idle"); setNotice("Запись отменена. Можно попробовать снова или ввести ответ вручную."); } }
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
    if (!answers[step].trim()) { setAnswerError("Добавьте ответ, чтобы продолжить."); return; }
    if (answers[step].trim().length < 15) { setAnswerError("Ответ получился коротким. Добавьте, пожалуйста, немного подробностей."); return; }
    setConfirmed(c => c.map((v, i) => i === step ? true : v)); setMessage(""); setAnswerError(""); setNotice("");
    if (step < 3) setStep(step + 1); else void generate();
  }
  async function copy() { try { await navigator.clipboard.writeText(vacancy?.vacancy_text || ""); setCopied(true); } catch { setMessage("Не удалось скопировать текст. Выделите его и скопируйте вручную."); } }
  const openAnswer = (i: number) => {
    if (status !== "idle" || !confirmed[i]) return;
    setStep(i); setScreen("wizard"); setMessage(""); setAnswerError(""); setNotice("");
  };
  const reset = () => {
    setScreen("intro"); setStep(0); setAnswers(["", "", "", ""]); setConfirmed([false, false, false, false]); setVacancy(null); setMessage(""); setAnswerError(""); setNotice("");
  };
  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Основной раздел">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><Sparkles size={20}/></span><span>искра<span className="brand-period">.</span></span></div>
        <div className="nav-item selected" aria-current="page"><BriefcaseBusiness size={18}/><span>Вакансии</span></div>
      </nav>
      <div className="app-main">
        <main className="workspace">
          <div className="workspace-heading"><div><div className="eyebrow-label"><span/> МАСТЕР ВАКАНСИИ</div><h1>Создание вакансии<span className="heading-spark"> ✳</span></h1><p>Из ваших слов — в понятное описание роли.</p></div><div className="workspace-tag"><span/> ЧЕРНОВИК</div></div>
          {mock && <div className="mock-banner">Демонстрационный режим: ответы обрабатываются локально, Gemini не используется.</div>}
          <div className="workspace-grid">
            <section className="main-panel" aria-label={screen === "result" ? "Черновик вакансии" : "Мастер вопросов"}>
              {screen === "intro" ? <div className="intro-screen">
                <div className="intro-kicker"><Sparkles size={16}/> ДАВАЙТЕ ЗНАКОМИТЬСЯ</div>
                <div className="intro-orbit" aria-hidden="true"><span className="orbit-line one"/><span className="orbit-line two"/><span className="orbit-core"><Sparkles size={38} strokeWidth={1.4}/></span><span className="orbit-star">✳</span></div>
                <h2>Хорошая вакансия<br/><em>начинается с разговора.</em></h2>
                <p className="intro-lead">Расскажите о задачах и проектах будущего сотрудника. Искра поможет собрать ваши ответы в черновик вакансии.</p>
                <div className="intro-steps"><div><span>01</span><p><b>Четыре вопроса</b><br/>Отвечайте голосом или текстом</p></div><div><span>02</span><p><b>Всё под контролем</b><br/>Проверьте ответы и черновик</p></div></div>
                <Button className="action-primary" onClick={() => setScreen("wizard")}>Начать создание <ArrowRight/></Button>
                <p className="intro-privacy">Для тестирования используйте только вымышленные данные.</p>
              </div> : screen === "wizard" ? <div className="question-screen">
                <div className="question-top"><div className="question-badge"><span/> ВОПРОС {String(step + 1).padStart(2, "0")} <span className="badge-muted">/ 04</span></div><span className="question-category">{["ЕЖЕДНЕВНЫЕ ЗАДАЧИ", "ТЕКУЩИЙ ПРОЕКТ", "БЛИЖАЙШИЕ ПОЛГОДА", "ИНСТРУМЕНТЫ И ЗНАНИЯ"][step]}</span></div>
                <h2 key={step}>{questions[step].title}</h2><p className="question-hint">{questions[step].hint}</p>
                <div className="input-panel">
                  <div className="input-heading"><div className="input-icon"><AudioLines size={20}/></div><div><h3>Ваш ответ</h3><p>Расскажите своими словами</p></div><span className="input-label">ГОЛОС ИЛИ ТЕКСТ</span></div>
                  <div className={`voice-box ${status === "recording" ? "voice-active" : status === "transcribing" ? "voice-processing" : ""}`}>
                    <div className="voice-topline"><span>ГОЛОСОВОЙ ОТВЕТ</span><span>{status === "recording" ? `00:${String(elapsed).padStart(2, "0")} / 01:00` : "ДО 60 СЕКУНД"}</span></div>
                    <div className="voice-body">
                      <div className="signal-art" aria-hidden="true">
                        <svg className="signal-arcs" viewBox="0 0 180 120" fill="none"><path d="M27 89C7 60 23 22 57 14"/><path d="M153 89c20-29 4-67-30-75"/><path d="M40 82C28 61 37 37 57 29"/><path d="M140 82c12-21 3-45-17-53"/><circle cx="90" cy="60" r="36"/></svg>
                        {status === "recording" ? <div className="waveform"><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/><span/></div> : status === "transcribing" ? <div className="processing-symbol"><span/><span/><span/></div> : <div className="signal-center">{notice.includes("Текст готов") || notice.startsWith("Проверьте слова") ? <Check size={23}/> : <Mic size={22}/>}</div>}
                      </div>
                      <div className="voice-copy"><div className="voice-status" role="status" aria-live="polite"><span className="voice-indicator"/><b>{status === "recording" ? "Идёт запись" : status === "transcribing" ? "Расшифровываем запись" : notice.includes("Текст готов") || notice.startsWith("Проверьте слова") ? "Расшифровка готова" : voiceError && message ? "Не удалось обработать запись" : "Готовы записать ответ"}</b></div><p>{status === "recording" ? "Говорите свободно — мы вас слушаем." : status === "transcribing" ? "Превращаем ваши слова в текст. Это может занять немного времени." : notice.includes("Текст готов") || notice.startsWith("Проверьте слова") ? "Проверьте текст ниже и при необходимости измените его." : "Нажмите на кнопку и расскажите о роли своими словами."}</p>
                        <div className="voice-actions"><Button variant="outline" className="voice-button" disabled={status === "transcribing" || status === "generating"} onClick={() => status === "recording" ? stopRecording() : void startRecording()}>{status === "recording" ? <><Square size={16}/> Завершить запись</> : <><Mic size={16}/> {voiceError && message ? "Попробовать снова" : "Записать ответ"}</>}</Button>{status === "recording" && <Button variant="ghost" className="cancel-button" onClick={() => stopRecording(true)}>Отменить</Button>}</div>
                      </div>
                    </div>
                  </div>
                  <p className="voice-privacy">{mock ? "Деморежим: запись не отправляется, расшифровка вымышленная." : "Запись будет отправлена в Gemini для расшифровки. Используйте только вымышленные данные."}</p>
                  <div className="input-divider"><span/> ИЛИ ВВЕДИТЕ ТЕКСТ <span/></div>
                  <label className="text-label" htmlFor="answer">{notice && !message ? "Текст ответа · можно редактировать" : "Текст ответа"}</label>
                  <textarea id="answer" aria-invalid={!!answerError} aria-describedby={answerError ? "answer-error" : "answer-hint"} value={answers[step]} onChange={e => changeAnswer(e.target.value)} placeholder={questions[step].example} disabled={status !== "idle"}/>
                  <div className="answer-footer"><span id="answer-hint">Ответ можно изменить до подтверждения</span><span>{answers[step].length} символов</span></div>
                </div>
                {answerError && <div id="answer-error" className="feedback error" role="alert"><CircleAlert size={17}/>{answerError}</div>}
                {message && <div className="feedback error" role="alert"><CircleAlert size={17}/><span>{message}</span></div>}
                {notice && <div className="feedback success" role="status"><CheckCircle2 size={17}/>{notice}</div>}
                <div className="question-actions"><Button variant="ghost" className="action-back" disabled={status !== "idle"} onClick={() => { setMessage(""); setAnswerError(""); setNotice(""); if (step === 0) setScreen("intro"); else setStep(step - 1); }}><ArrowLeft/> Назад</Button><Button className={`action-primary ${!answers[step].trim() ? "action-empty" : ""}`} disabled={status !== "idle"} onClick={next}>{status === "generating" ? "Готовим черновик…" : step === 3 ? "Создать черновик" : "Подтвердить и далее"}<ArrowRight/></Button></div>
                <div className="gentle-note"><Sparkles size={17}/><p><b>Не нужно идеальных формулировок.</b> Говорите так, как рассказали бы коллеге.</p></div>
              </div> : vacancy && <div className="result-screen">
                <div className="question-badge"><span/> ФИНАЛЬНЫЙ ЭТАП</div><h2>Ваш черновик <em>готов.</em></h2><p className="question-hint">Проверьте и дополните описание перед использованием.</p>
                <div className="result-box"><div className="result-heading"><div><FileText size={19}/><b>Описание вакансии</b></div><Button variant="outline" className="copy-button" onClick={copy}><Clipboard/>{copied ? "Скопировано" : "Скопировать"}</Button></div><label className="sr-only" htmlFor="vacancy">Текст вакансии</label><textarea id="vacancy" value={vacancy.vacancy_text} onChange={e => { setVacancy({ ...vacancy, vacancy_text: e.target.value }); setCopied(false); }}/></div>
                {message && <div className="feedback error" role="alert">{message}</div>}
                <div className="result-missing"><b>Что ещё стоит уточнить</b><p>{vacancy.missing_information.length ? vacancy.missing_information.join(" · ") : "Проверьте черновик перед использованием."}</p></div>
                <div className="result-actions"><Button variant="ghost" className="action-back" onClick={() => openAnswer(3)}><ArrowLeft/> К ответам</Button><Button variant="outline" onClick={reset}><RotateCcw/> Начать заново</Button></div>
              </div>}
            </section>
            <aside className="review-panel" aria-label="Прогресс и ответы">
              <div className="review-header"><div><div className="eyebrow-label">ВАШ ПРОГРЕСС</div><h2>Шаг за шагом</h2><p>Всё важное — здесь.</p></div><div className="progress-ring" role="progressbar" aria-label="Подтверждено ответов" aria-valuemin={0} aria-valuemax={4} aria-valuenow={count}><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="progress-track" cx="50" cy="50" r="43"/><circle className="progress-value" cx="50" cy="50" r="43" strokeDasharray={`${count / 4 * 270.18} 270.18`}/></svg><div><b>{count}<small>/4</small></b></div></div></div>
              <div className="review-divider"/>
              <div className="review-title"><b>Ответы</b><span>{count} ИЗ 4</span></div>
              <div className="review-list">{questions.map((q, i) => <div className={`review-item ${screen === "wizard" && step === i ? "current" : ""}`} key={q.title}><div className={`review-number ${confirmed[i] ? "done" : ""}`}>{confirmed[i] ? <Check size={14}/> : String(i + 1).padStart(2, "0")}</div><div className="review-content"><b>{["Ежедневные задачи", "Текущий проект", "Ближайшие полгода", "Инструменты и знания"][i]}</b><p>{confirmed[i] ? answers[i] : screen === "wizard" && step === i ? "Текущий вопрос" : "Пока не заполнено"}</p>{confirmed[i] && <button className="edit-answer" disabled={status !== "idle"} onClick={() => openAnswer(i)}><PenLine size={12}/> Изменить</button>}</div></div>)}</div>
              <div className="missing-card"><span className="missing-icon"><Sparkles size={17}/></span><div><b>Чего пока не хватает</b><p>{screen === "result" && vacancy ? (vacancy.missing_information.length ? vacancy.missing_information.join(" · ") : "Проверьте черновик перед использованием.") : count === 4 ? "Все ответы подтверждены. Проверьте черновик." : `Ещё ${4 - count} ${4 - count === 1 ? "ответ" : 4 - count < 5 ? "ответа" : "ответов"} до черновика.`}</p></div></div>
              <p className="review-foot">Сначала факты. Остальное можно добавить позже.</p>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
