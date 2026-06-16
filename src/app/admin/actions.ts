"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { setSession, clearSession, checkCredentials, requireAdmin } from "@/lib/auth";
import {
  adminCreateArticle,
  adminUpdateArticle,
  adminDeleteArticle,
} from "@/lib/admin-db";
import { kstInputToDate } from "@/lib/format";
import type { NewArticle } from "@/db/schema";

export async function loginAction(formData: FormData) {
  const u = String(formData.get("username") ?? "");
  const p = String(formData.get("password") ?? "");
  if (!checkCredentials(u, p)) redirect("/admin/login?error=1");
  await setSession(u);
  redirect("/admin");
}

export async function logoutAction() {
  await clearSession();
  redirect("/admin/login");
}

function parseForm(fd: FormData): Omit<NewArticle, "id"> {
  const str = (k: string) => {
    const v = fd.get(k);
    return v == null || v === "" ? null : String(v);
  };
  const body = String(fd.get("bodyHtml") ?? "");
  const tags = (str("tags") ?? "")
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
  const pub = str("publishedAt");
  return {
    board: "news",
    title: String(fd.get("title") ?? "").trim(),
    subtitle: str("subtitle"),
    reporterName: str("reporterName") ?? "경인블루저널",
    reporterEmail: null,
    section: str("section") ?? "뉴스",
    region: str("region"),
    displaySlot: str("displaySlot"),
    thumbnailUrl: str("thumbnailUrl"),
    bodyHtml: body,
    bodyText:
      body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) ||
      null,
    source: str("source"),
    sourceUrl: str("sourceUrl"),
    tags,
    viewCount: 0,
    status: (str("status") as "published" | "draft" | "hidden") ?? "draft",
    // datetime-local 값은 KST 벽시계 → 정확한 instant 로 변환
    publishedAt: pub ? kstInputToDate(pub) : new Date(),
  };
}

export async function createArticleAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(formData);
  if (!data.title) redirect("/admin/articles/new?error=title");
  const id = await adminCreateArticle(data);
  revalidatePath("/admin");
  redirect(`/admin/articles/${id}/edit?saved=1`);
}

export async function updateArticleAction(id: number, formData: FormData) {
  await requireAdmin();
  const data = parseForm(formData);
  await adminUpdateArticle(id, data);
  revalidatePath("/admin");
  revalidatePath(`/news/${id}`);
  redirect(`/admin/articles/${id}/edit?saved=1`);
}

export async function deleteArticleAction(id: number) {
  await requireAdmin();
  await adminDeleteArticle(id);
  revalidatePath("/admin");
  redirect("/admin");
}
