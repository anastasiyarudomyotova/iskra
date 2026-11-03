export const DRAFT_TOPICS = [
  { key: "daily_tasks", title: "Ежедневные задачи" },
  { key: "current_project", title: "Текущий проект" },
  { key: "next_six_months", title: "Планы на полгода" },
  { key: "tools_and_knowledge", title: "Инструменты и знания" },
] as const;

/** Preserve the supplied text verbatim; do not infer facts from it. */
export function sectionsFromAnswers(answers: readonly string[]): string[] {
  return DRAFT_TOPICS.map((_, i) => answers[i] ?? "");
}

/** Plain text headings and bullets; no HTML or Markdown is copied. */
export function serializeDraft(sections: readonly string[]): string {
  return DRAFT_TOPICS.map((topic, i) => {
    const text = (sections[i] ?? "").trim();
    if (!text) return `${topic.title}\n`;
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    return `${topic.title}\n${lines.map(line => `• ${line.replace(/^[•]\s*/, "")}`).join("\n")}`;
  }).join("\n\n");
}
