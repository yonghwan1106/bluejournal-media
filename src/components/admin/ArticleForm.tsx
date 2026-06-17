"use client";

import { useState } from "react";
import type { Article } from "@/db/schema";
import { toKstInput } from "@/lib/format";
import { RichEditor } from "./RichEditor";

const field = "w-full rounded-md border border-line px-3 py-2 outline-none focus:border-brand";
const labelCls = "block text-sm font-bold mb-1";

export function ArticleForm({
  article,
  action,
}: {
  article?: Article;
  action: (fd: FormData) => void | Promise<void>;
}) {
  const [thumb, setThumb] = useState(article?.thumbnailUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [body, setBody] = useState(article?.bodyHtml ?? "");
  const storageKey = article ? String(article.id) : "new";

  const pubDate = article?.publishedAt ? new Date(article.publishedAt) : new Date();

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (j.url) {
        setThumb(j.url);
        setUploadMsg("업로드 완료");
      } else {
        setUploadMsg(j.error ?? "업로드 실패");
      }
    } catch {
      setUploadMsg("업로드 오류");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      action={action}
      onSubmit={() => {
        try {
          localStorage.removeItem(`bj_draft_${storageKey}`);
        } catch {
          /* 무시 */
        }
      }}
      className="space-y-5"
    >
      <div>
        <label className={labelCls}>제목 *</label>
        <input name="title" required defaultValue={article?.title ?? ""} className={field} />
      </div>
      <div>
        <label className={labelCls}>부제목</label>
        <input name="subtitle" defaultValue={article?.subtitle ?? ""} className={field} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className={labelCls}>섹션</label>
          <select name="section" defaultValue={article?.section ?? "뉴스"} className={field}>
            <option>뉴스</option>
            <option>특집</option>
            <option>탐사문학</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>지역</label>
          <select name="region" defaultValue={article?.region ?? ""} className={field}>
            <option value="">(없음)</option>
            <option>경기</option>
            <option>인천</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>출력위치</label>
          <select name="displaySlot" defaultValue={article?.displaySlot ?? ""} className={field}>
            <option value="">(없음)</option>
            <option>헤드라인</option>
            <option>주요뉴스</option>
            <option>중앙섹션</option>
            <option>우측섹션</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>상태</label>
          <select name="status" defaultValue={article?.status ?? "draft"} className={field}>
            <option value="published">출력중</option>
            <option value="draft">대기</option>
            <option value="hidden">숨김</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>기자명</label>
          <input name="reporterName" defaultValue={article?.reporterName ?? "경인블루저널"} className={field} />
        </div>
        <div>
          <label className={labelCls}>등록일시</label>
          <input type="datetime-local" name="publishedAt" defaultValue={toKstInput(pubDate)} className={field} />
        </div>
      </div>

      <div>
        <label className={labelCls}>대표이미지</label>
        <div className="flex items-center gap-3">
          <input name="thumbnailUrl" value={thumb} onChange={(e) => setThumb(e.target.value)} placeholder="URL 또는 파일 업로드" className={field} />
          <label className="shrink-0 cursor-pointer rounded-md bg-brand-light px-3 py-2 text-sm font-bold text-brand-dark">
            {uploading ? "업로드중…" : "업로드"}
            <input type="file" accept="image/*" onChange={upload} className="hidden" disabled={uploading} />
          </label>
        </div>
        {uploadMsg && <p className="mt-1 text-xs text-muted">{uploadMsg}</p>}
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="mt-2 h-32 rounded object-cover" />
        )}
      </div>

      <div>
        <label className={labelCls}>본문</label>
        <RichEditor
          initialHTML={article?.bodyHtml ?? ""}
          onChange={setBody}
          storageKey={storageKey}
        />
        <input type="hidden" name="bodyHtml" value={body} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>출처</label>
          <input name="source" defaultValue={article?.source ?? ""} className={field} />
        </div>
        <div>
          <label className={labelCls}>출처 링크</label>
          <input name="sourceUrl" defaultValue={article?.sourceUrl ?? ""} className={field} />
        </div>
      </div>

      <div>
        <label className={labelCls}>태그 (쉼표 구분)</label>
        <input name="tags" defaultValue={(article?.tags ?? []).join(", ")} className={field} />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="rounded-md bg-brand px-6 py-2.5 font-bold text-white hover:bg-brand-dark">
          저장
        </button>
        <a href="/admin" className="rounded-md border border-line px-6 py-2.5 font-bold text-muted hover:text-ink">
          취소
        </a>
      </div>
    </form>
  );
}
