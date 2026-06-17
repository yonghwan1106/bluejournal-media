import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE = "bj_admin";
const MAXAGE = 60 * 60 * 8; // 8시간

/**
 * 세션 서명 시크릿. 운영(production)에서 AUTH_SECRET 미설정 시 조용히 폴백하지 않고
 * 즉시 throw(fail-fast) — 알려진 폴백 시크릿으로 토큰이 위조되어 관리자 인증이
 * 우회되는 것을 차단한다. lazy 호출이라 빌드 단계(공개 페이지는 auth 미사용, 관리자/
 * API 는 동적 라우트라 빌드시 미실행)는 막지 않으며, 개발 환경에서만 폴백을 허용한다.
 */
function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET 환경변수가 설정되지 않았습니다. 운영 환경에서는 필수입니다.",
    );
  }
  return "dev-insecure-secret-change-me";
}

function sign(data: string) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createToken(username: string) {
  const payload = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + MAXAGE * 1000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token?: string): { u: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { u: data.u };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ u: string } | null> {
  const c = await cookies();
  return verifyToken(c.get(COOKIE)?.value);
}

export async function setSession(username: string) {
  const c = await cookies();
  c.set(COOKIE, createToken(username), {
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

/** 보호된 관리자 페이지 상단에서 호출 — 미인증 시 로그인으로 리다이렉트 */
export async function requireAdmin(): Promise<{ u: string }> {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  return s;
}

/** 관리자 로그인 검증 (env 자격증명). 미설정 시 로그인 불가(안전). */
export function checkCredentials(username: string, password: string): boolean {
  const U = process.env.ADMIN_USERNAME || "admin";
  const P = process.env.ADMIN_PASSWORD;
  if (!P) return false;
  // 타이밍 안전 비교
  const a = crypto.createHash("sha256").update(`${username}:${password}`).digest();
  const b = crypto.createHash("sha256").update(`${U}:${P}`).digest();
  return crypto.timingSafeEqual(a, b);
}
