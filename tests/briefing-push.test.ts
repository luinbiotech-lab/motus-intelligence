import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest,sendDaily,summaryTitle,validSubscription,type KV,type PushEnv} from '../src/push/briefing-push.js';

const b64u=(bytes:ArrayBuffer)=>Buffer.from(bytes).toString('base64url');
class MemKV implements KV {map=new Map<string,string>();async get(k:string){return this.map.get(k)??null}async put(k:string,v:string){this.map.set(k,v)}async delete(k:string){this.map.delete(k)}
  async list(o?:{prefix?:string}){return {keys:[...this.map.keys()].filter(k=>k.startsWith(o?.prefix??'')).map(name=>({name})),list_complete:true}}}
async function env():Promise<PushEnv&{SUBSCRIPTIONS:MemKV}>{
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']) as CryptoKeyPair;
  const jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);
  return {SUBSCRIPTIONS:new MemKV(),VAPID_PUBLIC_KEY:b64u(await crypto.subtle.exportKey('raw',pair.publicKey)),VAPID_PRIVATE_KEY:jwk.d!,VAPID_SUBJECT:'https://h.example/m/',SITE_ORIGIN:'https://h.example/m/',SUMMARY_URL:'https://raw.example/naver-latest.txt'};
}
async function browserSubscription(endpoint:string){
  const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']) as CryptoKeyPair;
  return {endpoint,expirationTime:null,keys:{p256dh:b64u(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:b64u(crypto.getRandomValues(new Uint8Array(16)).buffer)}};
}
const post=(path:string,body:unknown,origin='https://h.example')=>new Request('https://push.example'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});

test('only the briefing site may subscribe, and only a well-formed https subscription is stored', async () => {
  const e=await env(),sub=await browserSubscription('https://fcm.googleapis.com/fcm/send/abc');
  assert.equal((await handleRequest(post('/subscribe',sub,'https://evil.example'),e)).status,403);
  assert.equal((await handleRequest(post('/subscribe',{endpoint:'http://x'},'https://h.example'),e)).status,400);
  assert.equal((await handleRequest(post('/subscribe',sub),e)).status,200);
  assert.equal([...e.SUBSCRIPTIONS.map.keys()].filter(k=>k.startsWith('sub:')).length,1);
  assert.equal((await handleRequest(post('/unsubscribe',sub),e)).status,200);
  assert.equal(e.SUBSCRIPTIONS.map.size,0);
  assert.equal(validSubscription({endpoint:'https://x',keys:{p256dh:'a',auth:'b'}}),true);
});

test('one notification per new summary title; gone subscriptions are removed', async () => {
  const e=await env();
  await handleRequest(post('/subscribe',await browserSubscription('https://push.example/live')),e);
  await handleRequest(post('/subscribe',await browserSubscription('https://push.example/gone')),e);
  const sent:string[]=[];
  const fetcher=(async(url:string,init?:RequestInit)=>{
    if(url===e.SUMMARY_URL)return new Response('[제목]\n11월 16일 증시 브리핑: 코스피 마감\n\n[태그]\n#x');
    sent.push(url);assert.equal(init?.method,'POST');return new Response(null,{status:url.endsWith('/gone')?410:201});
  }) as unknown as typeof fetch;
  const first=await sendDaily(e,fetcher);
  assert.deepEqual({state:first.state,sent:first.sent,removed:first.removed},{state:'SENT',sent:1,removed:1});
  assert.equal((await sendDaily(e,fetcher)).state,'ALREADY_SENT');
  assert.equal(sent.length,2);
});

test('no summary means no notification', async () => {
  const e=await env();
  const fetcher=(async()=>new Response('',{status:404})) as unknown as typeof fetch;
  assert.equal((await sendDaily(e,fetcher)).state,'NO_SUMMARY');
  assert.equal(summaryTitle('[제목]\n  제목입니다 \n'),'제목입니다');
});
