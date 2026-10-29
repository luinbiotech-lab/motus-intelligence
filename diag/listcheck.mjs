import fs from 'node:fs';
const UA={'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148','accept':'application/json'};
const out=[];const log=(...a)=>out.push(a.join(' '));
const j=async u=>{const r=await fetch(u,{headers:UA,signal:AbortSignal.timeout(20000)});return r.json()};
const strip=t=>t.replace(/<br\s*\/?>/g,'\n').replace(/<\/p>/g,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ');
const m=await j('https://m.stock.naver.com/api/research/market?page=1&pageSize=40');
for(const it of m.slice(0,14)){const d=await j(`https://m.stock.naver.com/api/research/market/${it.researchId}`);const c=d.researchContent;log('####',it.writeDate,it.brokerName,it.title,'|',c.attachUrl,'| keys',Object.keys(c).join(','));log(strip(c.content||'').slice(0,1500))}
const c=await j('https://m.stock.naver.com/api/research/company?page=1&pageSize=3');const cd=await j(`https://m.stock.naver.com/api/research/company/${c[0].researchId}`);log('#### company detail',JSON.stringify(cd.researchContent).slice(0,1500));
const ind=await j('https://m.stock.naver.com/api/research/industry?page=1&pageSize=3');log('#### industry',JSON.stringify(ind).slice(0,800));
const inv=await j('https://m.stock.naver.com/api/research/invest?page=1&pageSize=12');for(const it of inv.slice(0,6)){const d=await j(`https://m.stock.naver.com/api/research/invest/${it.researchId}`);log('####',it.writeDate,it.brokerName,it.title);log(strip(d.researchContent.content||'').slice(0,800))}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
