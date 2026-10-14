import {mkdir,writeFile} from 'node:fs/promises';
import {localStore} from '../src/store.mjs';
import {runJob,doctor} from '../src/jobs.mjs';
try{process.loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
const phase=process.argv[2];
const store=localStore('.local/shared'),privateStore=localStore('.local/private');
if(phase==='doctor')console.log(JSON.stringify(doctor(process.env),null,2));
else {
  if(!['collect','report'].includes(phase))throw Error('Local CLI permits collect/report only. Sending uses authenticated cloud jobs.');
  const result=await runJob(phase,{store,privateStore,env:process.env});
  if(phase==='report'&&!result.skipped){
    await mkdir('deliverables',{recursive:true});await mkdir('deliverables/private',{recursive:true});
    await writeFile('deliverables/detail-sample.txt',result.detail);await writeFile('deliverables/group-sample.txt',result.brief);
    const advice=await privateStore.get(`reports/${result.date}`);await writeFile('deliverables/private/advice-sample.txt',advice.text,{mode:0o600});
    const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    await writeFile('deliverables/report-preview.html',`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WorkBuddy 日报样稿</title><style>body{max-width:860px;margin:48px auto;padding:0 24px;font:16px/1.85 system-ui;color:#203040;background:#f8fafc}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:white;padding:32px;border:1px solid #dde3eb;border-radius:12px}h1{font-size:26px}small{color:#697586}</style><h1>WorkBuddy 日报样稿</h1><small>基线采集预览 · 尚未发送 · 不代表今日新发布</small><pre>${esc(result.detail)}</pre></html>`);
    console.log(JSON.stringify({date:result.date,items:result.items.length,coverage:result.coverage.map(x=>({source:x.sourceId,status:x.status})),version:result.version},null,2));
  }else console.log(JSON.stringify(Array.isArray(result)?result.map(x=>({source:x.sourceId,status:x.status,code:x.code,candidates:x.candidates?.length||0})):result,null,2));
}
