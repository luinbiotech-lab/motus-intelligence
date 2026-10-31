import fs from 'node:fs';
const u='https://query1.finance.yahoo.com/v7/finance/spark?symbols=GOOGL,AMZN,INTC,XLK&range=5d&interval=1d';
const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0 (compatible; MOTUS-MarketCollector/1.0; +https://motusnova.blogspot.com)',accept:'application/json'}});
const t=await r.text();
const out=[r.status, t.slice(0,1500)];
try{const j=JSON.parse(t);for(const x of j.spark.result){const resp=x.response[0];out.push(x.symbol+' '+JSON.stringify(resp.timestamp.map(s=>new Date(s*1000).toISOString()))+' '+JSON.stringify(resp.indicators.quote[0].close))}}catch(e){out.push('parse '+e)}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
