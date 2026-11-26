/**
 * Daily traffic analysis input (owner request 2026-11-04): for the articles published on the previous KST day,
 * collect what can be measured and the top competing posts, so a daily analysis (Claude, shared with 루인) can say
 * whether traffic was high or low, why, and what to improve.
 *
 *   node dist/src/traffic-daily-cli.js --date YYYY-MM-DD      (analysis day; articles of the day before)
 *
 * Collected (each part is optional and records why it is missing; nothing is estimated):
 * - blog page views: Blogger API all-time/7d/30d counts; daily views = all-time delta since the last capture
 * - our articles: public feed entries published that KST day, with simple content features
 * - Search Console (when connected): clicks, impressions, CTR and position per article page
 * - Naver DataLab search interest for each article's keywords (existing API Hub key)
 * - Naver blog search (when NAVER_SEARCH_* is set): top posts per keyword with the same content features
 * Output: data/traffic/<date>/traffic-input.json. Read-only: never writes to the blog.
 */
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {articleKeywordFallbacks,articleKeywords,contentFeatures,fillEmptyDatalabSeries,normalizeBlogUrl,searchConsolePages,type ContentFeatures,type DatalabSeries} from './operations/traffic.js';
import {sitemapFreshness} from './production/run-record.js';
import {carriedIndexedUrls,inspectionUrlOrder,type PriorCapture} from './operations/index-sample.js';

const args=process.argv.slice(2),value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};
const date=value('--date')??'';
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('--date YYYY-MM-DD required');
const day=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const BLOG='https://motusnova.blogspot.com';
const root=join(process.cwd(),'data','traffic',date);
const env=(name:string)=>process.env[name]?.trim()||undefined;
const timeout=(ms:number)=>AbortSignal.timeout(ms);

async function googleToken(clientId:string,clientSecret:string,refreshToken:string):Promise<string> {
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:timeout(20000)});
  const body=await response.json() as {access_token?:string;error?:string};
  if(!body.access_token)throw new Error(`token: ${body.error??response.status}`);
  return body.access_token;
}
async function previousCapture():Promise<{capturedAt:string;allTime:number}|null> {
  const base=join(process.cwd(),'data','traffic');if(!existsSync(base))return null;
  for(const folder of (await readdir(base)).filter(name=>/^\d{4}-\d{2}-\d{2}$/.test(name)&&name<date).sort().reverse()){
    try{const prior=JSON.parse(await readFile(join(base,folder,'traffic-input.json'),'utf8')) as {pageviews?:{capturedAt?:string;allTime?:number}};if(prior.pageviews?.capturedAt&&typeof prior.pageviews.allTime==='number')return {capturedAt:prior.pageviews.capturedAt,allTime:prior.pageviews.allTime}}catch{/* next */}
  }
  return null;
}

const result:Record<string,unknown>={date,articlesDay:day,collectedAt:new Date().toISOString()};

// 1) Blog page views.
try{
  const id=env('BLOGGER_BLOG_ID'),cid=env('BLOGGER_CLIENT_ID'),secret=env('BLOGGER_CLIENT_SECRET'),refresh=env('BLOGGER_REFRESH_TOKEN');
  if(!id||!cid||!secret||!refresh)throw new Error('NOT_CONFIGURED');
  const token=await googleToken(cid,secret,refresh);
  const response=await fetch(`https://www.googleapis.com/blogger/v3/blogs/${id}/pageviews?range=7DAYS&range=30DAYS&range=all`,{headers:{authorization:`Bearer ${token}`},signal:timeout(20000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const counts=(await response.json() as {counts?:Array<{timeRange?:string;count?:string}>}).counts??[],count=(range:string)=>Number(counts.find(item=>item.timeRange===range)?.count??NaN);
  const capturedAt=new Date().toISOString(),allTime=count('ALL_TIME'),prior=await previousCapture();
  result.pageviews={state:'PASS',capturedAt,allTime,sevenDays:count('SEVEN_DAYS'),thirtyDays:count('THIRTY_DAYS'),previous:prior,sincePrevious:prior?{views:allTime-prior.allTime,hours:Math.round((Date.parse(capturedAt)-Date.parse(prior.capturedAt))/360000)/10}:null};
}catch(error){result.pageviews={state:'UNAVAILABLE',reason:error instanceof Error?error.message:String(error)}}

// 2) Our articles of that KST day (public feed; published-min/max in KST).
interface Ours {title:string;url:string;labels:string[];publishedKst:string;features:ContentFeatures;keywords:string[];searchConsole?:unknown;datalab?:unknown;competitors?:unknown}
const ours:Ours[]=[];
try{
  const min=encodeURIComponent(`${day}T00:00:00+09:00`),max=encodeURIComponent(`${date}T00:00:00+09:00`);
  const response=await fetch(`${BLOG}/feeds/posts/default?alt=json&max-results=25&published-min=${min}&published-max=${max}`,{signal:timeout(20000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const feed=await response.json() as {feed?:{entry?:Array<{title?:{$t?:string};content?:{$t?:string};published?:{$t?:string};category?:Array<{term?:string}>;link?:Array<{rel?:string;href?:string}>}>}};
  for(const entry of feed.feed?.entry??[]){
    const title=entry.title?.$t??'',labels=(entry.category??[]).map(item=>item.term??'').filter(Boolean),url=entry.link?.find(item=>item.rel==='alternate')?.href??'';
    const published=entry.published?.$t??'';
    ours.push({title,url,labels,publishedKst:published?new Date(Date.parse(published)+9*3600000).toISOString().slice(0,16).replace('T',' '):'',features:contentFeatures(entry.content?.$t??''),keywords:articleKeywords(title,labels)});
  }
  result.articles={state:'PASS',count:ours.length};
}catch(error){result.articles={state:'UNAVAILABLE',reason:error instanceof Error?error.message:String(error)}}

// 3) Search Console per page (data usually lags 2-3 days; the last 7 days by page and date are kept).
//    pages: per-page totals of all rows, ?m=1/http merged (MOT-050, MO-5); article rows match on the same key.
try{
  const property=env('GOOGLE_SEARCH_CONSOLE_PROPERTY'),cid=env('SEARCH_CONSOLE_CLIENT_ID'),secret=env('SEARCH_CONSOLE_CLIENT_SECRET'),refresh=env('SEARCH_CONSOLE_REFRESH_TOKEN');
  if(!property||!cid||!secret||!refresh)throw new Error('NOT_CONNECTED');
  const token=await googleToken(cid,secret,refresh),start=new Date(Date.parse(date+'T00:00:00Z')-8*86400000).toISOString().slice(0,10);
  const query=async(dimensions:string[])=>{const response=await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({startDate:start,endDate:date,dimensions,rowLimit:250,dataState:'all'}),signal:timeout(30000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);return (await response.json() as {rows?:Array<{keys?:string[];clicks?:number;impressions?:number;ctr?:number;position?:number}>}).rows??[]};
  const byPage=await query(['page','date']),byQuery=await query(['query']);
  for(const article of ours)article.searchConsole=byPage.filter(row=>normalizeBlogUrl(row.keys?.[0]??'')===normalizeBlogUrl(article.url)).map(row=>({date:row.keys?.[1],clicks:row.clicks,impressions:row.impressions,ctr:row.ctr,position:row.position}));
  result.searchConsole={state:byPage.length||byQuery.length?'PASS':'NO_DATA',range:[start,date],dataState:'all',lastDataDate:byPage.map(row=>row.keys?.[1]??'').sort().at(-1)??null,pageRows:byPage.length,pages:searchConsolePages(byPage),topQueries:byQuery.sort((a,b)=>(b.impressions??0)-(a.impressions??0)).slice(0,20)};
}catch(error){result.searchConsole={state:'UNAVAILABLE',reason:error instanceof Error?error.message:String(error)}}

// 3b) Index status (owner 2026-11-05: "구글검색 노출이 전혀 안 되는 것은 반드시 보완"): submitted sitemaps and the
const INDEX_FIXED_SAMPLE=['/','/2026/11/3-70.html','/2026/11/062-5683-1-09.html','/2026/11/amd-37-ai.html','/2026/11/359-5648-1-31.html','/2026/11/3-58.html','/2026/11/20-33.html'];
const DESKTOP_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const GOOGLEBOT_SMARTPHONE_UA='Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
// URL Inspection verdict (indexed or not, why, last crawl) for the home page, the day's articles and recent posts.
try{
  const property=env('GOOGLE_SEARCH_CONSOLE_PROPERTY'),cid=env('SEARCH_CONSOLE_CLIENT_ID'),secret=env('SEARCH_CONSOLE_CLIENT_SECRET'),refresh=env('SEARCH_CONSOLE_REFRESH_TOKEN');
  if(!property||!cid||!secret||!refresh)throw new Error('NOT_CONNECTED');
  const token=await googleToken(cid,secret,refresh),auth={authorization:`Bearer ${token}`};
  const sitemapsResponse=await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps`,{headers:auth,signal:timeout(20000)});
  const sitemaps=sitemapsResponse.ok?((await sitemapsResponse.json() as {sitemap?:Array<Record<string,unknown>>}).sitemap??[]).map(item=>({path:item.path,lastSubmitted:item.lastSubmitted,lastDownloaded:item.lastDownloaded,isPending:item.isPending,errors:item.errors,warnings:item.warnings,contents:item.contents})):{error:`HTTP ${sitemapsResponse.status}`};
  let recent:string[]=[];
  try{const feed=await fetch(`${BLOG}/feeds/posts/summary?alt=json&max-results=50`,{signal:timeout(20000)});recent=((await feed.json() as {feed?:{entry?:Array<{link?:Array<{rel?:string;href?:string}>}>}}).feed?.entry??[]).map(entry=>entry.link?.find(link=>link.rel==='alternate')?.href??'').filter(Boolean)}catch{/* optional */}
  // Fixed sample (루인 review 2026-11-08, MOT-035): the same URLs every day, so the redirect-error fix is judged on a
  // stable before/after set: the five REDIRECT_ERROR posts, the home page and one post that was indexed.
  const fixed=INDEX_FIXED_SAMPLE.map(path=>BLOG+path);
  // MO-13 (MOT-053): URLs indexed in a capture of the last 14 days stay in the sample even after the newest-50 feed
  // window moves past them, so a lower indexed count is a real change, not a sample change.
  const priors:PriorCapture[]=[];
  try{const base=join(process.cwd(),'data','traffic');if(existsSync(base))for(const folder of (await readdir(base)).filter(name=>/^\d{4}-\d{2}-\d{2}$/.test(name)&&name<date)){try{priors.push({date:folder,input:JSON.parse(await readFile(join(base,folder,'traffic-input.json'),'utf8'))})}catch{/* missing or unreadable capture */}}}catch{/* optional */}
  const carried=carriedIndexedUrls(date,priors);
  const order=inspectionUrlOrder({fixed,articles:ours.map(article=>article.url),carried:carried.map(item=>item.url),recent},60),urls=order.map(item=>item.url),sourceOf=new Map(order.map(item=>[item.url,item.source])),inspections:Array<Record<string,unknown>>=[];
  const inspectDeadline=Date.now()+6*60000;
  for(const url of urls){
    if(Date.now()>inspectDeadline){inspections.push({url,source:sourceOf.get(url),error:'SKIPPED_TIME_BUDGET'});continue}
    // MOT-043: one slow inspection (11/11 timeout) must not discard every other result; it is recorded per URL.
    const response=await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({inspectionUrl:url,siteUrl:property,languageCode:'ko'}),signal:timeout(30000)}).catch((error:unknown)=>error instanceof Error?error:new Error(String(error)));
    if(response instanceof Error){inspections.push({url,source:sourceOf.get(url),error:response.message.slice(0,160)});continue}
    if(!response.ok){inspections.push({url,source:sourceOf.get(url),error:`HTTP ${response.status}: ${(await response.text()).slice(0,160)}`});continue}
    const index=(await response.json() as {inspectionResult?:{indexStatusResult?:Record<string,unknown>}}).inspectionResult?.indexStatusResult??{};
    inspections.push({url,source:sourceOf.get(url),verdict:index.verdict,coverageState:index.coverageState,robotsTxtState:index.robotsTxtState,indexingState:index.indexingState,pageFetchState:index.pageFetchState,lastCrawlTime:index.lastCrawlTime,googleCanonical:index.googleCanonical,userCanonical:index.userCanonical,sitemap:index.sitemap,referringUrls:index.referringUrls});
  }
  const indexed=inspections.filter(item=>'verdict' in item&&item.verdict==='PASS').length;
  // Redirect chain of each fixed URL as a desktop browser and as Googlebot smartphone (public pages, read-only).
  const chains=[];
  for(const url of fixed)for(const [agent,ua] of [['desktop',DESKTOP_UA],['googlebot-smartphone',GOOGLEBOT_SMARTPHONE_UA]] as const){
    try{const hops:Array<{status:number;location:string|null}>=[];let next=url;
      for(let i=0;i<5;i++){const response=await fetch(next,{redirect:'manual',headers:{'user-agent':ua},signal:timeout(20000)});const location=response.headers.get('location');hops.push({status:response.status,location});
        if(response.status>=300&&response.status<400&&location){next=new URL(location,next).href;continue}
        const html=response.status===200?await response.text():'';chains.push({url,agent,hops,finalUrl:next,canonical:html.match(/<link[^>]+rel=['"]canonical['"][^>]*href=['"]([^'"]+)/i)?.[1]??null});break}
    }catch(error){chains.push({url,agent,error:error instanceof Error?error.message:String(error)})}
  }
  // MO-9: a sitemap Google has not downloaded for 48 hours is flagged here and in the daily status.
  const freshness=sitemapFreshness(sitemaps,new Date().toISOString());
  if(freshness.state==='STALE')console.log(`::warning title=Sitemap not downloaded for ${freshness.hours}h::last download ${freshness.lastDownloaded} (limit ${freshness.maxHours}h)`);
  result.indexStatus={state:'PASS',sitemaps,sitemapFreshness:freshness,inspected:inspections.length,indexed,carriedIndexed:{count:carried.length,inspected:order.filter(item=>item.source==='carried').length,urls:carried},inspections,fixedSample:{paths:INDEX_FIXED_SAMPLE,chains}};
}catch(error){result.indexStatus={state:'UNAVAILABLE',reason:error instanceof Error?error.message:String(error)}}

// 4) Naver DataLab interest (relative, last 14 days) for each article's keywords.
try{
  const cid=env('NAVER_DATALAB_CLIENT_ID'),secret=env('NAVER_DATALAB_CLIENT_SECRET');if(!cid||!secret)throw new Error('NOT_CONFIGURED');
  const start=new Date(Date.parse(date+'T00:00:00Z')-14*86400000).toISOString().slice(0,10);
  const datalab=async(keywords:string[]):Promise<DatalabSeries[]|{error:string}>=>{
    const response=await fetch('https://naverapihub.apigw.ntruss.com/search-trend/v1/search',{method:'POST',headers:{'content-type':'application/json','X-NCP-APIGW-API-KEY-ID':cid,'X-NCP-APIGW-API-KEY':secret},body:JSON.stringify({startDate:start,endDate:day,timeUnit:'date',keywordGroups:keywords.map(keyword=>({groupName:keyword,keywords:[keyword]}))}),signal:timeout(20000)});
    return response.ok?((await response.json() as {results?:Array<{title?:string;data?:Array<{period?:string;ratio?:number}>}>}).results??[]).map(item=>({keyword:String(item.title),series:(item.data??[]).map(point=>[String(point.period),Number(point.ratio)] as [string,number])})):{error:`HTTP ${response.status}`};
  };
  for(const article of ours){
    const keywords=article.keywords.slice(0,5);if(!keywords.length)continue;
    const first=await datalab(keywords);
    // An empty series means too little volume for that phrase: retry with shorter fallbacks (MOT-045, ledger MO-7).
    article.datalab=Array.isArray(first)?await fillEmptyDatalabSeries(first,articleKeywordFallbacks(article.title,article.labels),async next=>{const reply=await datalab(next);return Array.isArray(reply)?reply:[]}):first;
  }
  result.datalab={state:'PASS'};
}catch(error){result.datalab={state:'UNAVAILABLE',reason:error instanceof Error?error.message:String(error)}}

// 5) Naver blog search: top posts per keyword, with the same content features for the first five.
try{
  const cid=env('NAVER_SEARCH_CLIENT_ID'),secret=env('NAVER_SEARCH_CLIENT_SECRET');if(!cid||!secret)throw new Error('NOT_CONFIGURED (NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET)');
  const cache=new Map<string,unknown>();
  for(const article of ours){
    const lists=[];
    for(const keyword of article.keywords.slice(0,2)){
      if(!cache.has(keyword)){
        const response=await fetch(`https://naverapihub.apigw.ntruss.com/search/v1/blog?query=${encodeURIComponent(keyword)}&display=10&sort=sim`,{headers:{'X-NCP-APIGW-API-KEY-ID':cid,'X-NCP-APIGW-API-KEY':secret},signal:timeout(20000)});
        if(!response.ok){cache.set(keyword,{keyword,error:`HTTP ${response.status}: ${(await response.text()).slice(0,160)}`});continue}
        const items=((await response.json() as {total?:number;items?:Array<{title?:string;link?:string;bloggername?:string;bloggerlink?:string;postdate?:string;description?:string}>}).items??[]).map((item,index)=>({rank:index+1,title:(item.title??'').replace(/<[^>]+>/g,''),link:item.link,blogger:item.bloggername,bloggerLink:item.bloggerlink,postdate:item.postdate,description:(item.description??'').replace(/<[^>]+>/g,'').slice(0,200)}));
        const detailed=[];
        for(const item of items){
          if(detailed.length>=5)break;
          try{const link=String(item.link).replace('://blog.naver.com','://m.blog.naver.com');const page=await fetch(link,{headers:{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'},signal:timeout(15000)});const html=await page.text();const body=html.match(/<div class="se-main-container"[\s\S]*?(?=<div class="(?:post_footer|se-viewer-footer)|<\/body>)/)?.[0]??html;detailed.push({...item,features:page.ok?contentFeatures(body):null})}catch{detailed.push({...item,features:null})}
        }
        cache.set(keyword,{keyword,top:[...detailed,...items.slice(detailed.length)]});
      }
      lists.push(cache.get(keyword));
    }
    article.competitors=lists;
  }
  result.naverBlogSearch={state:'PASS'};
}catch(error){result.naverBlogSearch={state:'UNAVAILABLE',reason:error instanceof Error?error.message:String(error)}}

result.ourArticles=ours;
await mkdir(root,{recursive:true});
await writeFile(join(root,'traffic-input.json'),JSON.stringify(result,null,2),'utf8');
console.log(JSON.stringify({date,articlesDay:day,articles:ours.length,pageviews:(result.pageviews as {state:string}).state,searchConsole:(result.searchConsole as {state:string}).state,indexStatus:(({state,indexed,inspected})=>({state,indexed,inspected}))(result.indexStatus as {state:string;indexed?:number;inspected?:number}),datalab:(result.datalab as {state:string}).state,naverBlogSearch:(result.naverBlogSearch as {state:string}).state}));
