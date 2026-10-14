import {createHash, timingSafeEqual} from 'node:crypto';
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const beijingDate = date => new Date(new Date(date).getTime()+8*3600000).toISOString().slice(0,10);
export const isWeekday = date => { const d = new Date(`${beijingDate(date)}T12:00:00+08:00`).getUTCDay(); return d !== 0 && d !== 6; };
export const sinceDays = (now, days) => new Date(new Date(now).getTime()-days*86400000).toISOString();
export function canonicalUrl(value) {
  const u = new URL(value); if (u.protocol !== 'https:') throw new Error('https_required');
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|from$|source$|spm$)/i.test(key)) u.searchParams.delete(key);
  u.hash=''; return u.href;
}
export function authorized(provided, expected) {
  if (!expected || expected.length < 32 || typeof provided !== 'string') return false;
  const a=Buffer.from(provided), b=Buffer.from(expected); return a.length === b.length && timingSafeEqual(a,b);
}
export class DeliveryError extends Error {
  constructor(code, definite=false) {super(code); this.definite=definite;}
}
// A crash/timeout after sending is ambiguous. Only explicit rejection can be retried.
export async function deliverOnce(store, key, content, send) {
  const prior=await store.get(key); const contentHash=hash(content);
  if (prior && ['sent','sending','unknown'].includes(prior.status)) return prior;
  if (prior?.contentHash && prior.contentHash !== contentHash) throw new Error('delivery_content_changed');
  const attempt={status:'sending',contentHash,attempts:(prior?.attempts||0)+1,startedAt:new Date().toISOString()};
  await store.set(key,attempt);
  try {
    const receipt=await send(content);
    const record={...attempt,status:'sent',receipt,confirmedAt:new Date().toISOString()};
    await store.set(key,record); return record;
  } catch(error) {
    const record={...attempt,status:error.definite?'failed':'unknown',code:error.message};
    await store.set(key,record); return record;
  }
}
export function uniqueEvents(items) {
  const events=new Map();
  for (const item of items) {
    // Only merge verified shared event identifiers. Similar titles alone are not evidence.
    const key=item.eventKey || canonicalUrl(item.url);
    const old=events.get(key);
    if (!old) events.set(key,{...item,sources:[{url:item.url,sourceId:item.sourceId}]});
    else {
      if (!old.sources.some(s=>s.url===item.url)) old.sources.push({url:item.url,sourceId:item.sourceId});
      for (const fact of item.facts||[]) if (!old.facts.some(f=>f.text===fact.text)) old.facts.push(fact);
    }
  }
  return [...events.values()];
}
export const publicItem = item => Object.fromEntries(['sourceId','entity','group','channel','url','title','publishedAt','eventDate','deadline','firstSeenAt','disclosure','facts','sources','classification'].map(k=>[k,item[k]??null]));
