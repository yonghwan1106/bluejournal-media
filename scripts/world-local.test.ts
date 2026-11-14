import test from "node:test";
import assert from "node:assert/strict";
import {officialWorldUrl,worldSchedule,worldDraftErrors,worldBodyHtml,type WorldDraft,type WorldSource} from "../src/lib/world-local-core";
import {validateTopicEvidence,validateTopicForEvidence,type WeeklyFeatureEvidence} from "../src/lib/weekly-gyeonggi-feature-core";
test("KST Wednesday publication and ISO week boundary",()=>{
  const s=worldSchedule(new Date("2026-11-17T22:00:00Z"));
  assert.equal(s.runKey,"global-local-governance:2026-11-16");
  assert.equal(s.publishAt.toISOString(),"2026-11-18T00:00:00.000Z");
  assert.equal(worldSchedule(new Date("2026-11-15T14:59:59Z")).weekStart,"2026-11-09");
  assert.equal(worldSchedule(new Date("2026-11-15T15:00:00Z")).weekStart,"2026-11-16");
});
test("official domains reject credentials, ports and spoofed suffixes",()=>{
  for(const url of ["http://www.hel.fi/x","https://hel.fi.evil.test/","https://127.0.0.1/",
    "https://user@hel.fi/","https://hel.fi:444/","https://evil-hel.fi/"])assert.throws(()=>officialWorldUrl(url));
  assert.equal(officialWorldUrl("https://www.hel.fi/en?utm_source=x#nav").href,"https://www.hel.fi/en");
});
const sources:WorldSource[]=[{id:"S1",url:"https://hel.fi/a",title:"공식자료 A",text:"근거",fetchedAt:"2026-11-14"},
 {id:"S2",url:"https://hel.fi/b",title:"공식자료 B",text:"근거",fetchedAt:"2026-11-14"}];
const draft:WorldDraft={title:"헬싱키는 어떻게 주민의 선택을 반영하는가",subtitle:"제도의 구조",lead:"본문".repeat(300),
 city:"헬싱키",mechanism:"주민참여",sections:[0,1,2,3].map(i=>({heading:"분석",paragraphs:["내용".repeat(150)],sourceIds:[i%2?"S1":"S2"]})),
 conclusion:"확인 과제",tags:[]};
test("invalid or insufficient citations fail closed",()=>{
 assert.deepEqual(worldDraftErrors(draft,sources),[]);
 assert.ok(worldDraftErrors({...draft,sections:draft.sections.map(s=>({...s,sourceIds:["fake"]}))},sources).length);
 assert.ok(worldDraftErrors(draft,[sources[0],{...sources[1],url:sources[0].url}]).length);
});
test("article renderer escapes source and generated markup",()=>{
 const html=worldBodyHtml({...draft,lead:"<script>alert(1)</script>"},sources,new Date("2026-11-14Z"));
 assert.ok(!html.includes("<script>"));assert.ok(html.includes("&lt;script&gt;"));
 assert.throws(()=>worldBodyHtml({...draft,sections:[{heading:"x",paragraphs:["y"],sourceIds:["missing"]}]},sources,new Date()));
});
const evidence:WeeklyFeatureEvidence[]=[0,1,2].map(i=>({id:"e"+i,url:"https://gnews.gg.go.kr/"+i,
 title:["동백 철도 사업의 검토 진행","노선 심사 결과 발표","시민설명회 자료"][i],
 date:"2026-11-10",sourceName:"공식기관",summary:"",bodyText:"이 자료는 동백 철도 사업을 직접 다루며 아직 검토 중인 사업이다."}));
test("different headlines can proceed to independent original-text verification",()=>{
 assert.deepEqual(validateTopicForEvidence({headline:"동백 철도 사업의 다음 단계는",angle:"공식자료로 사업의 실제 추진 단계를 살펴본다.",rationale:"근거 대조",sourceIds:["e0","e1"],archiveTerms:["동백","철도"]},evidence),[]);
 const proof={sameIssue:true,reason:"원문 확인",sources:evidence.map(e=>({id:e.id,quote:"동백 철도 사업을 직접 다루며 아직 검토 중인 사업이다."}))};
 assert.deepEqual(validateTopicEvidence(proof,evidence),[]);
 assert.ok(validateTopicEvidence({...proof,sameIssue:false},evidence).length);
 assert.ok(validateTopicEvidence({...proof,sources:proof.sources.map(e=>({...e,quote:"원문에 존재하지 않는 허위 문장이다."}))},evidence).length);
 assert.ok(validateTopicEvidence(proof,[evidence[0],{...evidence[1],url:evidence[0].url},evidence[2]]).length);
});
