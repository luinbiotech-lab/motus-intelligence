import fs from 'node:fs';
const UA={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'};
const out=[];const log=(...a)=>out.push(a.join(' '));
async function get(u,enc){const r=await fetch(u,{headers:UA,signal:AbortSignal.timeout(20000)});const b=Buffer.from(await r.arrayBuffer());return {status:r.status,text:enc?new TextDecoder(enc).decode(b):b.toString('utf8')}}
for(const u of ['https://finance.naver.com/research/market_info_list.naver','https://finance.naver.com/research/invest_list.naver','https://finance.naver.com/research/company_list.naver']){const r=await get(u,'euc-kr');const i=r.text.indexOf('type_1');log('##',u);log(r.text.slice(i,i+3500).replace(/\s+/g,' '))}
const s=await get('https://www.schwab.com/learn/story/stock-market-update-open');const t=s.text.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,'\n').replace(/\n\s*\n+/g,'\n');const k=t.indexOf('Stocks Dip');log('## schwab');log(t.slice(k,k+5000));
const e=await get('https://www.edwardjones.com/us-en/market-news-insights/stock-market-news/daily-market-recap');const te=e.text.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,'\n').replace(/\n\s*\n+/g,'\n');const ke=te.search(/Daily Market Recap|Stock market news/i);log('## edwardjones');log(te.slice(ke,ke+4000));
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
