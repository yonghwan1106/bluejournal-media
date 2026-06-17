"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useRef, useState } from "react";

async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  return j.url ?? null;
}

function Btn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-2 py-1 text-sm font-semibold ${
        active ? "bg-brand text-white" : "text-ink hover:bg-brand-light"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * 본문 리치 에디터(Tiptap). HTML 을 출력하며, 공개 렌더 시 sanitizeBodyHtml 로 정화된다.
 * 이미지는 툴바/붙여넣기/드래그로 /api/admin/upload(R2) 업로드 후 인라인 삽입.
 */
export function RichEditor({
  initialHTML,
  onChange,
}: {
  initialHTML: string;
  onChange: (html: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleImageFile(file: File, editor: Editor | null) {
    if (!editor || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    } finally {
      setUploading(false);
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Tiptap v3 StarterKit 은 Link 를 내장하므로 옵션으로 설정(중복 확장 방지).
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Image.configure({ allowBase64: false }),
    ],
    content: initialHTML || "",
    editorProps: {
      attributes: {
        class:
          "article-body min-h-[320px] max-w-none px-4 py-3 focus:outline-none",
      },
      handlePaste: (_view, event) => {
        const f = Array.from(event.clipboardData?.files ?? []).find((x) =>
          x.type.startsWith("image/"),
        );
        if (f) {
          event.preventDefault();
          handleImageFile(f, editor);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const f = Array.from(
          (event as DragEvent).dataTransfer?.files ?? [],
        ).find((x) => x.type.startsWith("image/"));
        if (f) {
          event.preventDefault();
          handleImageFile(f, editor);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="rounded-md border border-line">
      {editor && (
        <div className="flex flex-wrap items-center gap-1 border-b border-line bg-[#f7f8fa] px-2 py-1.5">
          <Btn title="굵게" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></Btn>
          <Btn title="기울임" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></Btn>
          <Btn title="취소선" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Btn>
          <span className="mx-1 h-5 w-px bg-line" />
          <Btn title="제목2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
          <Btn title="제목3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
          <span className="mx-1 h-5 w-px bg-line" />
          <Btn title="글머리 목록" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>• 목록</Btn>
          <Btn title="번호 목록" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. 목록</Btn>
          <Btn title="인용" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
          <span className="mx-1 h-5 w-px bg-line" />
          <Btn title="링크" active={editor.isActive("link")} onClick={setLink}>🔗</Btn>
          <Btn title="이미지 삽입" onClick={() => fileRef.current?.click()}>🖼 이미지</Btn>
          {uploading && <span className="ml-1 text-xs text-muted">업로드중…</span>}
          <span className="mx-1 h-5 w-px bg-line" />
          <Btn title="실행취소" onClick={() => editor.chain().focus().undo().run()}>↶</Btn>
          <Btn title="다시실행" onClick={() => editor.chain().focus().redo().run()}>↷</Btn>
        </div>
      )}
      <EditorContent editor={editor} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImageFile(f, editor);
          e.target.value = "";
        }}
      />
    </div>
  );
}
