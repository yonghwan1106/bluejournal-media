import { confirmSubscriber } from "@/lib/admin-db";

export const runtime = "nodejs";

function page(msg: string): Response {
  const home = process.env.NEXT_PUBLIC_SITE_URL || "/";
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;padding:0 16px">
       <h2 style="color:#0b4ea2">경인블루저널 뉴스레터</h2>
       <p style="font-size:16px;line-height:1.6">${msg}</p>
       <p><a href="${home}" style="color:#0b4ea2">홈으로 →</a></p>
     </div>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const email = token ? await confirmSubscriber(token) : null;
  return page(
    email
      ? "✅ 구독이 확인되었습니다. 매주 경인블루저널 소식을 받아보세요!"
      : "⚠️ 유효하지 않거나 만료된 링크입니다.",
  );
}
