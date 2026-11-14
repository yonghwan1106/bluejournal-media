import "server-only";
import { getDb } from "@/db";
import { cronRuns } from "@/db/schema";
export async function recordCronRun(entries:{
  job?:string;sourceAgency:string;fetched?:number;published?:number;
  skipped?:number;failed?:number;errorText?:string|null;
}[]):Promise<void>{
  if(!entries.length)return;
  await getDb().insert(cronRuns).values(entries.map(r=>({
    job:r.job??"gyeonggi-news",sourceAgency:r.sourceAgency,fetched:r.fetched??0,
    published:r.published??0,skipped:r.skipped??0,failed:r.failed??0,errorText:r.errorText??null
  })));
}
