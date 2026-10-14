import nodemailer from 'nodemailer';
import {DeliveryError,hash} from './core.mjs';
export async function sendWecom(content,env) {
  if(!env.WECOM_WEBHOOK)throw new DeliveryError('wecom_not_configured',true);
  const url=new URL(env.WECOM_WEBHOOK);
  if(url.origin!=='https://qyapi.weixin.qq.com'||url.pathname!=='/cgi-bin/webhook/send'||!url.searchParams.get('key'))throw new DeliveryError('invalid_wecom_webhook',true);
  if(Buffer.byteLength(content)>4096)throw new DeliveryError('wecom_content_too_long',true);
  let response;try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({msgtype:'markdown',markdown:{content}}),signal:AbortSignal.timeout(15000)});}catch{throw new DeliveryError('wecom_transport_unknown');}
  if(!response.ok)throw new DeliveryError(`wecom_http_${response.status}`,response.status>=400&&response.status<500);
  let data;try{data=await response.json();}catch{throw new DeliveryError('wecom_response_unknown');}
  if(data.errcode!==0)throw new DeliveryError(`wecom_rejected_${data.errcode}`,Number.isInteger(data.errcode));
  return {errcode:0};
}
export async function sendEmail(message,env,privateStore) {
  if(env.EMAIL_TRANSPORT==='graph')return sendGraphMail(message,env,privateStore);
  for(const k of ['SMTP_HOST','SMTP_USER','SMTP_PASSWORD','SMTP_FROM','PRIVATE_EMAIL_TO'])if(!env[k])throw new DeliveryError(`missing_${k}`,true);
  if(!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(env.PRIVATE_EMAIL_TO))throw new DeliveryError('invalid_private_recipient',true);
  const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||465),secure:env.SMTP_SECURE!=='false',auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000});
  try {
    const result=await transport.sendMail({from:env.SMTP_FROM,to:env.PRIVATE_EMAIL_TO,subject:message.subject,text:message.text,messageId:`<wb-${message.date}-${message.reportVersion}@${env.SMTP_FROM.split('@').at(-1).replace(/[> ]/g,'')}>`});
    if(!result.accepted.includes(env.PRIVATE_EMAIL_TO))throw new DeliveryError('smtp_recipient_rejected',true);
    return {messageId:result.messageId,accepted:result.accepted};
  }catch(e){if(e instanceof DeliveryError)throw e;throw new DeliveryError(e.code==='EAUTH'?'smtp_auth_rejected':'smtp_delivery_unknown',e.code==='EAUTH');}
  finally{transport.close();}
}
export async function sendGraphMail(message,env,store,fetcher=fetch){
  for(const key of ['MICROSOFT_CLIENT_ID','MICROSOFT_REFRESH_TOKEN','PRIVATE_EMAIL_TO'])if(!env[key])throw new DeliveryError(`missing_${key}`,true);
  let auth=await store.get('auth/microsoft');
  if(!auth||auth.expiresAt<Date.now()+120000){
    const form={client_id:env.MICROSOFT_CLIENT_ID,grant_type:'refresh_token',refresh_token:auth?.refreshToken||env.MICROSOFT_REFRESH_TOKEN,scope:'https://graph.microsoft.com/Mail.Send offline_access'};
    if(env.MICROSOFT_CLIENT_SECRET)form.client_secret=env.MICROSOFT_CLIENT_SECRET;
    let response;try{response=await fetcher('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form),signal:AbortSignal.timeout(15000)});}catch{throw new DeliveryError('microsoft_auth_unavailable',true);}
    if(!response.ok)throw new DeliveryError('microsoft_auth_rejected',true);
    const data=await response.json();if(!data.access_token||!data.expires_in)throw new DeliveryError('microsoft_auth_invalid',true);
    auth={accessToken:data.access_token,refreshToken:data.refresh_token||form.refresh_token,expiresAt:Date.now()+data.expires_in*1000};await store.set('auth/microsoft',auth);
  }
  let response;try{response=await fetcher('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',headers:{Authorization:`Bearer ${auth.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({message:{subject:message.subject,body:{contentType:'Text',content:message.text},toRecipients:[{emailAddress:{address:env.PRIVATE_EMAIL_TO}}],internetMessageHeaders:[{name:'x-workbuddy-report-id',value:`${message.date}-${message.reportVersion}`}]},saveToSentItems:true}),signal:AbortSignal.timeout(15000)});}catch{throw new DeliveryError('graph_send_unknown');}
  if(response.status!==202)throw new DeliveryError(`graph_http_${response.status}`,response.status>=400&&response.status<500);
  return {provider:'microsoft-graph',accepted:true,status:202,requestId:response.headers.get('request-id')};
}
export class TencentDocs {
  constructor(env,store,fetcher=fetch){this.env=env;this.store=store;this.fetcher=fetcher;}
  async token(){
    const current=await this.store.get('auth/tencent');
    if(current?.expiresAt>Date.now()+120000)return current;
    const e=this.env;for(const k of ['TENCENT_CLIENT_ID','TENCENT_CLIENT_SECRET','TENCENT_REFRESH_TOKEN','TENCENT_OPEN_ID'])if(!e[k])throw Error(`missing_${k}`);
    const url=new URL('https://docs.qq.com/oauth/v2/token');url.search=new URLSearchParams({client_id:e.TENCENT_CLIENT_ID,client_secret:e.TENCENT_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:current?.refreshToken||e.TENCENT_REFRESH_TOKEN});
    const res=await this.fetcher(url,{signal:AbortSignal.timeout(12000)});if(!res.ok)throw Error('tencent_auth_failed');
    const data=await res.json();if(!data.access_token||!data.expires_in)throw Error('tencent_token_invalid');
    const token={accessToken:data.access_token,refreshToken:data.refresh_token||current?.refreshToken||e.TENCENT_REFRESH_TOKEN,openId:data.user_id||e.TENCENT_OPEN_ID,expiresAt:Date.now()+data.expires_in*1000};await this.store.set('auth/tencent',token);return token;
  }
  async api(path,{method='GET',form,json}={}){
    const auth=await this.token();const headers={'Access-Token':auth.accessToken,'Client-Id':this.env.TENCENT_CLIENT_ID,'Open-Id':auth.openId};
    if(form)headers['Content-Type']='application/x-www-form-urlencoded';if(json)headers['Content-Type']='application/json';
    const res=await this.fetcher(`https://docs.qq.com${path}`,{method,headers,body:form?new URLSearchParams(form):json?JSON.stringify(json):undefined,signal:AbortSignal.timeout(16000)});
    if(!res.ok)throw Error(`tencent_http_${res.status}`);const data=await res.json();if(data.ret!==undefined&&data.ret!==0)throw Error(`tencent_ret_${data.ret}`);return data.data??data;
  }
  async publish(report){
    const readers=(this.env.TENCENT_READER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!readers.length)throw Error('tencent_readers_not_configured');
    const key=`documents/${report.date}/${report.version}`;let doc=await this.store.get(key);
    if(doc?.status==='creating')throw Error('document_creation_unknown');
    if(!doc){
      // Persist before create: a timeout must never create a second document automatically.
      await this.store.set(key,{status:'creating'});
      const created=await this.api('/openapi/drive/v2/files',{method:'POST',form:{title:`WorkBuddy 日报 ${report.date}`,type:'doc',templateVersion:'0',...(this.env.TENCENT_FOLDER_ID?{folderID:this.env.TENCENT_FOLDER_ID}:{})}});
      const id=created.ID,url=created.url;
      if(!id||!url||new URL(url).hostname!=='docs.qq.com')throw Error('document_create_response_invalid');
      doc={id,url,status:'created',contentHash:hash(report.detail)};await this.store.set(key,doc);
    }
    const path=`/openapi/doc/v3/${encodeURIComponent(doc.id)}`;
    const current=await this.api(path);
    const text=docText(current);
    if(!text.includes(report.detail)){
      if(text.trim())throw Error('document_content_conflict');
      await this.api(`${path}:batchUpdate`,{method:'POST',json:{requests:[{insertText:{text:report.detail,location:{index:1}}}],...(current.version?{version:current.version}:{})}});
    }
    await this.api(`/openapi/drive/v2/files/${doc.id}/permission`,{method:'PATCH',form:{policy:'members'}});
    await this.api(`/openapi/drive/v2/files/${doc.id}/collaborators`,{method:'PATCH',json:{collaborators:readers.map(id=>({type:'user',role:'reader',id}))}});
    const [content,permissions,collaborators]=await Promise.all([this.api(path),this.api(`/openapi/drive/v2/files/${doc.id}/permission`),this.api(`/openapi/drive/v2/files/${doc.id}/collaborators`)]);
    if(!docText(content).includes(report.detail)||permissions.policy!=='members'||!readers.every(id=>collaborators.collaborators?.some(c=>c.id===id&&c.role==='reader')))throw Error('document_verification_failed');
    const verified={...doc,status:'verified',verifiedAt:new Date().toISOString(),readers};await this.store.set(key,verified);return verified;
  }
}
export function docText(object){
  if(!object||typeof object!=='object')return '';
  if(object.type==='Text' && typeof object.text==='string')return object.text;
  const text=Object.values(object).filter(x=>typeof x==='object').map(x=>Array.isArray(x)?x.map(docText).join(''):docText(x)).join('');
  return text+(object.type==='Paragraph'?'\n':'');
}
