import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
test('static artifacts contain no server configuration, secret, source or private reports',async()=>{
  const secret='build-test-token-never-deploy-'+'x'.repeat(32);
  execFileSync(process.execPath,['scripts/build.mjs'],{env:{...process.env,CRON_SECRET:secret}});
  const files=await readdir('dist');assert.deepEqual(files,['index.html']);
  assert.ok(!(await readFile('dist/index.html','utf8')).includes(secret));
  const config=JSON.parse(await readFile('edgeone.json','utf8'));assert.equal(config.schedules.length,8);assert.ok(config.schedules.every(s=>s.timezone==='Asia/Shanghai'));
  assert.equal(execFileSync('git',['check-ignore','edgeone.json']).toString().trim(),'edgeone.json');
});
