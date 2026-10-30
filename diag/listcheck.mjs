import fs from 'node:fs';
const out=[];const log=(...a)=>out.push(a.join(' '));
try{
const {collectBrokerResearch}=await import('./dist/src/operations/broker-briefs.js');
const {composeUSDeepSections,composeKoreaDeepSections}=await import('./dist/src/operations/market-deep-sections.js');
const {collectKoreaSearchTop,collectUSAttention}=await import('./dist/src/operations/market-attention.js');
const show=(c)=>{for(const s of c.sections){log('##',s.title);for(const p of s.paragraphs)log('-',p.text,p.source?'<'+p.source.url+'>':'')}log('LEAD',c.leadAddition.join(' / '),'core=',c.hasCoreCommentary)};
const us=await collectBrokerResearch({sessionDate:'2026-10-29',operationDate:'2026-10-30'});
log('# US briefs',us.briefs.map(b=>b.report.broker+' '+b.report.title+' st='+b.statements.length+' dg='+b.digests.length).join(' | '));
log('# audit failed',JSON.stringify(us.audit.filter(a=>a.status==='FAILED')));
for(const b of us.briefs)for(const st of b.statements)log('  ST',b.report.broker,st.region,st.text);
const att=await collectUSAttention('2026-10-29',fetch).catch(()=>null);
show(composeUSDeepSections({bundle:us,stocks:att?.stocks??[],sectors:att?.sectors??[],checkpoint:'체크.'}));
const st=await collectKoreaSearchTop('2026-10-29',fetch).catch(()=>null);
const kr=await collectBrokerResearch({sessionDate:'2026-10-29',operationDate:'2026-10-30',verifiedKospiClose:5937.66,focusCodes:(st?.stocks??[]).map(s=>s.code)});
log('# KR briefs',kr.briefs.map(b=>b.report.broker+' '+b.report.title+' st='+b.statements.length).join(' | '));
log('# company',kr.company.length,kr.company.slice(0,8).map(r=>r.broker+' '+r.company+' '+r.rating+' '+r.targetPrice+' '+r.date).join(' | '));
show(composeKoreaDeepSections({bundle:kr,searchTop:st?.stocks??[],checkpoint:'체크.'}));
}catch(e){log('ERROR',e&&e.stack||e)}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
