import type { JSONContent } from "@tiptap/react";

export const DRAFT_TOPICS = [
  { key: "daily_tasks", title: "Ежедневные задачи" },
  { key: "current_project", title: "Текущий проект" },
  { key: "next_six_months", title: "Планы на полгода" },
  { key: "tools_and_knowledge", title: "Инструменты и знания" },
] as const;
export type GeneratedBlock = { heading: string | null; type: "paragraph" | "bullet_list"; items: { text: string }[] };
export function documentFromBlocks(blocks: GeneratedBlock[]): JSONContent {
  const content: JSONContent[] = [];
  for (const block of blocks) {
    if (block.heading) content.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: block.heading }] });
    if (block.type === "paragraph") content.push({ type: "paragraph", content: [{ type: "text", text: block.items[0].text }] });
    else content.push({ type: "bulletList", content: block.items.map(item => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: item.text }] }] })) });
  }
  return { type: "doc", content };
}
/** Human-readable plain text, including list markers, without HTML or Markdown. */
export function plainText(document: JSONContent): string {
  function render(node: JSONContent, indent = ""): string {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    const children = node.content ?? [];
    if (node.type === "bulletList" || node.type === "orderedList") return children.map((child, index) => {
      const marker = node.type === "bulletList" ? "• " : `${(node.attrs?.start ?? 1) + index}. `;
      return indent + marker + render(child, indent + "  ");
    }).join("\n");
    if (node.type === "doc") return children.map(child => render(child, indent)).join("\n\n");
    if (node.type === "listItem") return children.map(child => render(child, indent)).join("\n");
    return children.map(child => render(child, indent)).join("");
  }
  return render(document).trim();
}
