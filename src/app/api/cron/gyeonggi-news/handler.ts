import { revalidatePath } from "next/cache";
import { runDailyGyeonggiNews } from "@/lib/daily-gyeonggi-news";
import { authorizeCronRequest } from "@/lib/cron-auth";

type GyeonggiNewsCronConfig = {
  runLabel: "primary" | "followup";
  publishedAtTime: string;
};

export async function handleGyeonggiNewsCron(req: Request, config: GyeonggiNewsCronConfig) {
  const authorization = authorizeCronRequest(req);
  if (!authorization.ok) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date") || undefined;
  const dryRun = url.searchParams.get("dryRun") === "1";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const result = await runDailyGyeonggiNews({
      date,
      dryRun,
      limit: Number.isFinite(limit) ? limit : undefined,
      publishedAtTime: config.publishedAtTime,
    });

    if (!dryRun && result.published > 0) {
      revalidatePath("/");
      revalidatePath("/rss.xml");
      revalidatePath("/section/[section]", "page");
      revalidatePath("/region/[region]", "page");
      for (const item of result.results) {
        if (item.id) revalidatePath(`/news/${item.id}`);
      }
    }

    const status = result.failed > 0 && result.published === 0 ? 207 : 200;
    return Response.json({ ...result, runLabel: config.runLabel }, { status });
  } catch (error) {
    console.error(`[cron] gyeonggi-news ${config.runLabel} failed:`, error);
    return Response.json(
      { error: "cron failed", message: (error as Error).message, runLabel: config.runLabel },
      { status: 500 },
    );
  }
}
