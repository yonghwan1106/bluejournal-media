import { runWorldLocal } from "../src/lib/world-local";
import { runWeeklyGyeonggiFeature } from "../src/lib/weekly-gyeonggi-feature";
async function main(){
 for(const [name,run] of [
   ["world",()=>runWorldLocal({attempt:"prepare",dryRun:true})],
   ["weekly",()=>runWeeklyGyeonggiFeature({attempt:"prepare",dryRun:true})]
 ] as const){
  if(process.env.EDITORIAL_VERIFY_ONLY && process.env.EDITORIAL_VERIFY_ONLY!==name)continue;
  console.log("EDITORIAL_SMOKE_START "+name);
  try{
   const result=await run();
   console.log("EDITORIAL_SUMMARY "+name+" "+JSON.stringify({status:result.status,reason:"reason" in result?result.reason:undefined}));
   const encoded=Buffer.from(JSON.stringify(result)).toString("base64");
   for(let i=0;i<encoded.length;i+=700)console.log("EDITORIAL_SMOKE "+JSON.stringify({name,offset:i,data:encoded.slice(i,i+700)}));
   console.log("EDITORIAL_SMOKE_END "+name+" "+result.status);
  }catch(e){console.log("EDITORIAL_SMOKE_ERROR "+name+" "+(e instanceof Error?e.name:"unknown"));}
 }
}
main();
