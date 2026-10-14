import {mkdir,writeFile,rm} from 'node:fs/promises';
const phases=['collect','report','publish','send','check'];
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await writeFile('dist/index.html','<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>WorkBuddy Monitor</title><p>WorkBuddy 监测服务。日报通过指定内部渠道发送。</p></html>');
const schedules=[];const secret=process.env.CRON_SECRET;
if(secret&&secret.length>=32){
  for(let shard=0;shard<4;shard++)schedules.push({name:`collect-${shard}`,cron:`${shard} 7 * * *`,path:'/api/collect',method:'POST',payload:{secret,shard},timezone:'Asia/Shanghai'});
  for(const [phase,cron] of [['report','40 7 * * 1-5'],['publish','10 8 * * 1-5'],['send','30 8 * * 1-5'],['check','40 8 * * 1-5']])schedules.push({name:phase,cron,path:`/api/${phase}`,method:'POST',payload:{secret},timezone:'Asia/Shanghai'});
}
const config={cloudFunctions:{maxDuration:120,regions:{overseas:['ap-singapore']}},schedules};
// Git builds read the root configuration after build. The generated file must stay untracked.
await writeFile('edgeone.json',JSON.stringify({...config,buildCommand:'npm run build',outputDirectory:'dist'},null,2),{mode:0o600});
console.log(JSON.stringify({built:phases,schedules:schedules.length,sendEnabled:process.env.SEND_ENABLED==='true'}));
