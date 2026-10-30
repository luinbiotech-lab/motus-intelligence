import fs from 'node:fs';
const out=[];const log=(...a)=>out.push(a.join(' '));
try{
const {collectAIDeep}=await import('./dist/src/operations/market-deep-collect.js');
const r=await collectAIDeep({operationDate:'2026-10-30',candidateUSSessions:['2026-10-29','2026-10-28'],at:new Date().toISOString(),fetcher:fetch,audit:[]});
log('TITLE',r.title,'core',r.composition.hasCoreCommentary);
for(const s of r.composition.sections){log('##',s.title,s.placement);for(const p of s.paragraphs)log('-',p.text)}
}catch(e){log('ERROR',e.stack)}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
