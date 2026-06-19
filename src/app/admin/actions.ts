"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  setSession,
  clearSession,
  requireAdmin,
  requireRole,
  authenticate,
  canPublish,
  canEditArticle,
} from "@/lib/auth";
import type { Role } from "@/lib/auth";
import {
  adminCreateArticle,
  adminUpdateArticle,
  adminDeleteArticle,
  adminRestoreArticle,
  adminPurgeArticle,
  adminGetArticle,
  saveRevision,
  restoreRevision,
  createUser,
  deleteUser,
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

/** 발행/수정/삭제 시 영향받는 공개 경로를 즉시 무효화(ISR 갱신 대기 없이 반영). */
function revalidatePublic(id?: number) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/section/[section]", "page");
  revalidatePath("/region/[region]", "page");
  if (id) revalidatePath(`/news/${id}`);
}

export async function loginAction(formData: FormData) {
  const u = String(formData.get("username") ?? "");
  const p = String(formData.get("password") ?? "");
  const session = await authenticate(u, p);
  if (!session) redirect("/admin/login?error=1");
  await setSession(session);
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
  const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const subtitle = str("subtitle");
  const thumbnailUrl = str("thumbnailUrl");
  const tags = (str("tags") ?? "")
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
  const pub = str("publishedAt");
  return {
    board: "news",
    title: String(fd.get("title") ?? "").trim(),
    subtitle,
    reporterName: str("reporterName") ?? "경인블루저널",
    reporterEmail: null,
    section: str("section") ?? "뉴스",
    region: str("region"),
    displaySlot: str("displaySlot"),
    thumbnailUrl,
    bodyHtml: body,
    bodyText: plain.slice(0, 400) || null,
    source: str("source"),
    sourceUrl: str("sourceUrl"),
    tags,
    // SEO·공유 메타: 입력 없으면 부제 → 본문 앞부분으로 자동 채움. OG 이미지=대표이미지.
    metaDescription: str("metaDescription") || subtitle || plain.slice(0, 150) || null,
    ogImage: thumbnailUrl,
    // viewCount 제외(수정 시 0 덮어쓰기 방지), status 는 권한에 따라 액션에서 보정
    status: normStatus(str("status"), "draft"),
    publishedAt: pub ? kstInputToDate(pub) : new Date(),
  };
}

export async function createArticleAction(formData: FormData) {
  const s = await requireAdmin();
  const data = parseForm(formData);
  if (!data.title) redirect("/admin/articles/new?error=title");
  if (!canPublish(s)) data.status = "draft"; // 기자는 발행 불가 → 초안
  data.authorId = s.uid; // 작성자 기록
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
  const s = await requireAdmin();
  const existing = await adminGetArticle(id);
  if (!existing) redirect("/admin");
  if (!canEditArticle(s, existing.authorId)) redirect("/admin?denied=1");
  const data = parseForm(formData);
  if (!data.title) redirect(`/admin/articles/${id}/edit?error=title`);
  if (!canPublish(s)) data.status = existing.status; // 기자는 상태 변경 불가(현 상태 유지)
  try {
    await saveRevision(id); // 저장 직전 상태 이력화(베스트 에포트)
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
  const s = await requireAdmin();
  const existing = await adminGetArticle(id);
  if (existing && !canEditArticle(s, existing.authorId)) redirect("/admin?denied=1");
  try {
    await adminDeleteArticle(id);
  } catch (e) {
    console.error("[admin] 기사 삭제 실패:", e);
    redirect(`/admin/articles/${id}/edit?error=delete`);
  }
  revalidatePublic(id);
  redirect("/admin?deleted=1");
}

/** 목록에서 발행/숨김 즉시 토글(발행 권한 필요). */
export async function setStatusAction(formData: FormData) {
  const s = await requireAdmin();
  if (!canPublish(s)) redirect("/admin?denied=1");
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

/** 휴지통에서 복원(발행 권한 필요). */
export async function restoreArticleAction(formData: FormData) {
  const s = await requireAdmin();
  if (!canPublish(s)) redirect("/admin?denied=1");
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

/** 영구 삭제(되돌릴 수 없음, 발행 권한 필요). */
export async function purgeArticleAction(formData: FormData) {
  const s = await requireAdmin();
  if (!canPublish(s)) redirect("/admin?denied=1");
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

/** 특정 이력 버전으로 되돌리기(본인 글 또는 편집장·관리자). */
export async function restoreRevisionAction(formData: FormData) {
  const s = await requireAdmin();
  const articleId = Number(formData.get("articleId"));
  const revId = Number(formData.get("revId"));
  const existing = Number.isFinite(articleId) ? await adminGetArticle(articleId) : null;
  if (existing && !canEditArticle(s, existing.authorId)) redirect("/admin?denied=1");
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

// ───────── 계정 관리(관리자 전용) ─────────

export async function createUserAction(formData: FormData) {
  await requireRole(["admin"]);
  const username = String(formData.get("username") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim() || null;
  const roleRaw = String(formData.get("role") ?? "reporter");
  const role: Role = (["admin", "editor", "reporter"].includes(roleRaw)
    ? roleRaw
    : "reporter") as Role;
  if (!username || !name || password.length < 6) {
    redirect("/admin/users?error=invalid");
  }
  try {
    await createUser({ username, name, password, role, email });
  } catch (e) {
    console.error("[admin] 계정 생성 실패:", e);
    redirect("/admin/users?error=dup");
  }
  redirect("/admin/users?created=1");
}

export async function deleteUserAction(formData: FormData) {
  await requireRole(["admin"]);
  const id = Number(formData.get("id"));
  if (Number.isFinite(id)) {
    try {
      await deleteUser(id);
    } catch (e) {
      console.error("[admin] 계정 삭제 실패:", e);
    }
  }
  redirect("/admin/users");
}
