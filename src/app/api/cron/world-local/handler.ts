import { authorizeCronRequest } from "@/lib/cron-auth";
import { runWorldLocal } from "@/lib/world-local";
export async function handleWorldLocal(req: Request, attempt: "prepare"|"retry") {
  const auth=authorizeCronRequest(req);
  if(!auth.ok)return Response.json({error:auth.error},{status:auth.status});
  const dryRun=new URL(req.url).searchParams.get("dryRun")==="1";
  // Preview deployments must never publish to the production database.
  if(!dryRun && process.env.VERCEL_ENV==="preview")return Response.json({error:"preview is read-only"},{status:409});
  try {
    const result=await runWorldLocal({attempt,dryRun});
    return Response.json(result,{status:result.status==="failed"?500:result.status==="hold"?422:200});
  }catch{
    return Response.json({error:"세계 자치모델 실행 실패"},{status:500});
  }
}
