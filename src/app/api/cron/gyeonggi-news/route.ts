import { handleGyeonggiNewsCron } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  return handleGyeonggiNewsCron(req, { runLabel: "primary", publishedAtTime: "08:40" });
}
