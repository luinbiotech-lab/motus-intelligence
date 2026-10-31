import fs from 'node:fs';
const out=[];const log=(...a)=>out.push(a.join(' '));
try{const m=await import('./dist/src/operations/market-deep-collect.js');const w=await import('./dist/src/operations/market-wire.js');
const r=await m.collectUSDeep({sessionDate:'2026-10-30',operationDate:'2026-10-31',at:new Date().toISOString(),fetcher:fetch,audit:[],indexChanges:[-1.82,-2.86,-1.09]});
log('TITLE',r.title);for(const s of r.composition.sections){log('##',s.title);for(const p of s.paragraphs)log('-',p.text,p.source?'<'+p.source.url+'>':'')}
// full wire descriptions
for(const f of w.WIRE_FEEDS){try{const x=await (await fetch(f.url,{headers:{'user-agent':'Mozilla/5.0'}})).text();for(const it of x.split(/<item[\s>]/).slice(1)){const t=(it.match(/<title>([\s\S]*?)<\/title>/)||[])[1]||'';if(/뉴욕|월가|인텔|아마존|나스닥/.test(t)){const d=(it.match(/<description>([\s\S]*?)<\/description>/)||[])[1]||'';const l=(it.match(/<link>([\s\S]*?)<\/link>/)||[])[1]||'';const p=(it.match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1]||'';log('WIRE',f.publisher,p,t.replace(/<!\[CDATA\[|\]\]>/g,''),l.replace(/<!\[CDATA\[|\]\]>/g,''));log('DESC',d.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,1500))}}}catch(e){}}
}catch(e){log('ERROR',e.stack)}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
