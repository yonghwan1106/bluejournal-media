"use client";

import { useState } from "react";

type MediaItem = { key: string; url: string; size: number };

/**
 * 미디어 라이브러리 — 트리거 버튼 + 모달. R2 업로드 이미지를 그리드로 보여주고
 * 선택 시 onSelect(url) 콜백(대표이미지 지정 / 본문 삽입 등에 재사용).
 */
export function MediaLibrary({
  label = "라이브러리",
  buttonClassName,
  onSelect,
}: {
  label?: string;
  buttonClassName?: string;
  onSelect: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/media");
      const j = await r.json();
      if (j.items) setItems(j.items as MediaItem[]);
      else setErr(j.error ?? "불러오기 실패");
    } catch {
      setErr("불러오기 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={
          buttonClassName ??
          "rounded px-2 py-1 text-sm font-semibold text-ink hover:bg-brand-light"
        }
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">미디어 라이브러리</h2>
              <button
                type="button"
                className="text-sm text-muted hover:text-ink"
                onClick={() => setOpen(false)}
              >
                닫기 ✕
              </button>
            </div>

            {loading && <p className="py-10 text-center text-muted">불러오는 중…</p>}
            {err && <p className="py-10 text-center text-accent">{err}</p>}
            {!loading && !err && items.length === 0 && (
              <p className="py-10 text-center text-muted">
                업로드된 이미지가 없습니다. (이미지를 업로드하면 여기에 모입니다)
              </p>
            )}

            {!loading && !err && items.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {items.map((it) => (
                  <button
                    key={it.key}
                    type="button"
                    title={it.key}
                    onClick={() => {
                      onSelect(it.url);
                      setOpen(false);
                    }}
                    className="group overflow-hidden rounded-md border border-line hover:border-brand"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.url}
                      alt=""
                      className="h-24 w-full object-cover transition group-hover:opacity-80"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
