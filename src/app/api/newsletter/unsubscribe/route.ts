import { removeSubscriber } from "@/lib/admin-db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const ok = token ? await removeSubscriber(token) : false;
  const msg = ok
    ? "수신거부 처리되었습니다. 그동안 이용해 주셔서 감사합니다."
    : "⚠️ 유효하지 않은 링크입니다.";
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;padding:0 16px">
       <h2 style="color:#0b4ea2">경인블루저널 뉴스레터</h2>
       <p style="font-size:16px;line-height:1.6">${msg}</p>
     </div>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
