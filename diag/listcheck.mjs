import fs from 'node:fs';
const out=[];const log=(...a)=>out.push(a.join(' '));
const show=(r)=>{log('TITLE',r.title);log('LEAD',r.composition.leadAddition.join(' '));for(const s of r.composition.sections){log('##',s.title);for(const p of s.paragraphs)log('-',p.text)}};
try{
const m=await import('./dist/src/operations/market-deep-collect.js');
const at=new Date().toISOString();
show(await m.collectUSDeep({sessionDate:'2026-10-29',operationDate:'2026-10-30',at,fetcher:fetch,audit:[],indexChanges:[-0.30,-1.38,-0.25]}));
log('=====');
show(await m.collectKoreaDeep({sessionDate:'2026-10-29',operationDate:'2026-10-30',at,fetcher:fetch,audit:[],kospiClose:5937.66,kospiChangePct:-1.24}));
}catch(e){log('ERROR',e.stack)}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
