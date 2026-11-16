import {collectWireCloses} from '../dist/src/operations/market-wire.js';
for(const [region,session,change] of [['KOREA','2026-11-16',-3.59],['KOREA','2026-11-13',null],['US','2026-11-13',null]]){
  const r=await collectWireCloses({region,sessionDate:session,change,fetcher:fetch});
  console.log('RESULT',region,session,'reports',r.reports.length);
  for(const x of r.reports)console.log('REP',x.publisher,x.title.slice(0,50),'|',(x.sentence||'').slice(0,120));
  for(const a of r.audit.filter(a=>a.status!=='PASS'))console.log('AUD',a.sourceId.slice(0,90),a.error);
}
