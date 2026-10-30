import fs from 'node:fs';
const out=[];const log=(...a)=>out.push(a.join(' '));
try{
const m=await import('./dist/src/operations/market-deep-collect.js');
const r=await m.collectAIDeep({operationDate:'2026-10-30',candidateUSSessions:['2026-10-29'],at:new Date().toISOString(),fetcher:fetch,audit:[]});
for(const s of r.composition.sections.filter(s=>s.key==='ai-broker-research'))for(const p of s.paragraphs)log('-',p.text);
}catch(e){log('ERROR',e.stack)}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
