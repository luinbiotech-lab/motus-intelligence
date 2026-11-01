import fs from 'node:fs';
const out=[];const UA={'user-agent':'Mozilla/5.0 (compatible; MOTUS-ResearchCollector/1.0; +https://motusnova.blogspot.com)',accept:'application/json'};
async function get(url,label,n=1500){try{const r=await fetch(url,{headers:UA,signal:AbortSignal.timeout(20000)});const t=await r.text();out.push(`## ${label} ${r.status} len=${t.length}\n${t.slice(0,n)}`);return t}catch(e){out.push(`## ${label} ERR ${e}`)}}
for(const s of ['^GSPC','^KS11','^TNX'])await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1mo&interval=1d`,'yahoo '+s,600);
for(const cat of ['invest','market','economy']){const t=await get(`https://m.stock.naver.com/api/research/${cat}?page=1&pageSize=100`,'naver '+cat,0);try{const items=JSON.parse(t);const wk=items.filter(i=>/주간|Weekly|위클리|다음 주|다음주|전망/i.test(i.title));out.push(wk.map(i=>`${i.writeDate} ${i.brokerName} ${i.researchId} ${i.title}`).join('\n'));for(const i of wk.slice(0,3)){await get(`https://m.stock.naver.com/api/research/${cat}/${i.researchId}`,'detail '+i.title,2500)}}catch(e){out.push('parse '+e)}}
await get('https://nfs.faireconomy.media/ff_calendar_thisweek.json','ff thisweek',3000);
await get('https://nfs.faireconomy.media/ff_calendar_nextweek.json','ff nextweek',1500);
await get('https://api.nasdaq.com/api/calendar/earnings?date=2026-11-03','nasdaq earnings',2500);
await get('https://api.nasdaq.com/api/calendar/economicevents?date=2026-11-03','nasdaq econ',2500);
await get('https://finance.naver.com/sise/sise_index_day.naver?code=KOSPI','naver kospi day',300);
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n\n'));
