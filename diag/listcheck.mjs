import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('out',{recursive:true});
const B='https://motusnova.blogspot.com';const out={};
const UA={browser:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',none:undefined};
for(const [name,ua] of Object.entries(UA)){
 for(const p of ['/robots.txt','/','/2026/11/062-5683-1-09.html']){
  const r=await fetch(B+p,{redirect:'manual',headers:ua?{'user-agent':ua}:{}});const t=await r.text();
  out[name+' '+p]={status:r.status,location:r.headers.get('location'),xrobots:r.headers.get('x-robots-tag'),body:p==='/robots.txt'?t.slice(0,400):undefined,metaRobots:[...t.matchAll(/<meta[^>]+robots[^>]*>/gi)].map(m=>m[0]),canonical:t.match(/<link[^>]+rel=['"]canonical['"][^>]*>/i)?.[0],ogImage:t.match(/<meta[^>]+property=['"]og:image['"][^>]*>/i)?.[0],desc:t.match(/<meta[^>]+name=['"]description['"][^>]*>/i)?.[0]?.slice(0,200),len:t.length};
 }
}
// follow redirect of root
const f=await fetch(B+'/',{headers:{'user-agent':UA.browser}});out.followRoot={status:f.status,url:f.url,len:(await f.text()).length};
writeFileSync('out/seo2.json',JSON.stringify(out,null,2));
