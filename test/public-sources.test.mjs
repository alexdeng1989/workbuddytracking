import test from 'node:test';
import assert from 'node:assert/strict';
import {campusRules,parseWechatIndex} from '../src/public-sources.mjs';
import {collectSource,parsePage} from '../src/collect.mjs';
import {runJob} from '../src/jobs.mjs';
import {enrich} from '../src/report.mjs';
const memory=()=>{const data=new Map();return {get:async k=>data.get(k)??null,set:async(k,v)=>data.set(k,structuredClone(v))};};
test('campus extraction ignores inactive ended state and rejects missing rules',()=>{
  const sections=['一、活动时间','二、活动对象','三、参与方式','四、活动奖励','五、领取限制'].map(title=>`{title:${JSON.stringify(title)},items:["活动规则内容"]}`).join(',');
  const script=`const p=["活动时间：2026.08.24 — 2026.10.31","领取1000积分"],f=[${sections}],g={documentTitle:"活动已结束"};`;
  assert.match(campusRules(script),/1000积分/);assert.doesNotMatch(campusRules(script),/活动已结束/);
  assert.throws(()=>campusRules('const title="活动时间"'),/campus_rules_changed/);
});
test('index keeps exact author and recent dates as unverified leads only',()=>{
  const row=(name,date)=>`<li><h3><a href="/link?url=x">WorkBuddy培训</a></h3><p class="txt-info">公开课</p><div class="s-p"><span class="all-time-y2">${name}</span><span class="s2"><script>timeConvert('${Date.parse(date)/1000}')</script></span></div></li>`;
  const raw=`<ul class="news-list">${row('零一数科','2026-10-14')}${row('其他作者','2026-10-14')}${row('零一数科','2025-10-14')}</ul>`;
  const leads=parseWechatIndex(raw,'https://weixin.sogou.com/weixin','零一数科','2026-09-15');assert.equal(leads.length,1);assert.equal(leads[0].identityVerified,false);assert.equal(leads[0].evidenceLevel,'search_snippet');
  assert.throws(()=>parseWechatIndex('<title>验证码</title>','https://weixin.sogou.com','零一数科','2026-09-15'),/unavailable/);
});
test('index-only check cannot turn snippets into report candidates or complete coverage',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response('<ul class="news-list"></ul>');
  try{const state=await collectSource({id:'wechat',channel:'wechat',accountName:'零一数科'},{store:memory(),now:'2026-10-15T00:00:00Z'});assert.equal(state.status,'partial');assert.deepEqual(state.candidates,[]);assert.match(state.note,/不代表账号完整覆盖/);}finally{globalThis.fetch=original;}
});
test('news list dates keep old linked articles out of the baseline',async()=>{
  const raw='<main><a href="/news/old"><small>企业动态 · 2025.05.22</small><h3>WorkBuddy 培训</h3></a><p>'+('企业业务介绍。'.repeat(30))+'</p></main>';
  assert.equal(parsePage(raw,'https://example.com/news',{index:true}).linkDates['https://example.com/news/old'],'2025-05-21T16:00:00.000Z');
  const original=globalThis.fetch;globalThis.fetch=async url=>new Response(url.endsWith('/old')?'<main>WorkBuddy培训，活动报名服务。'.repeat(10)+'</main>':raw);
  try{const state=await collectSource({id:'news',channel:'website',url:'https://example.com/news',index:true},{store:memory(),now:'2026-10-15T00:00:00Z'});assert.deepEqual(state.candidates,[]);}finally{globalThis.fetch=original;}
});
test('activity start and end are extracted without inventing a publication date',async()=>{
  const item=await enrich({title:'WorkBuddy 活动',group:'official',evidenceText:'活动时间：2026.08.24 00:00 — 2026.10.31 23:59，第一批限量 200 万份。'},{});
  assert.equal(item.eventDate,'2026-08-24');assert.equal(item.eventEndDate,'2026-10-31');assert.equal(item.publishedAt,undefined);
});
test('preview progresses independently of group delivery and keeps weekend discoveries',async()=>{
  const store=memory(),privateStore=memory(),env={SEND_ENABLED:'false'};
  const item={id:'first',sourceId:'official-campus',group:'official',entity:'WorkBuddy',url:'https://example.com/first',title:'WorkBuddy 活动',firstSeenAt:'2026-10-09T00:00:00Z',evidenceText:'WorkBuddy 活动报名可领取积分权益，适用规则以页面为准。'};
  await store.set('sources/official-campus',{status:'changed',candidates:[item]});
  const friday=await runJob('report',{store,privateStore,env,now:'2026-10-09T01:00:00Z'});assert.equal(friday.items.length,1);
  const weekend={...item,id:'weekend',url:'https://example.com/weekend',firstSeenAt:'2026-10-10T01:00:00Z'};
  await store.set('sources/official-campus',{status:'changed',candidates:[item,weekend]});
  const monday=await runJob('report',{store,privateStore,env,now:'2026-10-12T01:00:00Z'});assert.equal(monday.items.length,1);assert.equal(monday.items[0].url,weekend.url);assert.equal(monday.cutoff,friday.through);assert.equal(await store.get('reported-candidates'),null);
  const preview=await runJob('preview',{store,privateStore,env,now:'2026-10-17T01:00:00Z'});assert.equal(preview.date,'2026-10-12');assert.doesNotMatch(JSON.stringify(preview),/recommendations|锐鲨现有/);
  const refreshed=await runJob('report',{store,privateStore,env,now:'2026-10-12T02:00:00Z',refresh:true});assert.equal(refreshed.items.length,1);assert.ok(await store.get(`reports/2026-10-12/versions/${monday.version}`));
  await store.set(`documents/2026-10-12/${refreshed.version}`,{status:'creating'});
  await assert.rejects(runJob('report',{store,privateStore,env,now:'2026-10-12T03:00:00Z',refresh:true}),/already_published/);
  await assert.rejects(runJob('report',{store,privateStore,env:{SEND_ENABLED:'true'},now:'2026-10-13T01:00:00Z',refresh:true}),/preview_mode/);
});
