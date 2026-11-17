/**
 * Daily briefing notifications (owner 2026-11-16: the summary as an installable web app with a daily alert, cost 0).
 * Runs as a Cloudflare Worker (free plan): readers' browsers register a Web Push subscription; on weekday evenings a
 * cron reads the fixed summary link and, once per new summary title, sends one notification to every subscriber.
 * Subscriptions hold no personal data beyond the browser's push endpoint and keys. Gone subscriptions (404/410) are removed.
 */
import {buildPushPayload,type PushSubscription,type VapidKeys} from '@block65/webcrypto-web-push';

export interface KV {get(key:string):Promise<string|null>;put(key:string,value:string):Promise<void>;delete(key:string):Promise<void>;list(options?:{prefix?:string;cursor?:string}):Promise<{keys:Array<{name:string}>;list_complete:boolean;cursor?:string}>}
export interface PushEnv {SUBSCRIPTIONS:KV;VAPID_PUBLIC_KEY:string;VAPID_PRIVATE_KEY:string;VAPID_SUBJECT:string;SITE_ORIGIN:string;SUMMARY_URL:string}

const SUB_PREFIX='sub:';
export async function subscriptionKey(endpoint:string):Promise<string>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint));
  return SUB_PREFIX+[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function validSubscription(value:unknown):value is PushSubscription{
  const sub=value as PushSubscription|null;
  return Boolean(sub&&typeof sub.endpoint==='string'&&/^https:\/\//.test(sub.endpoint)&&sub.endpoint.length<1000&&typeof sub.keys?.p256dh==='string'&&typeof sub.keys?.auth==='string'&&sub.keys.p256dh.length<200&&sub.keys.auth.length<100);
}

function cors(env:PushEnv,origin:string|null):Record<string,string>{
  const allowed=new URL(env.SITE_ORIGIN).origin;
  return origin===allowed?{'access-control-allow-origin':allowed,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type','vary':'origin'}:{vary:'origin'};
}

export async function handleRequest(request:Request,env:PushEnv):Promise<Response>{
  const url=new URL(request.url),headers=cors(env,request.headers.get('origin'));
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method==='GET'&&url.pathname==='/vapid-public-key')return new Response(env.VAPID_PUBLIC_KEY,{headers:{...headers,'content-type':'text/plain'}});
  if(request.method==='POST'&&(url.pathname==='/subscribe'||url.pathname==='/unsubscribe')){
    if(!headers['access-control-allow-origin'])return new Response('forbidden origin',{status:403,headers});
    let body:unknown;try{body=await request.json()}catch{return new Response('bad json',{status:400,headers})}
    if(!validSubscription(body))return new Response('bad subscription',{status:400,headers});
    const key=await subscriptionKey(body.endpoint);
    if(url.pathname==='/subscribe')await env.SUBSCRIPTIONS.put(key,JSON.stringify({endpoint:body.endpoint,keys:body.keys,expirationTime:null}));else await env.SUBSCRIPTIONS.delete(key);
    return new Response('ok',{status:200,headers});
  }
  return new Response('not found',{status:404,headers});
}

/** The summary title is the first line after '[제목]' in the phone copy text. */
export function summaryTitle(text:string):string|null{return text.match(/\[제목\]\s*\n([^\n]+)/)?.[1]?.trim()||null}

export async function sendDaily(env:PushEnv,fetcher:typeof fetch=fetch):Promise<{state:'SENT'|'ALREADY_SENT'|'NO_SUMMARY';title:string|null;sent:number;removed:number;failed:number}>{
  const response=await fetcher(env.SUMMARY_URL,{headers:{'cache-control':'no-cache'}});
  const title=response.ok?summaryTitle(await response.text()):null;
  if(!title)return {state:'NO_SUMMARY',title:null,sent:0,removed:0,failed:0};
  if(await env.SUBSCRIPTIONS.get('meta:last-title')===title)return {state:'ALREADY_SENT',title,sent:0,removed:0,failed:0};
  const vapid:VapidKeys={subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY};
  const data=JSON.stringify({title:'MOTUS 증시 브리핑',body:title,url:env.SITE_ORIGIN});
  let sent=0,removed=0,failed=0,cursor:string|undefined;
  do{
    const page=await env.SUBSCRIPTIONS.list({prefix:SUB_PREFIX,...(cursor?{cursor}:{})});
    for(const {name} of page.keys){
      const raw=await env.SUBSCRIPTIONS.get(name);if(!raw)continue;
      try{
        const subscription=JSON.parse(raw) as PushSubscription;
        const payload=await buildPushPayload({data,options:{ttl:6*3600,urgency:'normal'}},subscription,vapid);
        const result=await fetcher(subscription.endpoint,{...payload,method:'POST'} as RequestInit);
        if(result.status===404||result.status===410){await env.SUBSCRIPTIONS.delete(name);removed++}else if(result.ok)sent++;else failed++;
      }catch{failed++}
    }
    cursor=page.list_complete?undefined:page.cursor;
  }while(cursor);
  await env.SUBSCRIPTIONS.put('meta:last-title',title);
  return {state:'SENT',title,sent,removed,failed};
}
