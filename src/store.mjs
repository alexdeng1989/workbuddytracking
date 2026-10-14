import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
export function localStore(root) {
  const path=key=> { if (!/^[\w/.-]+$/.test(key)||key.includes('..')) throw Error('invalid_key'); return resolve(root,key+'.json'); };
  return {
    async get(key) {try{return JSON.parse(await readFile(path(key),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
    async set(key,value) {const p=path(key);await mkdir(dirname(p),{recursive:true});const temp=p+'.'+randomUUID();await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,p);}
  };
}
export async function blobStore(name) {
  const {getStore}=await import('@edgeone/pages-blob');
  const store=getStore({name,consistency:'strong'});
  return {get: key=>store.get(key,{type:'json',consistency:'strong'}),set:(key,value)=>store.setJSON(key,value)};
}
