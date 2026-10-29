import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('diag/out5',{recursive:true});
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
for(const [k,u] of Object.entries({
 p1:'https://m.stock.naver.com/api/stock/005930/price?pageSize=3&page=1',
 p2:'https://m.stock.naver.com/api/stock/005930/basic',
 p3:'https://api.stock.naver.com/chart/domestic/item/005930/day?startDateTime=202610200000&endDateTime=202610300000',
 st_kospi:'https://m.stock.naver.com/api/stocks/searchTop/KOSPI?page=1&pageSize=10',
 spark2:'https://query1.finance.yahoo.com/v7/finance/spark?symbols=GOOG,NOW,XLK&range=5d&interval=1d',
})){try{const r=await fetch(u,{headers:{'user-agent':UA},signal:AbortSignal.timeout(20000)});writeFileSync(`diag/out5/${k}.txt`,`${r.status}\n`+(await r.text()).slice(0,6000))}catch(e){writeFileSync(`diag/out5/${k}.txt`,String(e))}}
