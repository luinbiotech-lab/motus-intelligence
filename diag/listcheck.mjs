import fs from 'node:fs';
const UA={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'};
const out=[];const log=(...a)=>out.push(a.join(' '));
async function get(u,enc){const r=await fetch(u,{headers:UA,signal:AbortSignal.timeout(20000)});const b=Buffer.from(await r.arrayBuffer());return {status:r.status,text:enc?new TextDecoder(enc).decode(b):b.toString('utf8')}}
const strip=t=>t.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
for(const u of ['https://finance.naver.com/research/market_info_list.naver','https://finance.naver.com/research/invest_list.naver']){const r=await get(u,'euc-kr');const i=r.text.search(/market_info_read|invest_read/);log('##',u);log(r.text.slice(Math.max(0,i-600),i+2500).replace(/\s+/g,' '))}
for(const sk of ['market','industry','company','economy']){const r=await get(`https://consensus.hankyung.com/analysis/list?skinType=${sk}&sdate=2026-10-29&edate=2026-10-30&now_page=1&pagenum=80`,'euc-kr');log('## hk',sk);log(strip(r.text).match(/2026-10-(29|30) .{0,90}/g)?.slice(0,6).join('\n'))}
fs.mkdirSync('out',{recursive:true});fs.writeFileSync('out/probe.txt',out.join('\n'));
