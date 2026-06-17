"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { setSession, clearSession, checkCredentials, requireAdmin } from "@/lib/auth";
import {
  adminCreateArticle,
  adminUpdateArticle,
  adminDeleteArticle,
  adminRestoreArticle,
  adminPurgeArticle,
  saveRevision,
  restoreRevision,
} from "@/lib/admin-db";
import { kstInputToDate } from "@/lib/format";
import type { NewArticle } from "@/db/schema";

const STATUSES = ["published", "draft", "hidden"] as const;
type ArticleStatus = (typeof STATUSES)[number];
/** 허용된 status 값만 통과 — 잘못된 값으로 인한 PG enum 제약 위반(500)을 방지. */
function normStatus(v: unknown, fallback: ArticleStatus): ArticleStatus {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v)
    ? (v as ArticleStatus)
    : fallback;
}

/**
 * 발행/수정/삭제 시 영향받는 공개 경로를 즉시 무효화(ISR 갱신 대기 없이 반영).
 * 섹션/지역은 route-pattern 형으로 무효화 → 한글 세그먼트 인코딩 footgun 회피 +
 * 기사 이동(구→신 섹션) / 삭제 시 구 목록까지 한 번에 갱신(순서·값 무관).
 */
function revalidatePublic(id?: number) {
  revalidatePath("/"); // 홈(헤드라인/최신)
  revalidatePath("/admin");
  revalidatePath("/section/[section]", "page"); // 모든 섹션 목록
  revalidatePath("/region/[region]", "page"); // 모든 지역 목록
  if (id) revalidatePath(`/news/${id}`); // 해당 기사 상세
}

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
    // viewCount 는 의도적으로 제외 — 수정 시 0으로 덮어쓰지 않도록(신규는 스키마 default 0).
    status: normStatus(str("status"), "draft"),
    // datetime-local 값은 KST 벽시계 → 정확한 instant 로 변환
    publishedAt: pub ? kstInputToDate(pub) : new Date(),
  };
}

export async function createArticleAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(formData);
  if (!data.title) redirect("/admin/articles/new?error=title");
  let id: number;
  try {
    id = await adminCreateArticle(data);
  } catch (e) {
    console.error("[admin] 기사 생성 실패:", e);
    redirect("/admin/articles/new?error=save");
  }
  revalidatePublic(id);
  redirect(`/admin/articles/${id}/edit?saved=1`);
}

export async function updateArticleAction(id: number, formData: FormData) {
  await requireAdmin();
  const data = parseForm(formData);
  if (!data.title) redirect(`/admin/articles/${id}/edit?error=title`);
  try {
    await saveRevision(id); // 저장 직전 상태를 이력으로(베스트 에포트)
  } catch (e) {
    console.error("[admin] 이력 저장 실패:", e);
  }
  try {
    await adminUpdateArticle(id, data);
  } catch (e) {
    console.error("[admin] 기사 수정 실패:", e);
    redirect(`/admin/articles/${id}/edit?error=save`);
  }
  revalidatePublic(id);
  redirect(`/admin/articles/${id}/edit?saved=1`);
}

export async function deleteArticleAction(id: number) {
  await requireAdmin();
  try {
    await adminDeleteArticle(id);
  } catch (e) {
    console.error("[admin] 기사 삭제 실패:", e);
    redirect(`/admin/articles/${id}/edit?error=delete`);
  }
  revalidatePublic(id);
  redirect("/admin?deleted=1");
}

/** 목록에서 발행/숨김 즉시 토글. returnTo 로 현재 필터·페이지를 보존한다. */
export async function setStatusAction(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const status = normStatus(formData.get("status"), "draft");
  const returnTo = String(formData.get("returnTo") || "/admin");
  if (Number.isFinite(id)) {
    try {
      await adminUpdateArticle(id, { status });
      revalidatePublic(id);
    } catch (e) {
      console.error("[admin] 상태 변경 실패:", e);
    }
  }
  redirect(returnTo);
}

/** 휴지통에서 복원. */
export async function restoreArticleAction(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("returnTo") || "/admin?trash=1");
  if (Number.isFinite(id)) {
    try {
      await adminRestoreArticle(id);
      revalidatePublic(id);
    } catch (e) {
      console.error("[admin] 복원 실패:", e);
    }
  }
  redirect(returnTo);
}

/** 영구 삭제(되돌릴 수 없음). */
export async function purgeArticleAction(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const returnTo = String(formData.get("returnTo") || "/admin?trash=1");
  if (Number.isFinite(id)) {
    try {
      await adminPurgeArticle(id);
    } catch (e) {
      console.error("[admin] 영구삭제 실패:", e);
    }
  }
  redirect(returnTo);
}

/** 특정 이력 버전으로 되돌리기(현재 상태도 이력에 저장됨). */
export async function restoreRevisionAction(formData: FormData) {
  await requireAdmin();
  const articleId = Number(formData.get("articleId"));
  const revId = Number(formData.get("revId"));
  if (Number.isFinite(articleId) && Number.isFinite(revId)) {
    try {
      await restoreRevision(articleId, revId);
      revalidatePublic(articleId);
    } catch (e) {
      console.error("[admin] 되돌리기 실패:", e);
      redirect(`/admin/articles/${articleId}/edit?error=save`);
    }
  }
  redirect(`/admin/articles/${articleId}/edit?saved=1`);
}
