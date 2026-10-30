import fs from 'node:fs';
const out=[];const log=(...a)=>out.push(a.join(' '));
try{
const {collectBrokerResearch}=await import('./dist/src/operations/broker-briefs.js');
const kr=await collectBrokerResearch({sessionDate:'2026-10-29',operationDate:'2026-10-30',verifiedKospiClose:5937.66});
for(const b of kr.briefs){log('#',b.report.broker,b.report.title,'st',b.statements.length);for(const s of b.statements)if(s.region==='KOREA')log('  K',s.text.slice(0,120))}
log('FAILED',JSON.stringify(kr.audit.filter(a=>a.status==='FAILED').map(a=>a.sourceId+' '+a.error)));
}catch(e){log('ERROR',e.stack)}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
