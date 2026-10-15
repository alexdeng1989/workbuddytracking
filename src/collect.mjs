import * as cheerio from 'cheerio';
import {hash,canonicalUrl,sinceDays} from './core.mjs';
import {readCampus,parseWechatIndex} from './public-sources.mjs';
const relevant=/work\s*buddy|企业版|积分|权益|优惠|报名|直播|培训|招募|渠道|AI\s*(运营|培训|落地|获客)|FDE|Skill/i;
export async function getText(url, options={}) {
  const response=await fetch(url,{...options,headers:{'User-Agent':'Mozilla/5.0 (compatible; WorkBuddyMonitor/0.1)',...options.headers},signal:AbortSignal.timeout(12000),redirect:options.method?'error':'follow'});
  if (!response.ok) throw Error(`http_${response.status}`);
  const raw=await response.text(); if (Buffer.byteLength(raw)>4*1024*1024) throw Error('source_too_large');
  return raw;
}
export function parsePage(raw,url,{index=false}={}) {
  const $=cheerio.load(raw); const title=$('title').first().text().trim();
  const publishedAt=$('meta[property="article:published_time"],meta[name="publishdate"],meta[name="pubdate"]').first().attr('content')||$('time[datetime]').first().attr('datetime')||null;
  $('script,style,noscript,svg,nav,footer,header,[role="navigation"]').remove();
  const root=$('.vp-doc').first().length?$('.vp-doc').first():$('main,article').first(); const node=root.length&&root.text().trim().length>=100?root:$('body');
  node.find('th,td').append(' | ');node.find('tr').append('\n');
  node.find('br,p,div,li,h1,h2,h3,h4,section').append('\n');
  const text=node.text().split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
  const material=[...new Set(text.split('\n').filter(line=>relevant.test(line)))].join('\n');
  const links=[],linkDates={};
  $('a[href]').each((_,el)=>{try {const href=canonicalUrl(new URL($(el).attr('href'),url).href),label=$(el).text().trim();if(new URL(href).hostname===new URL(url).hostname&&(relevant.test(label)||(index&&href.startsWith(url+'/')))&&!links.includes(href)){links.push(href);const d=label.match(/(?<!\d)(20\d{2})[.-](\d{2})[.-](\d{2})(?!\d)/);if(d){const value=`${d[1]}-${d[2]}-${d[3]}T00:00:00+08:00`;if(!Number.isNaN(Date.parse(value)))linkDates[href]=new Date(value).toISOString();}}}catch{}});
  const update=text.match(/最近更新时间[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  return {title,text,material,publishedAt:publishedAt && !Number.isNaN(Date.parse(publishedAt))?new Date(publishedAt).toISOString():null,updatedAt:update?new Date(`${update[1]}T${update[2]}+08:00`).toISOString():null,links:links.slice(0,8),linkDates};
}
async function website(source,previous,now,store) {
  const raw=await getText(source.url); const page=source.adapter==='campus'?await readCampus(raw,source.url,getText):parsePage(raw,source.url,source);
  if (page.text.length<100 || /验证码|访问过于频繁|captcha|Access Denied/i.test(page.title)) throw Error('content_unavailable');
  const pages=[{url:source.url,raw,...page}]; const failures=[];
  const cutoff=previous?.lastSuccessAt?sinceDays(previous.lastSuccessAt,7):sinceDays(now,30);
  const results=await Promise.allSettled(page.links.filter(url=>url!==source.url).map(async url=>{const html=await getText(url),child=parsePage(html,url);return {url,...child,publishedAt:child.publishedAt||page.linkDates[url]||null,raw:html};}));
  for(const r of results) if(r.status==='fulfilled')pages.push(r.value);else failures.push(r.reason.message);
  const seen={...(previous?.seen||{})}; const candidates=[...(previous?.candidates||[])]; let changed=0;
  for(const p of pages) {
    const isOld=p.publishedAt && p.publishedAt<cutoff;
    if(isOld||(source.index&&p.url===source.url))for(let i=candidates.length-1;i>=0;i--)if(candidates[i].url===p.url)candidates.splice(i,1);
    const fingerprint=hash(p.material); if(!p.material || seen[p.url]===fingerprint)continue;
    const firstSeenAt=now; const evidenceId=hash(p.url+fingerprint);
    await store.set(`evidence/${source.id}/${evidenceId}`,{url:p.url,fetchedAt:now,raw:p.raw,text:p.text,fingerprint});
    if(!isOld&&!(source.index&&p.url===source.url)){
      for(let index=candidates.length-1;index>=0;index--)if(candidates[index].url===p.url)candidates.splice(index,1);
      candidates.push({id:evidenceId,sourceId:source.id,entity:source.entity,group:source.group,channel:source.channel,url:p.url,title:p.title,publishedAt:p.publishedAt,updatedAt:p.updatedAt,firstSeenAt,evidenceText:p.text.slice(0,18000),fingerprint,classification:previous?.seen?.[p.url]?'page_change':'baseline_discovery'});
    }
    seen[p.url]=fingerprint; changed++;
  }
  return {status:failures.length?'partial':changed?'changed':'no_new',lastSuccessAt:now,seen,candidates:candidates.filter(c=>c.firstSeenAt>=sinceDays(now,40)),failures};
}
async function wechat(source,previous,now,store) {
  if(!source.accountName)return {status:'unconfigured',note:source.note};
  const url=new URL('https://weixin.sogou.com/weixin');url.searchParams.set('type','2');url.searchParams.set('query',source.accountName);
  const raw=await getText(url.href),leads=parseWechatIndex(raw,url.href,source.accountName,sinceDays(now,30));
  await store.set(`evidence/${source.id}/${hash(raw)}`,{url:url.href,fetchedAt:now,raw});
  return {status:'partial',lastSuccessAt:now,leads,candidates:previous?.candidates||[],note:`公开搜索索引已检查；近30天同名作者线索 ${leads.length} 条。名称匹配不证明账号身份，尚未核验全文，不代表账号完整覆盖或没有更新。`};
}
async function video(source,previous,now,env) {
  if(!env.VIDEO_FEED_URL||!source.accountId)return {status:'unconfigured',note:source.note||'数据接口或平台账号 ID 未接通'};
  if(env.PAID_SERVICES_ENABLED!=='true')return {status:'unconfigured',note:'付费接口尚未启用'};
  const url=new URL(env.VIDEO_FEED_URL);url.searchParams.set('account_id',source.accountId);url.searchParams.set('since',sinceDays(previous?.lastSuccessAt||now,previous?.lastSuccessAt?7:30));
  const data=JSON.parse(await getText(url.href,{headers:{Authorization:`Bearer ${env.VIDEO_FEED_TOKEN}`}}));
  if(data.accountId!==source.accountId || !data.checkedAt || !Array.isArray(data.items) || data.complete!==true)throw Error('video_coverage_unverified');
  const candidates=[...(previous?.candidates||[])];const known=new Set(candidates.map(x=>x.id));
  for(const item of data.items) {
    if(!item.url||!item.title||!item.publishedAt||!item.visibleText)throw Error('video_evidence_missing');
    const id=hash(item.url+item.visibleText);if(known.has(id))continue;
    candidates.push({id,sourceId:source.id,entity:source.entity,group:source.group,channel:'video',url:canonicalUrl(item.url),title:item.title,publishedAt:item.publishedAt,firstSeenAt:now,evidenceText:item.visibleText,classification:'video',evidenceLevel:item.transcript?'transcript':'visible_text',timecodes:item.timecodes||[]});
  }
  return {status:candidates.length>(previous?.candidates?.length||0)?'changed':'no_new',lastSuccessAt:now,providerCheckedAt:data.checkedAt,candidates};
}
async function search(previous,now,env) {
  if(!env.TAVILY_API_KEY||env.PAID_SERVICES_ENABLED!=='true')return {status:'unconfigured',note:'全国搜索接口未启用'};
  const data=JSON.parse(await getText('https://api.tavily.com/search',{method:'POST',headers:{Authorization:`Bearer ${env.TAVILY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query:'WorkBuddy 企业版 培训 活动 服务商 景栗 零一数科',search_depth:'basic',max_results:10,start_date:sinceDays(now,30).slice(0,10),include_usage:true})}));
  if(!Array.isArray(data.results))throw Error('search_invalid_response');
  // Discovery snippets are leads, never treated as verified articles or official notices.
  return {status:'ok',lastSuccessAt:now,leads:data.results.map(x=>({title:x.title,url:x.url,snippet:x.content})),usage:data.usage,candidates:previous?.candidates||[]};
}
export async function collectSource(source,{store,env={},now=new Date().toISOString()}) {
  const key=`sources/${source.id}`; const previous=await store.get(key);let result;
  try {
    if(source.channel==='website')result=await website(source,previous,now,store);
    else if(source.channel==='video')result=await video(source,previous,now,env);
    else if(source.channel==='search')result=await search(previous,now,env);
    else if(source.channel==='wechat')result=await wechat(source,previous,now,store);
    else result={status:'unconfigured',note:source.note};
  }catch(error){result={status:/http_40[134]|content_unavailable/.test(error.message)?'unavailable':'failed',code:error.message};}
  const state={...previous,code:null,note:null,failures:[],...result,sourceId:source.id,checkedAt:now};
  await store.set(key,state);await store.set(`checks/${now.slice(0,10)}/${source.id}`,{...state,candidates:undefined,seen:undefined});return state;
}
