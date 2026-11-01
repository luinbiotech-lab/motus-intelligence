import fs from 'node:fs';
const UA={'user-agent':'Mozilla/5.0 (compatible; MOTUS-MarketCollector/1.0)',accept:'application/json'};
const out={};
const syms=['^GSPC','^IXIC','^DJI','^KS11','^KQ11','^TNX','KRW=X','^SOX','XLK','XLC','XLY','XLF','XLV','XLI','XLE','XLB','XLP','XLU','XLRE'];
for(const s of syms){try{const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=3mo&interval=1d`,{headers:UA});const j=await r.json();const res=j.chart.result[0];const tz=res.meta.exchangeTimezoneName;out[s]=res.timestamp.map((t,i)=>[new Intl.DateTimeFormat('en-CA',{timeZone:tz}).format(new Date(t*1000)),res.indicators.quote[0].close[i]]).filter(x=>x[1]!=null)}catch(e){out[s]=String(e)}}
// Korea investor flows (KOSPI) recent days
for(const u of ['https://m.stock.naver.com/api/index/KOSPI/trend','https://m.stock.naver.com/api/index/KOSPI/investorTrend?page=1&pageSize=10','https://m.stock.naver.com/api/index/KOSPI/integration']){try{const r=await fetch(u,{headers:UA});out[u]=(r.status+' '+(await r.text())).slice(0,3000)}catch(e){out[u]=String(e)}}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/report-data.json',JSON.stringify(out));
