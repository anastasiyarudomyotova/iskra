export const DRAFT_TOPICS = [
  { key: "daily_tasks", title: "Ежедневные задачи" },
  { key: "current_project", title: "Текущий проект" },
  { key: "next_six_months", title: "Планы на полгода" },
  { key: "tools_and_knowledge", title: "Инструменты и знания" },
] as const;

export type DraftSection = { topic: typeof DRAFT_TOPICS[number]["key"]; items: { text: string }[] };
export function sectionsFromGenerated(sections: DraftSection[]): string[] {
  return DRAFT_TOPICS.map(topic => sections.find(section => section.topic === topic.key)?.items.map(item => item.text).join("\n") ?? "");
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
