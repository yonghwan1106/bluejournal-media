import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

const COOKIE = "bj_admin";
const MAXAGE = 60 * 60 * 8; // 8시간

export type Role = "admin" | "editor" | "reporter";
export type Session = { u: string; role: Role; uid: number | null };

/**
 * 세션 서명 시크릿. 운영(production)에서 AUTH_SECRET 미설정 시 즉시 throw(fail-fast) —
 * 알려진 폴백 시크릿으로 토큰이 위조되어 인증이 우회되는 것을 차단. 개발에서만 폴백.
 */
function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET 환경변수가 설정되지 않았습니다. 운영 환경에서는 필수입니다.");
  }
  return "dev-insecure-secret-change-me";
}

function sign(data: string) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

function envAdminName(): string {
  return process.env.ADMIN_USERNAME || "admin";
}

export function createToken(s: Session): string {
  const payload = Buffer.from(
    JSON.stringify({ u: s.u, r: s.role, uid: s.uid, exp: Date.now() + MAXAGE * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token?: string): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof d.exp !== "number" || d.exp < Date.now()) return null;
    // 구 토큰(역할 없음) 호환: env 관리자명이면 admin, 그 외는 reporter 로 보수적 처리
    const role: Role =
      d.r === "admin" || d.r === "editor" || d.r === "reporter"
        ? d.r
        : d.u === envAdminName()
          ? "admin"
          : "reporter";
    return { u: String(d.u), role, uid: typeof d.uid === "number" ? d.uid : null };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  return verifyToken(c.get(COOKIE)?.value);
}

export async function setSession(s: Session) {
  const c = await cookies();
  c.set(COOKIE, createToken(s), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAXAGE,
  });
}

export async function clearSession() {
  const c = await cookies();
  c.delete(COOKIE);
}

/** 로그인 필수(모든 역할). 미인증 시 로그인으로 리다이렉트. */
export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  return s;
}

/** 특정 역할 필수. 권한 없으면 대시보드로(거부 안내). */
export async function requireRole(roles: Role[]): Promise<Session> {
  const s = await requireAdmin();
  if (!roles.includes(s.role)) redirect("/admin?denied=1");
  return s;
}

/** 발행 권한: 관리자·편집장만(기자는 초안만). */
export function canPublish(s: Session): boolean {
  return s.role === "admin" || s.role === "editor";
}

/** 계정 관리 권한: 관리자만. */
export function canManageUsers(s: Session): boolean {
  return s.role === "admin";
}

/** 기사 편집 권한: 관리자·편집장은 전체, 기자는 본인 작성분만. */
export function canEditArticle(s: Session, authorId: number | null): boolean {
  if (s.role === "admin" || s.role === "editor") return true;
  return s.role === "reporter" && authorId != null && authorId === s.uid;
}

// ───────── 비밀번호 해시(scrypt, 외부 의존성 없음) ─────────
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  try {
    const [algo, saltHex, hashHex] = stored.split("$");
    if (algo !== "scrypt" || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(pw, Buffer.from(saltHex, "hex"), expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * 로그인 검증 → 세션 반환(없으면 null).
 * 1) env 슈퍼관리자(ADMIN_USERNAME/ADMIN_PASSWORD) → role=admin (잠김 방지 안전장치)
 * 2) users 테이블 계정(scrypt 해시) → 해당 role
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<Session | null> {
  const U = envAdminName();
  const P = process.env.ADMIN_PASSWORD;
  if (P && username === U) {
    const a = crypto.createHash("sha256").update(`${username}:${password}`).digest();
    const b = crypto.createHash("sha256").update(`${U}:${P}`).digest();
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { u: U, role: "admin", uid: null };
    }
  }
  if (process.env.DATABASE_URL) {
    try {
      const [row] = await getDb()
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (row && verifyPassword(password, row.passwordHash)) {
        return { u: row.username, role: row.role as Role, uid: row.id };
      }
    } catch (e) {
      console.error("[auth] 사용자 조회 실패:", e);
    }
  }
  return null;
}
