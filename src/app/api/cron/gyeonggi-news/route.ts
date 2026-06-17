import { revalidatePath } from "next/cache";
import { runDailyGyeonggiNews } from "@/lib/daily-gyeonggi-news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
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
    });

    if (!dryRun && result.published > 0) {
      revalidatePath("/");
      revalidatePath("/section/[section]", "page");
      revalidatePath("/region/[region]", "page");
      for (const item of result.results) {
        if (item.id) revalidatePath(`/news/${item.id}`);
      }
    }

    const status = result.failed > 0 && result.published === 0 ? 207 : 200;
    return Response.json(result, { status });
  } catch (error) {
    console.error("[cron] gyeonggi-news failed:", error);
    return Response.json(
      { error: "cron failed", message: (error as Error).message },
      { status: 500 },
    );
  }
}
