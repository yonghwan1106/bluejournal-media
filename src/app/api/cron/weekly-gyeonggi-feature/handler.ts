import { runWeeklyGyeonggiFeature, type WeeklyFeatureAttempt } from "@/lib/weekly-gyeonggi-feature";
import { authorizeCronRequest } from "@/lib/cron-auth";

export async function handleWeeklyFeatureCron(
  req: Request,
  attempt: WeeklyFeatureAttempt,
): Promise<Response> {
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) {
    if (authorization.status === 503) {
      console.error("[weekly-feature] CRON_SECRET가 설정되지 않아 요청을 거부했습니다.");
    }
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    const result = await runWeeklyGyeonggiFeature({ attempt, dryRun });
    return Response.json(result, { status: result.status === "hold" ? 422 : 200 });
  } catch (error) {
    console.error(`[weekly-feature] ${attempt} 실행 실패:`, error);
    return Response.json(
      { error: "weekly feature failed", attempt, message: (error as Error).message },
      { status: 500 },
    );
  }
}
