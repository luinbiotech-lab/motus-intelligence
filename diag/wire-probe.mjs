import {WIRE_FEEDS,parseWireFeed,selectWireReports,isCloseReport,wireWindow} from '../dist/src/operations/market-wire.js';
const session=process.argv[2],change=Number(process.argv[3]);
const UA='Mozilla/5.0 (compatible; MOTUS-MarketCollector/1.0; +https://motusnova.blogspot.com)';
const all=[];
for(const feed of WIRE_FEEDS){try{const r=await fetch(feed.url,{headers:{'user-agent':UA}});const xml=await r.text();const items=parseWireFeed(xml,feed);all.push(...items);const times=items.map(i=>i.publishedAt).sort();console.log('FEED',feed.url,r.status,'items',items.length,'oldest',times[0],'newest',times.at(-1),'close-titles',items.filter(i=>isCloseReport('KOREA',i.title)).length)}catch(e){console.log('FEED',feed.url,'ERR',String(e).slice(0,80))}}
const [from,to]=wireWindow('KOREA',session);
for(const i of all.filter(i=>isCloseReport('KOREA',i.title)))console.log('CLOSE',i.publishedAt,i.publisher,Date.parse(i.publishedAt)>=from&&Date.parse(i.publishedAt)<=to?'IN':'OUT',i.sentence?'S':'-',i.title.slice(0,70));
console.log('SELECTED',JSON.stringify(selectWireReports(all,'KOREA',session,change,Date.now()).map(r=>[r.publisher,r.title.slice(0,50)])));
const id=process.env.NAVER_DATALAB_CLIENT_ID,sec=process.env.NAVER_DATALAB_CLIENT_SECRET;
if(id&&sec){for(const q of ['코스피 마감','뉴욕증시 마감']){const r=await fetch(`https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(q)}&display=50&sort=date`,{headers:{'X-NCP-APIGW-API-KEY-ID':id.trim(),'X-NCP-APIGW-API-KEY':sec.trim()}});const t=await r.text();let j={};try{j=JSON.parse(t)}catch{};console.log('NAVERNEWS',q,r.status,'total',j.total,'items',(j.items||[]).length);for(const it of (j.items||[]).slice(0,25)){const title=it.title.replace(/<[^>]+>/g,'').replace(/&quot;/g,'"');console.log('NN',it.pubDate,(it.originallink||'').split('/')[2],isCloseReport(q.startsWith('코')?'KOREA':'US',title)?'CLOSE':'-',title.slice(0,70))}}}
