import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
mkdirSync('diag/out3',{recursive:true});
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get=async(url,opt={})=>{const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'ko-KR,ko;q=0.9',referer:'https://consensus.hankyung.com/analysis/list',...(opt.headers||{})},signal:AbortSignal.timeout(25000)});return {status:r.status,buf:Buffer.from(await r.arrayBuffer())}};
const out={};
for(const [k,u] of Object.entries({
 mk_default:'https://consensus.hankyung.com/analysis/list?report_type=MK&sdate=2026-10-27&edate=2026-10-30&now_page=1&pagenum=80',
 mk_market:'https://consensus.hankyung.com/analysis/list?skinType=market&report_type=MK&sdate=2026-10-27&edate=2026-10-30&now_page=1&pagenum=80',
 ec_default:'https://consensus.hankyung.com/analysis/list?report_type=EC&sdate=2026-10-27&edate=2026-10-30&now_page=1&pagenum=80',
 in_industry:'https://consensus.hankyung.com/analysis/list?skinType=industry&report_type=IN&sdate=2026-10-27&edate=2026-10-30&now_page=1&pagenum=80',
})){const r=await get(u);writeFileSync(`diag/out3/${k}.html`,r.buf);out[k]={status:r.status,len:r.buf.length}}
const mk=readFileSync('diag/out3/mk_default.html','utf8');const ids=[...new Set([...mk.matchAll(/downpdf\?report_idx=(\d+)/g)].map(m=>m[1]))].slice(0,3);
for(const id of ids){const r=await get(`https://consensus.hankyung.com/analysis/downpdf?report_idx=${id}`);writeFileSync(`diag/out3/r${id}.pdf`,r.buf);try{writeFileSync(`diag/out3/r${id}.raw.txt`,execFileSync('pdftotext',['-l','2',`diag/out3/r${id}.pdf`,'-'],{maxBuffer:1e8}));}catch(e){}}
writeFileSync('diag/out3/summary.json',JSON.stringify(out,null,1));
