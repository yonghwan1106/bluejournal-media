import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const article=JSON.parse(await readFile("docs/articles/feature-2026-11-14.json","utf8"));
const text=[article.lead,...article.sections.flatMap(s=>s.paragraphs)].join("\n\n");
const escape=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
if(article.automationKey!=="gyeonggi-feature:2026-11-14"||article.section!=="특집"||
 article.review.decision!=="MANUAL_REVIEW"||article.sources.length!==6||text.length<2500||text.length>5000)throw new Error("Editorial validation failed");
for(const source of article.sources){
 const u=new URL(source.url);
 if(u.protocol!=="https:"||u.username||u.password||!["gnews.gg.go.kr","www.molit.go.kr","www.incheon.go.kr","m1.gimpo.go.kr"].includes(u.hostname))throw new Error("Unexpected source");
}
for(const section of article.sections)if(section.sources.some(id=>!article.sources[id-1]))throw new Error("Invalid citation");
const photo=await readFile(article.photo.path);
if(photo.length<10000||photo.toString("ascii",0,4)!=="RIFF"||photo.toString("ascii",8,12)!=="WEBP")throw new Error("Invalid photo");
const contentHash=createHash("sha256").update(JSON.stringify(article)).digest("hex");
if(!process.argv.includes("--publish")){
 console.log(JSON.stringify({validation:"PASS",title:article.title,bodyChars:text.length,sources:article.sources.length,photoBytes:photo.length,contentHash}));process.exit(0);
}
if(process.env.VERCEL_ENV!=="production")throw new Error("Production context required for explicitly requested publication");
if(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())!=="2026-11-14"){
 console.log("FEATURE_PUBLICATION_SKIPPED: one-off date has passed");process.exit(0);
}
if(!process.env.DATABASE_URL)throw new Error("Database not configured");
const sql=neon(process.env.DATABASE_URL);
const existing=await sql.query("select id,title,status from articles where automation_key=$1 or tags @> $2::jsonb limit 1",[article.automationKey,JSON.stringify(["feature-key:"+article.automationKey])]);
if(existing.length){
 if(existing[0].title!==article.title||existing[0].status!=="published")throw new Error("An existing feature needs editorial review; not overwritten");
 console.log("FEATURE_PUBLISHED "+JSON.stringify({duplicate:true,...existing[0],url:"https://bluejournal.co.kr/news/"+existing[0].id}));process.exit(0);
}
const {R2_ACCOUNT_ID,R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,R2_BUCKET}=process.env;
const publicBase=(process.env.R2_PUBLIC_BASE||process.env.NEXT_PUBLIC_MEDIA_BASE||"").replace(/\/$/,"");
if(!R2_ACCOUNT_ID||!R2_ACCESS_KEY_ID||!R2_SECRET_ACCESS_KEY||!R2_BUCKET||new URL(publicBase).origin!=="https://media.bluejournal.co.kr")throw new Error("Media configuration unavailable");
const photoHash=createHash("sha256").update(photo).digest("hex").slice(0,12);
const key="data/features/2026/11/rail-feature-20261114-"+photoHash+".webp";
const imageUrl=publicBase+"/"+key;
const s3=new S3Client({region:"auto",endpoint:"https://"+R2_ACCOUNT_ID+".r2.cloudflarestorage.com",credentials:{accessKeyId:R2_ACCESS_KEY_ID,secretAccessKey:R2_SECRET_ACCESS_KEY}});
await s3.send(new PutObjectCommand({Bucket:R2_BUCKET,Key:key,Body:photo,ContentType:"image/webp",CacheControl:"public,max-age=31536000,immutable"}));
const check=await fetch(imageUrl,{signal:AbortSignal.timeout(20000)});
if(!check.ok||!check.headers.get("content-type")?.startsWith("image/")||(await check.arrayBuffer()).byteLength!==photo.length)throw new Error("Public image verification failed");
const link=id=>'<a href="'+escape(article.sources[id-1].url)+'" target="_blank" rel="noopener noreferrer">['+id+']</a>';
const html=[
 "<p>"+escape(article.lead)+"</p>",
 '<figure><img src="'+escape(imageUrl)+'" alt="제5차 국가철도망 구축계획 국민 의견수렴 행사 단체사진"><figcaption>'+escape(article.photo.caption)+'</figcaption></figure>',
 ...article.sections.flatMap(section=>["<h2>"+escape(section.heading)+"</h2>",...section.paragraphs.map(p=>"<p>"+escape(p)+"</p>"),'<p>관련 공식자료: '+section.sources.map(link).join(" ")+"</p>"]),
 "<hr><h2>확인한 공식자료</h2><ol>",
 ...article.sources.map(s=>'<li><a href="'+escape(s.url)+'" target="_blank" rel="noopener noreferrer">'+escape(s.title)+"</a> ("+escape(s.date)+")</li>"),
 "</ol><p>자료 확인 기준: 2026년 11월 14일. 이 기사는 공개된 공식자료를 대조해 작성한 분석 기사이며, 별도 현장취재나 관계자 인터뷰를 진행한 기사는 아닙니다. 정책 제안과 전망은 확인된 사실과 구분했습니다. 작성에 AI를 활용했습니다.</p>"
].join("\n");
const inserted=await sql.query(
 "insert into articles (board,title,subtitle,reporter_name,section,region,display_slot,thumbnail_url,body_html,body_text,source,source_url,automation_key,tags,status,published_at,meta_description,og_image) values ('news',$1,$2,$3,'특집','경기','헤드라인',$4,$5,$6,'경기도·국토교통부·인천시·김포시 공식자료',$7,$8,$9::jsonb,'published',now(),$2,$4) on conflict (automation_key) do nothing returning id,published_at",
 [article.title,article.subtitle,article.reporterName,imageUrl,html,text,article.sources[0].url,article.automationKey,JSON.stringify(article.tags)]);
if(!inserted.length){
 const [row]=await sql.query("select id,title,status from articles where automation_key=$1",[article.automationKey]);
 if(!row||row.title!==article.title||row.status!=="published")throw new Error("Concurrent publication requires review");
 console.log("FEATURE_PUBLISHED "+JSON.stringify({duplicate:true,...row,url:"https://bluejournal.co.kr/news/"+row.id}));process.exit(0);
}
const articleId=inserted[0].id;
await sql.query("insert into site_config(config_key,config_value) values ($1,$2) on conflict(config_key) do update set config_value=excluded.config_value,updated_at=now()",["editorial:"+article.automationKey,JSON.stringify({article,contentHash,articleId,stage:"manual-published"})]);
await sql.query("update weekly_feature_runs set state='published',article_id=$1,selected_topic=$2,rsi_decision='MANUAL_REVIEW',attempt_label='manual',error_text=null,evidence_urls=$3::jsonb,completed_at=now(),updated_at=now() where run_key=$4",[articleId,article.title,JSON.stringify(article.sources.map(s=>s.url)),article.automationKey]);
console.log("FEATURE_PUBLISHED "+JSON.stringify({articleId,url:"https://bluejournal.co.kr/news/"+articleId,title:article.title,publishedAt:inserted[0].published_at,imageUrl,contentHash}));
