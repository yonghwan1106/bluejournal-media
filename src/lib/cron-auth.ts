export type CronAuthorizationResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: "unauthorized" | "cron secret not configured" };

/** 모든 cron 경로가 같은 fail-closed, Authorization Bearer 전용 정책을 사용한다. */
export function authorizeCronRequest(
  req: Request,
  secret: string | undefined = process.env.CRON_SECRET,
): CronAuthorizationResult {
  if (!secret) {
    return { ok: false, status: 503, error: "cron secret not configured" };
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}
