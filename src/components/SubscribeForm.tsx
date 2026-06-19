"use client";

import { useState } from "react";

/** 공개 뉴스레터 구독 폼(푸터). 이메일 입력 → /api/subscribe → 더블옵트인 확인메일. */
export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (j.ok) {
        setMsg("확인 메일을 보냈습니다. 메일함에서 구독을 확인해 주세요.");
        setEmail("");
      } else {
        setMsg(j.error ?? "오류가 발생했습니다.");
      }
    } catch {
      setMsg("오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 주소"
          className="flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          disabled={busy}
          className="rounded-md bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {busy ? "처리중…" : "구독"}
        </button>
      </form>
      {msg && <p className="mt-1.5 text-xs text-muted">{msg}</p>}
    </div>
  );
}
