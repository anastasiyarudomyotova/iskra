"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Underline, List, ListOrdered, Heading2, Undo2, Redo2 } from "lucide-react";

type Props = { content: JSONContent; editorRef: MutableRefObject<Editor | null>; onChange: (content: JSONContent) => void };
export function RichDraftEditor({ content, editorRef, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2] }, link: false })],
    content, immediatelyRender: false,
    editorProps: { attributes: { class: "rich-text-area", role: "textbox", "aria-label": "Текст вакансии", "aria-multiline": "true" } },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
  });
  const state = useEditorState({ editor, selector: ({ editor }) => editor ? {
    bold: editor.isActive("bold"), italic: editor.isActive("italic"), underline: editor.isActive("underline"),
    bullet: editor.isActive("bulletList"), ordered: editor.isActive("orderedList"), heading: editor.isActive("heading", { level: 2 }),
    undo: editor.can().undo(), redo: editor.can().redo(),
  } : null });
  useEffect(() => { editorRef.current = editor; return () => { if (editorRef.current === editor) editorRef.current = null; }; }, [editor, editorRef]);
  if (!editor) return null;
  const current = state ?? { bold: false, italic: false, underline: false, bullet: false, ordered: false, heading: false, undo: false, redo: false };
  const controls = [
    { label: "Жирный", icon: Bold, active: current.bold, action: () => editor.chain().focus().toggleBold().run() },
    { label: "Курсив", icon: Italic, active: current.italic, action: () => editor.chain().focus().toggleItalic().run() },
    { label: "Подчёркивание", icon: Underline, active: current.underline, action: () => editor.chain().focus().toggleUnderline().run() },
    { label: "Маркированный список", icon: List, active: current.bullet, action: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Нумерованный список", icon: ListOrdered, active: current.ordered, action: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Заголовок", icon: Heading2, active: current.heading, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Отменить", icon: Undo2, disabled: !current.undo, action: () => editor.chain().focus().undo().run() },
    { label: "Повторить", icon: Redo2, disabled: !current.redo, action: () => editor.chain().focus().redo().run() },
  ];
  return <div className="rich-editor"><div className="format-toolbar" role="group" aria-label="Форматирование текста">
    {controls.map(({ label, icon: Icon, active, disabled, action }) => <button key={label} type="button" aria-label={label} title={label} aria-pressed={active} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={action}><Icon size={17}/></button>)}
  </div><EditorContent editor={editor}/></div>;
}
