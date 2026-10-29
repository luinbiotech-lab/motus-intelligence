import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
mkdirSync('diag/out2',{recursive:true});
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get=async(url,opt={})=>{const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'ko-KR,ko;q=0.9',...(opt.headers||{})},signal:AbortSignal.timeout(25000)});return {status:r.status,ct:r.headers.get('content-type')||'',buf:Buffer.from(await r.arrayBuffer())}};
const out={};
for(const t of ['MK','CO','IN','EC']){const u=`https://consensus.hankyung.com/analysis/list?skinType=business&report_type=${t}&sdate=2026-10-28&edate=2026-10-30&now_page=1&pagenum=80`;try{const r=await get(u);writeFileSync(`diag/out2/hk_${t}.html`,r.buf);out['hk_'+t]={status:r.status,len:r.buf.length}}catch(e){out['hk_'+t]={error:String(e)}}}
// PDF download test: first market report

const mk=(await import('node:fs')).readFileSync('diag/out2/hk_MK.html','utf8');const ids=[...mk.matchAll(/downpdf\?report_idx=(\d+)/g)].map(m=>m[1]);out.mkIds=[...new Set(ids)].slice(0,5);
for(const id of out.mkIds.slice(0,2)){try{const r=await get(`https://consensus.hankyung.com/analysis/downpdf?report_idx=${id}`,{headers:{referer:'https://consensus.hankyung.com/analysis/list'}});writeFileSync(`diag/out2/r${id}.pdf`,r.buf);out['pdf'+id]={status:r.status,ct:r.ct,len:r.buf.length,magic:r.buf.subarray(0,5).toString()};try{const txt=execFileSync('pdftotext',['-layout',`diag/out2/r${id}.pdf`,'-'],{maxBuffer:1e8}).toString();writeFileSync(`diag/out2/r${id}.txt`,txt);out['pdf'+id].textLen=txt.length}catch(e){out['pdf'+id].pdftotext=String(e).slice(0,200)}}catch(e){out['pdf'+id]={error:String(e)}}}
for(const [k,u] of Object.entries({
 y_losers:'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_losers&count=10',
 y_active:'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=15',
 y_trending:'https://query1.finance.yahoo.com/v1/finance/trending/US?count=15',
 nv_searchtop:'https://m.stock.naver.com/api/stocks/searchTop/all?page=1&pageSize=20',
 nv_popular:'https://m.stock.naver.com/api/home/popularStocks',
 nv_front_search:'https://m.stock.naver.com/front-api/search/popularStocks?nationType=KOR',
 nv_up:'https://m.stock.naver.com/api/stocks/up/KOSPI?page=1&pageSize=10',
 nv_kospi_basic:'https://m.stock.naver.com/api/index/KOSPI/basic',
 gtrends_kr:'https://trends.google.com/trending/rss?geo=KR',
 sp_sectors:'https://query1.finance.yahoo.com/v7/finance/spark?symbols=XLK,XLF,XLE,XLV,XLY,XLP,XLI,XLB,XLU,XLRE,XLC&range=5d&interval=1d',
})){try{const r=await get(u);writeFileSync(`diag/out2/${k}.txt`,r.buf);out[k]={status:r.status,len:r.buf.length,head:r.buf.subarray(0,300).toString()}}catch(e){out[k]={error:String(e)}}}
writeFileSync('diag/out2/summary.json',JSON.stringify(out,null,1));
