import { readFile } from "node:fs/promises";
const payload=JSON.parse(await readFile("docs/articles/feature-2026-11-14-payload.json","utf8"));
if(!process.argv.includes("--publish")){console.log(JSON.stringify({ready:true,title:payload.title,section:payload.section,mode:"existing article API"}));process.exit(0);}
if(!process.env.NEWS_API_KEY)throw new Error("기존 NEWS_API_KEY가 필요합니다. 키를 코드나 로그에 저장하지 마세요.");
const listing=await fetch("https://bluejournal.co.kr/section/"+encodeURIComponent("특집"),{cache:"no-store",signal:AbortSignal.timeout(20000)});
if(!listing.ok)throw new Error("중복 확인에 실패했습니다.");
if((await listing.text()).includes(payload.title)){console.log("동일 제목이 있어 중복 발행을 중단했습니다.");process.exit(0);}
const result=await fetch("https://bluejournal.co.kr/api/admin/articles",{method:"POST",redirect:"error",headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.NEWS_API_KEY},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
if(!result.ok)throw new Error("기사 등록 실패: HTTP "+result.status);
const published=await result.json();console.log(JSON.stringify({articleId:published.id,url:published.url}));
