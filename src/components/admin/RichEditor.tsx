"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import Youtube from "@tiptap/extension-youtube";
import { useEffect, useRef, useState } from "react";
import { MediaLibrary } from "./MediaLibrary";

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

const Sep = () => <span className="mx-1 h-5 w-px bg-line" />;

/**
 * 본문 리치 에디터(Tiptap). HTML 출력 → 공개 렌더 시 sanitizeBodyHtml 로 정화.
 * 이미지(툴바/붙여넣기/드래그→R2)·표·유튜브 임베드 + localStorage 자동저장(복구).
 */
export function RichEditor({
  initialHTML,
  onChange,
  storageKey,
}: {
  initialHTML: string;
  onChange: (html: string) => void;
  storageKey?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [recover, setRecover] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Image.configure({ allowBase64: false }),
      TableKit.configure({ table: { resizable: true } }),
      Youtube.configure({ controls: true, nocookie: true, width: 640, height: 360 }),
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
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      if (storageKey) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          try {
            localStorage.setItem(`bj_draft_${storageKey}`, html);
          } catch {
            /* 용량 초과 등 무시 */
          }
        }, 800);
      }
    },
  });

  // 자동저장 복구: 저장 안 한 이전 작성분이 있으면 안내
  useEffect(() => {
    if (!editor || !storageKey) return;
    try {
      const saved = localStorage.getItem(`bj_draft_${storageKey}`);
      if (saved && saved !== (initialHTML || "") && saved !== editor.getHTML()) {
        setRecover(saved);
      }
    } catch {
      /* 무시 */
    }
    // editor 준비 시 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addYoutube = () => {
    if (!editor) return;
    const url = window.prompt("유튜브 영상 URL");
    if (url) editor.commands.setYoutubeVideo({ src: url });
  };

  const inTable = editor?.isActive("table") ?? false;

  return (
    <div className="rounded-md border border-line">
      {recover && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>저장하지 않은 이전 작성 내용이 있습니다.</span>
          <button
            type="button"
            className="rounded bg-amber-600 px-2 py-0.5 font-bold text-white"
            onClick={() => {
              if (editor && recover) {
                editor.commands.setContent(recover);
                onChange(recover);
              }
              setRecover(null);
            }}
          >
            복구
          </button>
          <button
            type="button"
            className="rounded border border-amber-300 px-2 py-0.5"
            onClick={() => {
              try {
                if (storageKey) localStorage.removeItem(`bj_draft_${storageKey}`);
              } catch {
                /* 무시 */
              }
              setRecover(null);
            }}
          >
            무시
          </button>
        </div>
      )}
      {editor && (
        <div className="flex flex-wrap items-center gap-1 border-b border-line bg-[#f7f8fa] px-2 py-1.5">
          <Btn title="굵게" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></Btn>
          <Btn title="기울임" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></Btn>
          <Btn title="취소선" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Btn>
          <Sep />
          <Btn title="제목2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Btn>
          <Btn title="제목3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Btn>
          <Sep />
          <Btn title="글머리 목록" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>• 목록</Btn>
          <Btn title="번호 목록" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. 목록</Btn>
          <Btn title="인용" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</Btn>
          <Sep />
          <Btn title="링크" active={editor.isActive("link")} onClick={setLink}>🔗</Btn>
          <Btn title="이미지 삽입" onClick={() => fileRef.current?.click()}>🖼 이미지</Btn>
          <MediaLibrary
            label="📁 라이브러리"
            buttonClassName="rounded px-2 py-1 text-sm font-semibold text-ink hover:bg-brand-light"
            onSelect={(url) => editor.chain().focus().setImage({ src: url }).run()}
          />
          <Btn title="표 삽입" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦ 표</Btn>
          <Btn title="영상(YouTube) 삽입" onClick={addYoutube}>▶ 영상</Btn>
          {uploading && <span className="ml-1 text-xs text-muted">업로드중…</span>}
          <Sep />
          <Btn title="실행취소" onClick={() => editor.chain().focus().undo().run()}>↶</Btn>
          <Btn title="다시실행" onClick={() => editor.chain().focus().redo().run()}>↷</Btn>
          {inTable && (
            <>
              <Sep />
              <Btn title="행 추가" onClick={() => editor.chain().focus().addRowAfter().run()}>+행</Btn>
              <Btn title="열 추가" onClick={() => editor.chain().focus().addColumnAfter().run()}>+열</Btn>
              <Btn title="행 삭제" onClick={() => editor.chain().focus().deleteRow().run()}>−행</Btn>
              <Btn title="열 삭제" onClick={() => editor.chain().focus().deleteColumn().run()}>−열</Btn>
              <Btn title="표 삭제" onClick={() => editor.chain().focus().deleteTable().run()}>표삭제</Btn>
            </>
          )}
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
