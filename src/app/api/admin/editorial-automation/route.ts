import { getSession, canPublish } from "@/lib/auth";
import { getDb } from "@/db";
import { siteConfig,weeklyFeatureRuns } from "@/db/schema";
import { desc,eq } from "drizzle-orm";
export const dynamic="force-dynamic";
export async function GET(req:Request){
  const session=await getSession();
  if(!session||!canPublish(session))return Response.json({error:"권한이 필요합니다."},{status:403});
  const key=new URL(req.url).searchParams.get("runKey");
  if(key){
    if(!/^(global-local-governance|gyeonggi-feature):\d{4}-\d{2}-\d{2}$/.test(key))return Response.json({error:"잘못된 실행 키"},{status:400});
    const [row]=await getDb().select().from(siteConfig).where(eq(siteConfig.key,"editorial:"+key));
    return Response.json(row?.value?JSON.parse(row.value):{checkpoint:null});
  }
  return Response.json(await getDb().select().from(weeklyFeatureRuns).orderBy(desc(weeklyFeatureRuns.updatedAt)).limit(30));
}
