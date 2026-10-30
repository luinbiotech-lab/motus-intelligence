import fs from 'node:fs';
const out=[];const log=(...a)=>out.push(a.join(' '));
const r=await fetch('https://www.schwab.com/learn/story/stock-market-update-open',{headers:{'user-agent':'Mozilla/5.0 (compatible; MOTUS-ResearchCollector/1.0; +https://motusnova.blogspot.com)'}});
const h=await r.text();log('status',r.status,h.length,r.url);
for(const m of h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g))log('LD',m[1].slice(0,1500));
log('META',[...h.matchAll(/<meta[^>]+(?:property|name)="(?:og:title|og:description|description|article:published_time|author|og:url)"[^>]*>/g)].map(m=>m[0]).join('\n'));
const i=h.indexOf('Published as of');log('AROUND',h.slice(i-1500,i+4000).replace(/\s+/g,' '));
const j=h.indexOf('said ');log('SAID',h.slice(j-800,j+400).replace(/\s+/g,' '));
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));fs.writeFileSync('out/schwab.html',h);
