"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clipboard, FileText, Lightbulb, Mic, RotateCcw, Sparkles, Square, WandSparkles } from "lucide-react";
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
  const [notice, setNotice] = useState("");
  const [vacancy, setVacancy] = useState<Vacancy | null>(null);
  const [copied, setCopied] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const chunks = useRef<Blob[]>([]);
  useEffect(() => () => { cancelled.current = true; if (timer.current) clearTimeout(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); recorder.current?.stream.getTracks().forEach(t => t.stop()); }, []);
  const count = confirmed.filter(Boolean).length;
  const changeAnswer = (value: string) => { setAnswers(a => a.map((v, i) => i === step ? value : v)); setConfirmed(c => c.map((v, i) => i === step ? false : v)); setMessage(""); setNotice(""); };
  async function transcribe(blob: Blob) {
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
      setAnswers(a => a.map((v, i) => i === step ? transcript : v)); setConfirmed(c => c.map((v, i) => i === step ? false : v));
      setNotice(n => n || "Текст готов. Проверьте и отредактируйте его перед подтверждением.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Не удалось распознать запись. Попробуйте ещё раз."); }
    finally { setStatus("idle"); }
  }
  async function startRecording() {
    setMessage(""); setNotice("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setMessage("Запись не поддерживается в этом браузере. Введите ответ вручную."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream); recorder.current = r; chunks.current = []; cancelled.current = false;
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => { stream.getTracks().forEach(t => t.stop()); if (timer.current) clearTimeout(timer.current); if (!cancelled.current) void transcribe(new Blob(chunks.current, { type: r.mimeType })); };
      r.onerror = () => { cancelled.current = true; stream.getTracks().forEach(t => t.stop()); setStatus("idle"); setMessage("Запись прервалась. Попробуйте снова или введите ответ вручную."); };
      r.start(); setStatus("recording");
      timer.current = setTimeout(() => { cancelled.current = true; if (r.state === "recording") r.stop(); setStatus("idle"); setMessage("Запись слишком длинная: максимум 60 секунд. Попробуйте ещё раз или введите текст."); }, 60000);
    } catch { setStatus("idle"); setMessage("Не удалось получить доступ к микрофону. Проверьте разрешение браузера или введите ответ вручную."); }
  }
  function stopRecording(cancel = false) { cancelled.current = cancel; if (recorder.current?.state === "recording") recorder.current.stop(); if (cancel) { setStatus("idle"); setNotice("Запись отменена. Можно попробовать снова или ввести ответ вручную."); } }
  async function generate(nextAnswers = answers) {
    setStatus("generating"); setMessage("");
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
    if (!answers[step].trim()) { setMessage("Добавьте ответ, чтобы продолжить."); return; }
    if (answers[step].trim().length < 15) { setMessage("Ответ получился коротким. Добавьте, пожалуйста, немного подробностей."); return; }
    setConfirmed(c => c.map((v, i) => i === step ? true : v)); setMessage(""); setNotice("");
    if (step < 3) setStep(step + 1); else void generate();
  }
  async function copy() { try { await navigator.clipboard.writeText(vacancy?.vacancy_text || ""); setCopied(true); } catch { setMessage("Не удалось скопировать текст. Выделите его и скопируйте вручную."); } }
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon"><Sparkles size={20}/></span><span>искра<span className="brand-dot">.</span></span></div><div className="top-right"><span className="top-label">ВАШ ПОМОЩНИК В НАЙМЕ</span><span className="avatar">И</span></div></header>
    <main className="workspace">
      <div className="breadcrumb"><span>Рабочее пространство</span><span>/</span><strong>Создание вакансии</strong></div>
      {mock && <div className="mock-banner">Демонстрационный режим: ответы обрабатываются локально, Gemini не используется.</div>}
      <div className="layout">
        <aside className="sidebar"><div className="side-label">СОЗДАНИЕ ВАКАНСИИ</div><h2>Расскажите о роли.<br/><span>Мы поможем с остальным.</span></h2><p>Несколько простых вопросов — и основа вакансии будет готова.</p><div className="side-divider"/><div className="side-steps">{["Знакомство", "Четыре вопроса", "Готовый черновик"].map((label, i) => <div key={label} className={`side-step ${(screen === "intro" ? 0 : screen === "wizard" ? 1 : 2) === i ? "active" : ""}`}><span>{i + 1}</span>{label}</div>)}</div><div className="side-bottom"><Sparkles size={17}/><span>Меньше рутины.<br/><b>Больше времени для людей.</b></span></div></aside>
        <section className="content">
          {screen === "intro" ? <div className="intro panel"><div className="eyebrow"><span className="eyebrow-dot"/> НОВАЯ ВАКАНСИЯ</div><div className="intro-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-center"><Sparkles size={38} strokeWidth={1.5}/></div><span className="art-star">✳</span></div><h1>Давайте создадим<br/><em>вакансию вместе</em></h1><p className="lead">Расскажите о будущем сотруднике своими словами, а Искра поможет собрать всё в понятное описание.</p><div className="intro-facts"><div><span>01</span><p><b>Ответьте на 4 вопроса</b><br/>Голосом или текстом</p></div><div><span>02</span><p><b>Проверьте результат</b><br/>Ответы и черновик можно изменить</p></div></div><Button className="primary-button" onClick={() => setScreen("wizard")}>Начать создание <ArrowRight/></Button><p className="privacy">Используйте только вымышленные данные для тестирования.</p></div> : screen === "wizard" ? <div className="wizard panel"><div className="wizard-top"><div><div className="eyebrow"><span className="eyebrow-dot"/> СОЗДАЁМ ВАКАНСИЮ</div><p className="step-count">ВОПРОС {String(step + 1).padStart(2, "0")} <span>/ 04</span></p></div><div className="ring" role="progressbar" aria-label="Подтверждено ответов" aria-valuemin={0} aria-valuemax={4} aria-valuenow={count}><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="ring-bg" cx="50" cy="50" r="43"/><circle className="ring-fill" cx="50" cy="50" r="43" strokeDasharray={`${count / 4 * 270.18} 270.18`}/></svg><div><b>{count}<small>/4</small></b><span>готово</span></div></div></div><h1>{questions[step].title}</h1><p className="lead">{questions[step].hint}</p><div className="answer-card"><div className="answer-head"><div className="answer-icon"><Mic size={20}/></div><div><h3>Ваш ответ</h3><p>Запишите голосом или напишите текст</p></div></div><div className="record-area"><Button variant="outline" className={`record-button ${status === "recording" ? "recording" : ""}`} disabled={status === "transcribing" || status === "generating"} onClick={() => status === "recording" ? stopRecording() : void startRecording()}>{status === "recording" ? <><Square size={16}/> Остановить запись</> : <><Mic size={16}/> Записать ответ</>}</Button>{status === "recording" ? <Button variant="ghost" onClick={() => stopRecording(true)}>Отменить</Button> : <span>до 60 секунд</span>}</div><p className="voice-privacy">{mock ? "В деморежиме запись не отправляется и расшифровка вымышленная." : "Короткая запись будет отправлена в Gemini для расшифровки. Используйте только вымышленные данные."}</p><div className="or"><span/>или текстом<span/></div><label className="sr-only" htmlFor="answer">Ответ на вопрос {step + 1}</label><textarea id="answer" value={answers[step]} onChange={e => changeAnswer(e.target.value)} placeholder={questions[step].example} disabled={status !== "idle"}/><div className="answer-footer"><span>{status === "transcribing" ? "Распознаём запись…" : "Ответ можно отредактировать"}</span><span>{answers[step].length} символов</span></div></div>{message && <div className="alert" role="alert">{message}</div>}{notice && <div className="notice" role="status"><CheckCircle2 size={16}/>{notice}</div>}<div className="wizard-actions"><Button variant="ghost" className="back-button" disabled={status !== "idle"} onClick={() => { setMessage(""); setNotice(""); if (step === 0) setScreen("intro"); else setStep(step - 1); }}><ArrowLeft/> Назад</Button><Button className="primary-button" disabled={status !== "idle"} onClick={next}>{status === "generating" ? "Готовим черновик…" : step === 3 ? "Создать черновик" : "Подтвердить и далее"}<ArrowRight/></Button></div><div className="tip"><Lightbulb size={18}/><p><b>Небольшая подсказка</b><br/>Говорите так, как рассказали бы коллеге. Не нужно подбирать идеальные формулировки.</p></div></div> : vacancy && <div className="result panel"><div className="eyebrow"><span className="eyebrow-dot"/> ВСЁ ГОТОВО</div><div className="result-heading"><div><h1>Черновик вакансии <span>готов!</span></h1><p className="lead">Проверьте текст и дополните его перед публикацией.</p></div><div className="result-icon"><WandSparkles size={27}/></div></div><div className="result-card"><div className="result-card-head"><div><FileText size={18}/><b>Описание вакансии</b></div><Button variant="outline" onClick={copy}><Clipboard/>{copied ? "Скопировано" : "Скопировать"}</Button></div><label htmlFor="vacancy" className="sr-only">Текст вакансии</label><textarea id="vacancy" value={vacancy.vacancy_text} onChange={e => { setVacancy({ ...vacancy, vacancy_text: e.target.value }); setCopied(false); }}/></div>{message && <div className="alert" role="alert">{message}</div>}<div className="missing"><Lightbulb size={19}/><div><b>Что ещё стоит уточнить</b><p>{vacancy.missing_information.length ? vacancy.missing_information.join(" · ") : "Дополнительные сведения не отмечены. Проверьте черновик перед использованием."}</p></div></div><div className="review-title"><h3>Ваши ответы</h3><span>4 из 4</span></div><div className="review-list">{questions.map((q, i) => <div key={q.title}><span className="review-check"><Check size={14}/></span><div><b>{q.title}</b><p>{answers[i]}</p></div><Button variant="ghost" onClick={() => { setStep(i); setScreen("wizard"); setMessage(""); }}>Изменить</Button></div>)}</div><Button variant="ghost" className="restart" onClick={() => { setScreen("intro"); setStep(0); setAnswers(["", "", "", ""]); setConfirmed([false, false, false, false]); setVacancy(null); setMessage(""); }}><RotateCcw/> Начать заново</Button></div>}
        </section>
      </div><footer>ИСКРА <span>✳</span> ПОМОГАЕТ НАХОДИТЬ СВОИХ</footer>
    </main>
  </div>;
}
