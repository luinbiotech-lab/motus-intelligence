import {writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('out',{recursive:true});
const B='https://motusnova.blogspot.com';const out={};
const get=async u=>{try{const r=await fetch(u,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'}});return {status:r.status,location:r.headers.get('location'),xrobots:r.headers.get('x-robots-tag'),text:await r.text()}}catch(e){return {error:String(e)}}};
const robots=await get(B+'/robots.txt');out.robots={status:robots.status,text:robots.text?.slice(0,800)};
for(const p of ['/sitemap.xml','/sitemap-pages.xml','/feeds/posts/default']){const r=await get(B+p);out[p]={status:r.status,location:r.location,len:r.text?.length,head:r.text?.slice(0,300)}}
const home=await get(B+'/');const post=await get(B+'/2026/11/062-5683-1-09.html');
for(const [k,r] of [['home',home],['post',post]]){const t=r.text??'';out[k]={status:r.status,xrobots:r.xrobots,metaRobots:[...t.matchAll(/<meta[^>]+name=['"]robots['"][^>]*>/gi)].map(m=>m[0]),canonical:t.match(/<link[^>]+rel=['"]canonical['"][^>]*>/i)?.[0],ogImage:t.match(/<meta[^>]+property=['"]og:image['"][^>]*>/i)?.[0],title:t.match(/<title>([^<]*)/)?.[1],description:t.match(/<meta[^>]+name=['"]description['"][^>]*>/i)?.[0],gsv:[...t.matchAll(/google-site-verification[^>]*/gi)].map(m=>m[0]).slice(0,2),noindexAny:/noindex/i.test(t)}}
writeFileSync('out/seo.json',JSON.stringify(out,null,2));
