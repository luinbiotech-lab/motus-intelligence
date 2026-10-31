import fs from 'node:fs';
const out=[];const log=(...a)=>out.push(a.join(' '));
try{const m=await import('./dist/src/operations/market-deep-collect.js');
const r=await m.collectUSDeep({sessionDate:'2026-10-30',operationDate:'2026-10-31',at:new Date().toISOString(),fetcher:fetch,audit:[],indexChanges:[-1.82,-2.86,-1.09]});
log('TITLE',r.title);for(const s of r.composition.sections.filter(s=>s.key==='us-sectors-stocks'))for(const p of s.paragraphs.slice(0,5))log('-',p.text.slice(0,200));}catch(e){log('ERROR',e.stack)}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
