import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('diag/out',{recursive:true});
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const targets={
 naver_market_list:'https://finance.naver.com/research/market_info_list.naver',
 naver_invest_list:'https://finance.naver.com/research/invest_list.naver',
 naver_company_list:'https://finance.naver.com/research/company_list.naver',
 naver_industry_list:'https://finance.naver.com/research/industry_list.naver',
 naver_economy_list:'https://finance.naver.com/research/economy_list.naver',
 naver_lastsearch:'https://finance.naver.com/sise/lastsearch2.naver',
 naver_m_research:'https://m.stock.naver.com/api/research/category/market?pageSize=5',
 hankyung_consensus:'https://consensus.hankyung.com/analysis/list',
 google_trends_kr:'https://trends.google.com/trending/rss?geo=KR',
 google_trends_us:'https://trends.google.com/trending/rss?geo=US',
 yahoo_trending_us:'https://query1.finance.yahoo.com/v1/finance/trending/US?count=10',
 yahoo_gainers:'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=10',
 nasdaq_movers:'https://api.nasdaq.com/api/marketmovers?assetclass=stocks',
 blackrock_weekly:'https://www.blackrock.com/corporate/insights/blackrock-investment-institute/publications/weekly-commentary',
 ms_ideas:'https://www.morganstanley.com/insights',
 jpm_insights:'https://am.jpmorgan.com/us/en/asset-management/adv/insights/market-insights/market-updates/on-the-minds-of-investors/',
 schwab_rss:'https://www.schwab.com/learn/rss.xml',
 hankyung_global_rss:'https://www.hankyung.com/feed/international',
 mk_global_rss:'https://www.mk.co.kr/rss/50300009/',
 yna_market_rss:'https://www.yna.co.kr/rss/market.xml',
 einfomax:'https://news.einfomax.co.kr/rss/S1N2.xml',
};
const out={};
for(const [k,url] of Object.entries(targets)){
 try{const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'ko-KR,ko;q=0.9,en;q=0.8'},signal:AbortSignal.timeout(20000)});const buf=Buffer.from(await r.arrayBuffer());
  const ct=r.headers.get('content-type')||'';let text=buf.toString('utf8');if(/euc-kr/i.test(ct)||/charset=euc-kr/i.test(text.slice(0,2000)))text=new TextDecoder('euc-kr').decode(buf);
  out[k]={status:r.status,ct,len:text.length,finalUrl:r.url};writeFileSync(`diag/out/${k}.txt`,text.slice(0,200000));
 }catch(e){out[k]={error:String(e?.cause?.code??e)}}
}
writeFileSync('diag/out/summary.json',JSON.stringify(out,null,1));
