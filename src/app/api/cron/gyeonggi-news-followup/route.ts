import { handleGyeonggiNewsCron } from "../gyeonggi-news/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  return handleGyeonggiNewsCron(req, { runLabel: "followup", publishedAtTime: "09:30" });
}
