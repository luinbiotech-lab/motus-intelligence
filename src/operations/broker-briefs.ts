/**
 * Korean broker research intake from Hankyung Consensus (consensus.hankyung.com), a public aggregator of
 * broker reports. Daily market briefs, company, industry and economy reports are listed with title, broker,
 * analyst, date, and (for companies) the published target price and rating; each report is a public PDF.
 *
 * Content rules:
 * - Only statements printed by the broker are used, quoted verbatim and attributed (broker, analyst/team, date,
 *   report title, PDF link). Nothing is paraphrased, translated, or invented, and no rating/target is inferred.
 * - A brief's market commentary is used only for the session it describes: the first brief date after the
 *   session, and a Korean brief whose KOSPI level contradicts the verified close is discarded.
 * - Only single-line printed bullets are quoted, so PDF line wrapping can never corrupt a quotation.
 */
import {execFile} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export type BrokerReportKind='MARKET'|'COMPANY'|'INDUSTRY'|'ECONOMY';
export interface BrokerReport {kind:BrokerReportKind;date:string;title:string;broker:string;analysts:string;url:string;summary:string[];targetPrice:string|null;rating:string|null;stockCode:string|null;company:string|null}
export interface BrokerStatement {region:'US'|'KOREA';text:string;heading:string|null}
export interface BrokerDigest {heading:string;bullets:string[];analyst:string|null}
export interface BrokerEvent {region:'US'|'KOREA';text:string}
export interface BrokerBrief {report:BrokerReport;statements:BrokerStatement[];digests:BrokerDigest[];events?:BrokerEvent[]}
export interface BrokerAudit {sourceId:string;url:string;status:'PASS'|'FAILED';count:number;error:string|null}
export interface BrokerResearchBundle {briefs:BrokerBrief[];company:BrokerReport[];industry:BrokerReport[];economy:BrokerReport[];audit:BrokerAudit[]}

export const CONSENSUS_HOST='https://consensus.hankyung.com';
const LIST:Record<BrokerReportKind,string>={MARKET:'skinType=market&report_type=MK',COMPANY:'skinType=business&report_type=CO',INDUSTRY:'skinType=industry&report_type=IN',ECONOMY:'report_type=EC'};
const UA='Mozilla/5.0 (compatible; MOTUS-ResearchCollector/1.0; +https://motusnova.blogspot.com)';

export function consensusListUrl(kind:BrokerReportKind,from:string,to:string):string {return `${CONSENSUS_HOST}/analysis/list?${LIST[kind]}&sdate=${from}&edate=${to}&now_page=1&pagenum=80`}
export function consensusPdfUrl(idx:string):string {return `${CONSENSUS_HOST}/analysis/downpdf?report_idx=${idx}`}

function clean(value:string):string {return value.replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()}
const BROKER=/(?:증권|투자증권|금융투자|은행|리서치|자산운용|Securities|SECURITIES)$/;
const RATING=/^(?:Strong Buy|Buy|BUY|Trading Buy|Outperform|Overweight|Marketperform|Hold|HOLD|Neutral|중립|매수|적극매수|비중확대|Not Rated|NR|Sell|매도|보유)(?:\s*\([^)]*\))?$/i;

/** Parses any Hankyung consensus list skin: columns are located by content rather than position. */
export function parseConsensusList(html:string,kind:BrokerReportKind):BrokerReport[] {
  const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match=>match[1]!);
  const reports:BrokerReport[]=[];
  for(const row of rows){
    const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match=>match[1]!);
    if(cells.length<4)continue;
    const date=clean(cells[0]!);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    const titleCell=cells.find(cell=>/report_idx=\d+/.test(cell)&&/layerPop|<strong>/.test(cell))??cells.find(cell=>/report_idx=\d+/.test(cell));if(!titleCell)continue;
    const idx=titleCell.match(/report_idx=(\d+)/)![1]!;
    const title=clean(titleCell.match(/<strong>([\s\S]*?)<\/strong>/)?.[1]??titleCell.replace(/<div class="layerPop">[\s\S]*$/,''));
    const summary=[...titleCell.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map(match=>clean(match[1]!)).filter(item=>item&&!title.includes(item)&&item.length>=8);
    const texts=cells.map(cell=>clean(cell.replace(/<div class="layerPop">[\s\S]*?<\/div>\s*<\/div>/g,'')));
    const brokerIndex=texts.findIndex((text,index)=>index>0&&BROKER.test(text));if(brokerIndex<0)continue;
    const broker=texts[brokerIndex]!,analysts=texts[brokerIndex-1]??'';
    const target=texts.find(text=>/^\d{1,3}(?:,\d{3})+$|^\d{4,}$/.test(text))??null,rating=texts.find(text=>RATING.test(text))??null;
    const company=title.match(/^(.+?)\((\d{6})\)/);
    reports.push({kind,date,title,broker,analysts:analysts&&!/^-$/.test(analysts)?analysts:'',url:consensusPdfUrl(idx),summary,targetPrice:target,rating,stockCode:company?.[2]??null,company:company?.[1]?.trim()??null});
  }
  return reports;
}

const MARKER=/^(?:[-•ㆍ·▪]\s*)(.+)$/;
const REGION_HEADING:[RegExp,'US'|'KOREA'|'OTHER'][]=[[/^(?:▶\s*)?(?:미국|미국증시|미국 증시|뉴욕|뉴욕증시|\[\s*미국증시\s*\]|\[\s*해외증시\s*\]|Global Market)$/,'US'],[/^(?:▶\s*)?(?:한국증시|국내|국내증시|한국|\[\s*국내증시\s*\]|\[\s*한국증시\s*\])$/,'KOREA'],[/^(?:▶\s*)?(?:중국|중국증시|유럽|유럽증시|일본|아시아|신흥국)$/i,'OTHER']];
const EVENT_HEADING=/Event|일정|캘린더|Calendar|Schedule/i;
const US_WORDS=/미국|뉴욕|美|미 증시|S&P|나스닥|다우|연준|FOMC|빅테크|필라델피아|월가|Fed/;
const KOREA_WORDS=/코스피|KOSPI|코스닥|KOSDAQ|국내 증시|국내증시|사이드카|외국인과 기관|유가증권시장/;
const ANALYST_LINE=/^([가-힣]{2,4}(?:[,·][가-힣]{2,4})*)\s*\.\s*\S+@\S+$/;
const CATEGORY_LINE=/^(?:[A-Za-z][A-Za-z &/]{2,30}|산업 및 종목 분석|기업분석|산업분석|투자전략|시황|경제|채권)$/;

function hangul(value:string){return (value.match(/[가-힣]/g)??[]).length}
function quotable(value:string){return value.length>=18&&value.length<=200&&hangul(value)>=8&&!/@|https?:|\.com\b/.test(value)&&(value.match(/\d/g)??[]).length<=value.length*0.3}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SENTENCE_END=/(?:다|함|음|임|됨|마감|전망|예상|지속|필요|유지|상승|하락|강세|약세|확대|축소|전환|발동|기록|주목|부각|반등|급등|급락|우려|기대|\)|%)\.?$/;

/** Extracts verbatim single-line bullets, region headlines and titled bullet digests from a broker brief's text. */
export function extractBriefContent(text:string):{statements:BrokerStatement[];digests:BrokerDigest[];events:BrokerEvent[]} {
  const lines=text.split(/\r?\n/).map(line=>line.replace(/\u00a0/g,' ').trim());
  const statements:BrokerStatement[]=[],digests:BrokerDigest[]=[],events:BrokerEvent[]=[];let eventMode=false;
  let region:'US'|'KOREA'|'OTHER'|null=null,pendingHeadline:'US'|'KOREA'|null=null,digest:BrokerDigest|null=null;
  const flush=()=>{if(digest&&digest.bullets.length)digests.push(digest);digest=null};
  const previousNonEmpty=(index:number)=>{for(let j=index-1;j>=0;j--)if(lines[j])return {line:lines[j]!,gap:j<index-1};return {line:'',gap:true}};
  for(let i=0;i<lines.length;i++){
    const line=lines[i]!;if(!line){if(eventMode&&!(lines[i+1]??'').match(MARKER))eventMode=false;continue}
    if(/^(?:▶|■)?\s*\S.*$/.test(line)&&EVENT_HEADING.test(line)&&line.length<=40&&!MARKER.test(line)){eventMode=true;region=null;pendingHeadline=null;flush();continue}
    const heading=REGION_HEADING.find(([pattern])=>pattern.test(line));
    if(heading){eventMode=false;region=heading[1];pendingHeadline=heading[1]==='OTHER'?null:heading[1];flush();continue}
    if(/^(?:▶|■)/.test(line)||/^\[[^\]]{1,24}\]$/.test(line)){eventMode=false;region=null;pendingHeadline=null;flush();continue}
    const analyst=line.match(ANALYST_LINE);
    if(analyst){eventMode=false;if(digest)digest.analyst=analyst[1]!;flush();continue}
    if(CATEGORY_LINE.test(line)){eventMode=false;flush();region=null;pendingHeadline=null;continue}
    const bullet=line.match(MARKER);
    if(bullet){
      pendingHeadline=null;
      const body=bullet[1]!.trim(),next=lines[i+1]??'';
      if(eventMode){const item=body.replace(/^(?:미|美)\s*-\s*/,'미국: ').replace(/^(?:한|국내)\s*-\s*/,'국내: ');if(item.length>=6&&item.length<=120&&hangul(item)>=2)events.push({region:/^미국:|美|미국|FOMC|연준/.test(item)?'US':'KOREA',text:item});continue}
      // A following unmarked prose line means the printed bullet wrapped; skip it rather than guess the join.
      // Any following unmarked Korean line may be the rest of this bullet; a plausible-looking ending never overrides that.
      const wrapped=Boolean(next)&&!MARKER.test(next)&&!ANALYST_LINE.test(next)&&!CATEGORY_LINE.test(next)&&!EVENT_HEADING.test(next)&&!/^(?:▶|■|\[)/.test(next)&&hangul(next)>=2&&!REGION_HEADING.some(([pattern])=>pattern.test(next));
      if(wrapped||!quotable(body)||region==='OTHER')continue;
      if(digest)digest.bullets.push(body);
      // Bullets inside a titled report digest count as market commentary only when the report itself is a market/rates piece.
      if(digest&&!/FOMC|연준|금리|증시|시황|전략|퀀틴전시|Strategy|코스피|KOSPI|美|미국|뉴욕/.test(digest.heading))continue;
      const classified=region??(KOREA_WORDS.test(body)&&!/미국|뉴욕|美/.test(body)?'KOREA':US_WORDS.test(body)&&!KOREA_WORDS.test(body)?'US':null);
      if(classified)statements.push({region:classified,text:body,heading:digest?.heading??null});
      continue;
    }
    if(pendingHeadline&&quotable(line)&&/(?:마감|상승|하락|강세|약세|반등|급등|급락|혼조|보합)$/.test(line)){statements.push({region:pendingHeadline,text:line,heading:null});pendingHeadline=null;continue}
    // A digest heading is a short title line that starts a block (after a blank, category, analyst or another block)
    // and is immediately followed by bullets; wrapped sentence fragments never qualify.
    const prior=previousNonEmpty(i),next=lines[i+1]??'';
    if(hangul(line)>=4&&line.length<=80&&MARKER.test(next)&&(prior.gap||ANALYST_LINE.test(prior.line)||CATEGORY_LINE.test(prior.line)||!prior.line)){eventMode=false;flush();digest={heading:line,bullets:[],analyst:null};region=region==='OTHER'?null:region;continue}
  }
  flush();
  return {statements:[...new Map(statements.map(item=>[item.region+item.text,item])).values()],digests,events:[...new Map(events.map(item=>[item.text,item])).values()]};
}

/** A Korea brief that prints a KOSPI level different from the verified close describes another session. */
export function contradictsKospi(statements:BrokerStatement[],verifiedClose:number):boolean {
  for(const item of statements.filter(entry=>entry.region==='KOREA'&&/코스피|KOSPI/i.test(entry.text))){
    // Only a level printed right after the KOSPI name is compared (a KOSDAQ level in the same bullet is not KOSPI).
    for(const mention of item.text.matchAll(/KOSPI|코스피/gi)){
      const rest=item.text.slice(mention.index!+mention[0].length),stop=rest.search(/KOSDAQ|코스닥|KOSPI|코스피/i),scope=(stop>=0?rest.slice(0,stop):rest).slice(0,60),match=scope.match(/(\d{1,2},\d{3}(?:\.\d+)?)/);if(!match)continue;
      const value=Number(match[1]!.replace(/,/g,''));if(value>1000&&Math.abs(value-verifiedClose)/verifiedClose>0.002)return true;
    }
  }
  return false;
}

export type PdfTextReader=(pdf:Buffer)=>Promise<string|null>;
export const pdftotextReader:PdfTextReader=async pdf=>{
  const dir=await mkdtemp(join(tmpdir(),'motus-pdf-'));
  try{
    const file=join(dir,'report.pdf');await writeFile(file,pdf);
    return await new Promise<string|null>(resolve=>execFile('pdftotext',['-l','3','-enc','UTF-8',file,'-'],{timeout:20000,maxBuffer:20*1024*1024},(error,stdout)=>resolve(error?null:String(stdout))));
  }finally{await rm(dir,{recursive:true,force:true})}
};

function addDays(date:string,days:number){return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)}

async function getText(fetcher:typeof fetch,url:string):Promise<string>{
  const response=await fetcher(url,{headers:{'user-agent':UA,accept:'text/html','accept-language':'ko-KR,ko;q=0.9',referer:CONSENSUS_HOST+'/analysis/list'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('CONSENSUS_HTTP_'+response.status);
  return await response.text();
}

/**
 * Collects broker research for one market session. `sessionDate` is the trading date the article covers;
 * briefs dated on the first available day after it carry that session's commentary.
 */
export async function collectBrokerResearch(input:{sessionDate:string;operationDate:string;fetcher?:typeof fetch;pdfText?:PdfTextReader;maxBriefs?:number;verifiedKospiClose?:number|null}):Promise<BrokerResearchBundle>{
  const fetcher=input.fetcher??fetch,pdfText=input.pdfText??pdftotextReader,audit:BrokerAudit[]=[];
  const from=addDays(input.sessionDate,-6),to=addDays(input.operationDate,1);
  const lists:Partial<Record<BrokerReportKind,BrokerReport[]>>={};
  for(const kind of ['MARKET','COMPANY','INDUSTRY','ECONOMY'] as BrokerReportKind[]){
    const url=consensusListUrl(kind,from,to);
    try{const reports=parseConsensusList(await getText(fetcher,url),kind).filter(item=>item.date<=input.operationDate);lists[kind]=reports;audit.push({sourceId:'consensus:list:'+kind.toLowerCase(),url,status:'PASS',count:reports.length,error:null})}
    catch(error){lists[kind]=[];audit.push({sourceId:'consensus:list:'+kind.toLowerCase(),url,status:'FAILED',count:0,error:error instanceof Error&&/^CONSENSUS_HTTP_\d{3}$/.test(error.message)?error.message:'CONSENSUS_FETCH_FAILED'})}
  }
  // Morning briefs published after the session describe it; take the earliest such date only.
  const market=(lists.MARKET??[]).filter(item=>item.date>input.sessionDate&&item.date<=addDays(input.sessionDate,5)&&/brief|daily|market|아침|모닝|morning|start|wake|view|데일리|시황/i.test(item.title));
  const briefDate=market.map(item=>item.date).sort()[0];
  const candidates=market.filter(item=>item.date===briefDate);
  const briefs:BrokerBrief[]=[];const seenBroker=new Set<string>();
  for(const report of candidates){
    if(briefs.length>=(input.maxBriefs??5))break;
    const key=report.broker+report.title.toLowerCase();if(seenBroker.has(key))continue;seenBroker.add(key);
    try{
      const response=await fetcher(report.url,{headers:{'user-agent':UA,referer:CONSENSUS_HOST+'/analysis/list'},signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw new Error('CONSENSUS_HTTP_'+response.status);
      const buffer=Buffer.from(await response.arrayBuffer());if(buffer.subarray(0,5).toString()!=='%PDF-')throw new Error('CONSENSUS_NOT_PDF');
      const text=await pdfText(buffer);if(!text)throw new Error('PDF_TEXT_UNAVAILABLE');
      const content=extractBriefContent(text);
      let statements=content.statements,digests=content.digests;
      const close=input.verifiedKospiClose;
      if(close){
        const asStatements=(digest:BrokerDigest)=>[digest.heading,...digest.bullets].map(text=>({region:'KOREA' as const,text,heading:null}));
        const mismatched=contradictsKospi(statements,close)||digests.some(digest=>contradictsKospi(asStatements(digest),close));
        // A brief describing another session must not contribute any Korean market commentary, in statements or digests.
        if(mismatched){statements=statements.filter(item=>item.region!=='KOREA');digests=digests.filter(digest=>!/코스피|KOSPI|코스닥|KOSDAQ|국내 증시|국내증시|시황|전략|퀀틴전시/i.test([digest.heading,...digest.bullets].join(' ')))}
      }
      briefs.push({report,statements,digests,events:content.events});
      audit.push({sourceId:'consensus:pdf:'+report.url.split('=').pop(),url:report.url,status:'PASS',count:statements.length+content.digests.length,error:null});
    }catch(error){audit.push({sourceId:'consensus:pdf:'+report.url.split('=').pop(),url:report.url,status:'FAILED',count:0,error:error instanceof Error&&/^(?:CONSENSUS_HTTP_\d{3}|CONSENSUS_NOT_PDF|PDF_TEXT_UNAVAILABLE)$/.test(error.message)?error.message:'CONSENSUS_PDF_FAILED'})}
  }
  const recent=(items:BrokerReport[]|undefined,days:number)=>(items??[]).filter(item=>item.date<=input.operationDate&&item.date>=addDays(input.sessionDate,-days));
  return {briefs,company:recent(lists.COMPANY,4),industry:recent(lists.INDUSTRY,4),economy:recent(lists.ECONOMY,6),audit};
}

export function koreanDateLabel(date:string):string {const [,month,day]=date.split('-');return `${Number(month)}월 ${Number(day)}일`}
export function analystLabel(report:BrokerReport):string {
  const names=report.analysts.trim();
  if(!names||/리서치센터|투자전략|팀|부$/.test(names))return `${report.broker}${names?' '+names:''}`;
  return `${report.broker} ${names.replace(/\s*,\s*/g,'·')} 연구원`;
}
