import {sources} from './sources.mjs';
import {collectSource} from './collect.mjs';
import {beijingDate,isWeekday,sinceDays,deliverOnce,authorized} from './core.mjs';
import {compileReport,enrich,privateAdvice} from './report.mjs';
import {TencentDocs,sendEmail,sendWecom} from './publish.mjs';
import {blobStore} from './store.mjs';
export function doctor(env) {
  const groups={scheduler:['CRON_SECRET'],documents:['TENCENT_CLIENT_ID','TENCENT_CLIENT_SECRET','TENCENT_OPEN_ID','TENCENT_REFRESH_TOKEN','TENCENT_READER_IDS'],group:['WECOM_WEBHOOK'],email:env.EMAIL_TRANSPORT==='graph'?['PRIVATE_EMAIL_TO','MICROSOFT_CLIENT_ID','MICROSOFT_REFRESH_TOKEN']:['PRIVATE_EMAIL_TO','SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM'],video:['VIDEO_FEED_URL','VIDEO_FEED_TOKEN'],search:['TAVILY_API_KEY']};
  return {sendEnabled:env.SEND_ENABLED==='true',paidServicesEnabled:env.PAID_SERVICES_ENABLED==='true',missing:Object.fromEntries(Object.entries(groups).map(([k,fields])=>[k,fields.filter(f=>!env[f])])),unverifiedVideoAccounts:sources.filter(s=>s.channel==='video'&&!s.accountId).map(s=>s.id)};
}
export async function runJob(phase,{store,privateStore,env,now=new Date().toISOString(),shard=null}) {
  const date=beijingDate(now);
  if(phase==='status')return {date,configuration:doctor(env),coverage:await Promise.all(sources.map(async s=>{const state=await store.get(`sources/${s.id}`);return {id:s.id,status:state?.status||'not_checked',checkedAt:state?.checkedAt,lastSuccessAt:state?.lastSuccessAt,candidates:state?.candidates?.length||0,code:state?.code};})),lastGroupReport:await store.get('last-group-report')};
  if(phase!=='collect'&&!isWeekday(now))return {skipped:'weekend'};
  if(phase==='collect'){
    const selected=shard===null?sources:sources.filter((s,i)=>i%4===shard);
    return Promise.all(selected.map(s=>collectSource(s,{store,env,now})));
  }
  const reportKey=`reports/${date}`;
  if(phase==='report'){
    const existing=await store.get(reportKey);if(existing)return existing;
    const prior=await store.get('last-group-report');
    const cutoff=prior?.through||sinceDays(now,30);
    let states=await Promise.all(sources.map(async s=>({source:s,state:await store.get(`sources/${s.id}`)})));
    // Retrying independent failures cannot prevent other sources from being reported.
    await Promise.all(states.filter(x=>['failed','unavailable'].includes(x.state?.status)).slice(0,3).map(x=>collectSource(x.source,{store,env,now})));
    states=await Promise.all(sources.map(async s=>({source:s,state:await store.get(`sources/${s.id}`)})));
    const coverage=states.map(({source:s,state:x})=>({sourceId:s.id,entity:s.entity,channel:s.channel,status:x?.status||'unconfigured',checkedAt:x?.checkedAt,note:x?.note||s.note,code:x?.code}));
    const delivered=new Set((await store.get('reported-candidates'))||[]);
    const candidates=states.flatMap(x=>x.state?.candidates||[]).filter(c=>!delivered.has(c.id));
    const items=[],processedIds=[];
    // Bounded work per 120-second cloud invocation. Raw candidates remain in state.
    for(let offset=0;offset<Math.min(candidates.length,16);offset+=4){
      const batch=await Promise.allSettled(candidates.slice(offset,offset+4).map(async c=>{
        const cached=await store.get(`enriched/${c.id}`);if(cached){processedIds.push(c.id);return cached;}
        const result=await enrich(c,env);if(result)await store.set(`enriched/${c.id}`,result);processedIds.push(c.id);return result;
      }));
      for(const result of batch)if(result.status==='fulfilled'&&result.value)items.push(result.value);
    }
    if(candidates.length>16)coverage.push({sourceId:'enrichment',entity:'事实整理',channel:'processing',status:'partial',checkedAt:now,note:`本批 ${candidates.length} 条候选，仅整理前16条，余下候选尚未发布`});
    const oldCalendar=await Promise.all(states.flatMap(x=>x.state?.candidates||[]).filter(c=>delivered.has(c.id)).map(c=>store.get(`enriched/${c.id}`)));
    const report=compileReport({date,now,cutoff,items,coverage,calendarItems:[...items,...oldCalendar.filter(Boolean)]});
    report.candidateIds=processedIds;
    await privateStore.set(reportKey,privateAdvice(report));await store.set(reportKey,report);return report;
  }
  const report=await store.get(reportKey);if(!report)throw Error('report_missing');
  if(phase==='publish')return new TencentDocs(env,store).publish(report);
  if(phase==='send'||phase==='check'){
    if(env.SEND_ENABLED!=='true')return {skipped:'send_disabled'};
    const doc=await store.get(`documents/${date}/${report.version}`);const result={};
    const groupKey=`deliveries/${date}/wecom/${report.version}`;
    if(doc?.status==='verified'){
      const prior=await store.get(groupKey);
      if(phase==='send'||prior?.status==='failed')result.wecom=await deliverOnce(store,groupKey,report.brief.replace('{{DOCUMENT_URL}}',doc.url),content=>sendWecom(content,env));
      else result.wecom=prior||{status:'not_attempted'};
      if(result.wecom?.status==='sent'){
        await store.set('last-group-report',{date,through:report.through,version:report.version});
        await store.set('reported-candidates',[...new Set([...(await store.get('reported-candidates')||[]),...report.candidateIds])].slice(-10000));
      }
    }else result.wecom={status:'blocked',code:'verified_document_required'};
    const advice=await privateStore.get(reportKey);const emailKey=`deliveries/${date}/email/${report.version}`;const prior=await privateStore.get(emailKey);
    if(advice&&(phase==='send'||prior?.status==='failed'))result.email=await deliverOnce(privateStore,emailKey,advice,message=>sendEmail(message,env,privateStore));
    else result.email=prior||{status:'not_attempted'};
    await store.set(`runs/${date}/${phase}`,{at:now,wecom:result.wecom?.status,email:result.email?.status});return result;
  }
  throw Error('unknown_phase');
}
export function handler(phase) {
  return async ({request,env:runtimeEnv={}})=>{
    const env={...process.env,...runtimeEnv};
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    let body;try{body=await request.json();}catch{return new Response('Invalid request',{status:400});}
    if(!authorized(body.secret||request.headers.get('authorization')?.replace(/^Bearer /,''),env.CRON_SECRET))return new Response('Unauthorized',{status:401});
    if(body.shard!==undefined&&(!Number.isInteger(body.shard)||body.shard<0||body.shard>3))return new Response('Invalid shard',{status:400});
    const store=await blobStore('workbuddy-state'),privateStore=await blobStore('workbuddy-private');
    try {
      const result=await runJob(phase,{store,privateStore,env,shard:body.shard??null});
      // Never return source evidence, access tokens, private advice, or report bodies.
      return Response.json({ok:true,phase,skipped:result?.skipped||null,...(phase==='status'?{status:result}:{}),...(phase==='collect'?{checks:result.map(x=>({sourceId:x.sourceId,status:x.status,code:x.code}))}:{})});
    }catch(error){await store.set(`errors/${beijingDate(new Date())}/${phase}`,{at:new Date().toISOString(),code:error.message});return Response.json({ok:false,phase,code:'job_failed'},{status:500});}
  };
}
