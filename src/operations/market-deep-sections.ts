/**
 * Composes the expert and search-ranked parts of the U.S. and Korea daily articles from collected evidence.
 * Every sentence either restates a verified number or quotes a named broker verbatim with its date and report;
 * nothing here invents a cause, a rating or a target.
 */
import {josa} from './ai-generic-synthesis.js';
import {analystLabel,koreanDateLabel,type BrokerBrief,type BrokerDigest,type BrokerReport,type BrokerResearchBundle} from './broker-briefs.js';
import {displayName,moveWord,signedPct,absPct,type KoreaSearchStock,type SectorMove,type USAttentionStock} from './market-attention.js';
import type {WireReport} from './market-wire.js';

import type {ArticleDeepParagraph,ArticleDeepSection,ArticleReportCard} from '../intelligence/daily-masters.js';
export type DeepParagraph=ArticleDeepParagraph;
export type DeepSection=ArticleDeepSection;
/** The card fields of a report, exactly as the broker published them. */
export const reportCard=(report:BrokerReport):ArticleReportCard=>({company:report.company,broker:report.broker,analysts:report.analysts,date:report.date,title:report.title,rating:report.rating,target:report.targetPrice});
export interface DeepComposition {sections:DeepSection[];leadAddition:string[];titleFocus:string|null;sources:Array<{label:string;url:string;publisher:string;date?:string}>;hasCoreCommentary?:boolean}

const quote=(value:string)=>`“${value.replace(/[“"]/g,'‘').replace(/[”]/g,'’').replace(/\s+/g,' ').trim().replace(/[.。]$/,'')}”`;
/** “…”라고 / “…”이라고 by the final syllable of the quotation. */
function said(quotes:string[]):string {const last=quotes.at(-1)??'',char=last.replace(/[”’\s]+$/,'').slice(-1),code=char.charCodeAt(0)-0xac00;const batchim=code>=0&&code<11172&&code%28!==0;return `${quotes.join(', ')}${batchim?'이라고':'라고'}`}
/** Statements that describe the market as a whole lead; side notes (FX, oil) follow. */
function marketScore(text:string){const digits=(text.match(/\d/g)??[]).length/Math.max(text.length,1);return (/마감|지수|증시|코스피|KOSPI|나스닥|S&P|다우|3대/.test(text)?2:0)+(/상승|하락|강세|약세|급등|급락|반등/.test(text)?1:0)+(/힘입|기대|영향|덕분|때문|배경|우려|부진|악화|쇼크|하회|상회|호실적|속에?\s|에\s?(?:상승|하락|급등|급락|강세|약세)/.test(text)?3:0)-(digits>0.12?3:0)}
const reportSource=(report:BrokerReport)=>({label:`${report.broker} ${report.title} (${koreanDateLabel(report.date)})`,url:report.url});
const sourceEntry=(report:BrokerReport)=>({label:`${report.broker} 「${report.title}」 (${report.date})`,url:report.url,publisher:report.broker,date:report.date});
function subject(report:BrokerReport):string {return josa(analystLabel(report),'은','는')}
function won(value:number){return new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(value)}
function usd(value:number){return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)}
function indexMove(value:number):string {const size=Math.abs(value);if(size<0.005)return '보합';if(value>0)return size>=2?'급등':'상승';return size>=2?'급락':'하락'}

/** A digest heading is a short title; a wrapped sentence fragment ('…상승한 반면 …에 급락') is not one. */
function plausibleHeading(heading:string):boolean {return heading.length<=40&&!/(?:상승|하락|급락|급등|마감|약세|강세)$/.test(heading.trim())&&!/반면|했지만|하며\s/.test(heading)}
function digestParagraph(digest:BrokerDigest,brief:BrokerBrief,limit=3):DeepParagraph {
  const who=digest.analyst?`${brief.report.broker} ${digest.analyst} 연구원`:analystLabel(brief.report);
  return {text:`${josa(who,'은','는')} 「${digest.heading.replace(/\s+/g,' ')}」에서 ${said(digest.bullets.slice(0,limit).map(quote))} 밝혔다.`,source:reportSource(brief.report)};
}

function ratingSentence(report:BrokerReport):string {
  const parts=[report.rating?`투자의견 ${report.rating}`:'',report.targetPrice?`목표주가 ${report.targetPrice}원`:''].filter(Boolean);
  const headline=report.company?report.title.replace(/^.+?\(\d{6}\)\s*/,''):report.title;
  return `${subject(report)} ${koreanDateLabel(report.date)} 「${headline}」 리포트에서 ${parts.length?parts.join(', ')+'을 제시했다':'관련 분석을 내놨다'}${report.summary.length?`. 요약: ${report.summary.slice(0,2).map(quote).join(', ')}`:''}.`;
}

// Theme names are neutral: keyword matches carry no direction, so a shared theme never turns concerns into optimism.
const THEMES:Array<[string,RegExp]>=[['반도체',/반도체|하이닉스|HBM|메모리|필라델피아/],['AI 투자',/AI|인공지능|빅테크/],['FOMC·통화정책',/FOMC|연준|금리|기준금리|Fed/],['기업 실적',/실적|어닝|영업이익/],['외국인·기관 수급',/외국인|기관|순매수|순매도|사이드카/],['환율·달러',/환율|달러/],['국제유가',/유가|원유/],['주주환원',/주주환원|배당|자사주/]];
const CAUSAL=/힘입|기대|우려|영향|때문|따른|따라|반영|부담|속에?\s|에\s?(?:상승|하락|급등|급락|강세|약세|반등)|실적|FOMC|연준|금리|동결|인상|인하|유가|달러|환율|수급|순매수|순매도|매수세|매도세|사이드카|발표|주주환원|정책|관세|지표|물가|고용|투자심리/;
const CAUTION=/우려|경계|부담|리스크|불확실|하락 전환|차익실현|관망|둔화|대기|엇갈|급락/;
type Pick={text:string;brief:BrokerBrief};
const KOREA_MARKET=/코스피|KOSPI|양대 지수|코스닥|KOSDAQ|국내 증시|국내증시|유가증권시장|외국인|기관|삼성전자|하이닉스|삼전/;
const OTHER_FOR_KOREA=/뉴욕|미 증시|미국 증시|나스닥|S&P|다우|알파벳|마이크로소프트|\bMS\b|아마존|엔비디아|애플|메타|테슬라|인텔|구글|오라클|Oracle|Vertiv|Microsoft|Alphabet|Amazon|Nvidia|Apple|Tesla|Intel|Broadcom|\b[A-Z]{2,5}\(\+|\b[A-Z]{2,5}\(-|\b[A-Z]{2,5}\(시외/;

/** Splits each broker's session commentary into drivers and cautions, one short quote per broker for each. */
function causes(briefs:BrokerBrief[],region:'US'|'KOREA'){
  const drivers:Pick[]=[],cautions:Pick[]=[];
  for(const brief of briefs){
    // A line under a regional heading can still be about the other market; it never explains this one.
    const items=brief.statements.filter(item=>item.region===region&&item.text.length<=130&&!(region==='KOREA'?OTHER_FOR_KOREA.test(item.text)&&!KOREA_MARKET.test(item.text):KOREA_MARKET.test(item.text)));
    // The best explanation of the session is the driver whatever its direction (a bearish close explained by
    // 'concerns' is still the explanation); a caution is a different statement that flags a risk.
    // Only a statement that gives a reason counts; a restatement of index moves explains nothing.
    const driver=[...items].filter(item=>CAUSAL.test(item.text)).sort((a,b)=>marketScore(b.text)-marketScore(a.text))[0];
    const caution=items.find(item=>item!==driver&&CAUTION.test(item.text));
    if(driver)drivers.push({text:driver.text,brief});if(caution)cautions.push({text:caution.text,brief});
  }
  return {drivers:drivers.slice(0,4),cautions:cautions.slice(0,2)};
}
/** Which themes several brokers name independently, and which only one broker names. */
function consensus(picks:Pick[],allStatements:Array<{text:string;brief:BrokerBrief}>):string|null{
  const brokers=[...new Set(allStatements.map(item=>item.brief.report.broker))];
  if(!picks.length||brokers.length<2)return null;
  const themesOf=(broker:string)=>THEMES.filter(([,pattern])=>allStatements.some(item=>item.brief.report.broker===broker&&pattern.test(item.text))).map(([label])=>label);
  const shared=THEMES.map(([label,pattern])=>({label,names:brokers.filter(broker=>allStatements.some(item=>item.brief.report.broker===broker&&pattern.test(item.text)))})).filter(item=>item.names.length>=2).sort((a,b)=>b.names.length-a.names.length);
  if(shared.length){
    const top=shared.slice(0,2),covered=new Set(top.flatMap(item=>item.names)),outliers=brokers.filter(broker=>!covered.has(broker)&&themesOf(broker).length);
    const tail=outliers.length?` ${outliers.map(broker=>`${josa(broker,'은','는')} ${themesOf(broker).slice(0,2).join('·')}${josa(themesOf(broker).slice(0,2).join('·'),'을','를').slice(-1)}`).join(', ')} 따로 짚었다.`:'';
    return `증권사 ${brokers.length}곳의 리포트를 대조하면 ${top.map(item=>`${item.label}(${item.names.join('·')})`).join(', ')}${josa(top.at(-1)!.label,'이','가').slice(-1)} 공통으로 꼽힌 배경이다.${tail}`;
  }
  const views=brokers.map(broker=>({broker,themes:themesOf(broker)})).filter(item=>item.themes.length);
  if(views.length<2)return null;
  return `증권사들이 강조한 배경은 엇갈렸다. ${views.map(item=>`${josa(item.broker,'은','는')} ${item.themes.slice(0,2).join('·')}`).join(', ')}에 무게를 뒀다.`;
}
/**
 * Whether the broker briefs explain the session (a driver statement exists). A brief can carry statements for a
 * region without any driver; the wire fallback must then still be fetched, or the run holds with no core commentary.
 */
export function hasBrokerCause(briefs:BrokerBrief[],region:'US'|'KOREA'):boolean {return causeParagraphs(briefs,region).first!==null}

function causeParagraphs(briefs:BrokerBrief[],region:'US'|'KOREA'):{paragraphs:DeepParagraph[];first:Pick|null}{
  const {drivers,cautions}=causes(briefs,region),all=briefs.flatMap(brief=>brief.statements.filter(item=>item.region===region).map(item=>({text:item.text,brief})));
  const paragraphs:DeepParagraph[]=[];const summary=consensus(drivers,all);if(summary)paragraphs.push({text:'MOTUS 정리: '+summary});
  for(const pick of drivers)paragraphs.push({text:`${subject(pick.brief.report)} ${koreanDateLabel(pick.brief.report.date)} ${/마감|레이더/.test(pick.brief.report.title)?'마감 코멘트':'아침 리포트'} 「${pick.brief.report.title}」에서 ${said([quote(pick.text)])} 진단했다.`,source:reportSource(pick.brief.report)});
  for(const pick of cautions)paragraphs.push({text:`경계 요인도 제시됐다. ${subject(pick.brief.report)} ${said([quote(pick.text)])} 짚었다.`,source:reportSource(pick.brief.report)});
  return {paragraphs,first:[...drivers].sort((a,b)=>marketScore(b.text)-marketScore(a.text))[0]??null};
}
const kstDay=(iso:string)=>new Date(Date.parse(iso)+9*3600000).toISOString().slice(0,10);
/** Wire edition tags such as (종합) are not part of what the report says. */
const wireHeadline=(title:string)=>title.replace(/\s*\((?:종합|\d+보)[^)]*\)\s*$/,'').trim();
const wireSource=(report:WireReport)=>({label:`${report.publisher} 「${report.title}」 (${koreanDateLabel(kstDay(report.publishedAt))})`,url:report.url,kind:'article' as const});
/** Fallback core commentary: news-wire close reports, quoted with publisher and date, used only when no broker brief explains the session. */
function wireCause(reports:WireReport[],key:string,sources:DeepComposition['sources']):{section:DeepSection;lead:string}|null{
  if(!reports.length)return null;
  const paragraphs:DeepParagraph[]=reports.map(report=>({text:report.sentence?`${josa(report.publisher,'은','는')} ${koreanDateLabel(kstDay(report.publishedAt))} 마감 기사 「${report.title}」에서 ${said([quote(report.sentence)])} 전했다.`:`${josa(report.publisher,'은','는')} ${koreanDateLabel(kstDay(report.publishedAt))} 마감 기사에서 ${said([quote(wireHeadline(report.title))])} 전했다.`,source:wireSource(report)}));
  for(const report of reports)sources.push({label:`${report.publisher} 「${report.title}」 (${kstDay(report.publishedAt)})`,url:report.url,publisher:report.publisher,date:kstDay(report.publishedAt)});
  const first=reports[0]!;
  return {section:{key,placement:'early',role:'news',title:'상승·하락 요인',intro:'이 세션을 다룬 증권사 아침 리포트가 아직 없어 통신사 마감 기사를 인용했다.',paragraphs},lead:`${josa(first.publisher,'은','는')} 이날 장을 ${said([quote(first.sentence??wireHeadline(first.title))])} 전했다.`};
}

function riskParagraphs(briefs:BrokerBrief[],region:'US'|'KOREA',checkpoint:string):DeepParagraph[]{
  const events=[...new Map(briefs.flatMap(brief=>(brief.events??[]).filter(item=>item.region===region).map(item=>[item.text,{item,brief}]))).values()].slice(0,4);
  const paragraphs:DeepParagraph[]=events.map(({item,brief})=>({text:`예정 일정(${brief.report.broker} 집계): ${item.text}`,source:reportSource(brief.report)}));
  paragraphs.push({text:checkpoint});
  return paragraphs;
}

/**
 * MOTUS's own reading of a ranking, built only from the verified closes printed in the same section:
 * breadth, the strongest and weakest names, and how many beat the index. It explains nothing it cannot count.
 */
function breadthParagraph(rows:Array<{label:string;changePct:number}>,universe:string,index:{label:string;changePct:number|null}|null):DeepParagraph|null{
  if(rows.length<3)return null;
  const up=rows.filter(item=>item.changePct>0.005).length,down=rows.filter(item=>item.changePct< -0.005).length;
  const sorted=[...rows].sort((a,b)=>b.changePct-a.changePct),best=sorted[0]!,worst=sorted.at(-1)!;
  const flat=rows.length-up-down;
  let text=`MOTUS 정리: ${universe} ${rows.length}종목 가운데 ${up}종목이 오르고 ${down}종목이 내렸다${flat?`(보합 ${flat}종목)`:''}. 가장 강한 종목은 ${best.label}(${signedPct(best.changePct)}), 가장 약한 종목은 ${worst.label}(${signedPct(worst.changePct)})로 등락 폭 차이가 ${Math.abs(best.changePct-worst.changePct).toFixed(2)}%p였다.`;
  if(index&&index.changePct!==null&&Number.isFinite(index.changePct)){
    const beat=rows.filter(item=>item.changePct>index.changePct!);
    text+=` 같은 날 ${index.label}는 ${signedPct(index.changePct)}였고, ${index.label}보다 강했던 종목은 ${beat.length}종목${beat.length&&beat.length<=4?`(${beat.map(item=>item.label).join('·')})`:''}이다.`;
  }
  return {text};
}
/** Names that moved 5% or more are a concrete next check; the threshold matches the '급등·급락' wording. */
function volatilityWatch(rows:Array<{label:string;changePct:number}>,scope:string):DeepParagraph|null{
  const big=[...rows].filter(item=>Math.abs(item.changePct)>=5).sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct)).slice(0,4);
  if(!big.length)return null;
  return {text:`변동성 점검: ${scope} 가운데 5% 넘게 움직인 ${big.map(item=>`${item.label}(${signedPct(item.changePct)})`).join('·')}${josa(big.at(-1)!.label,'은','는').slice(-1)} 등락이 이어지는지가 함께 확인 대상이다.`};
}

export function composeUSDeepSections(input:{bundle:BrokerResearchBundle|null;stocks:USAttentionStock[];sectors:SectorMove[];checkpoint?:string;wire?:WireReport[]}):DeepComposition {
  const sections:DeepSection[]=[],sources:DeepComposition['sources']=[],leadAddition:string[]=[];
  const briefs=input.bundle?.briefs??[];
  const cause=causeParagraphs(briefs,'US');
  const wire=cause.first?null:wireCause(input.wire??[],'us-causes',sources);
  if(cause.first){
    sections.push({key:'us-causes',placement:'early',role:'broker',title:'상승·하락 요인과 반대 시각',paragraphs:cause.paragraphs});
  }else if(wire){sections.push(wire.section)}
  // Big moves among the largest companies lead (largest first), then the most-searched names.
  const big=[...input.stocks].filter(stock=>stock.bigMover||stock.inNews).sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct)).slice(0,3);
  const ranked=[...big,...[...input.stocks].filter(stock=>!big.includes(stock)).sort((a,b)=>(a.trendingRank??99)-(b.trendingRank??99)||(a.mostActiveRank??99)-(b.mostActiveRank??99))].slice(0,6);
  let titleFocus:string|null=null;const market:DeepParagraph[]=[];
  if(input.sectors.length>=6){
    const best=input.sectors[0]!,worst=input.sectors.at(-1)!,up=input.sectors.filter(item=>item.changePct>0.005).length;
    const scope=input.sectors.length===11?'11종':`11종 중 종가가 확인된 ${input.sectors.length}종`;
    market.push({text:`S&P 500 업종을 추종하는 SPDR 업종 ETF ${scope} 가운데 ${up}종이 올랐다. ${best.label}(${best.symbol}) ${signedPct(best.changePct)}가 가장 강했고 ${worst.label}(${worst.symbol}) ${signedPct(worst.changePct)}가 가장 약했다${input.sectors.length===11?'':'(확인된 업종 기준)'}. 업종별 등락: ${input.sectors.map(item=>`${item.label} ${signedPct(item.changePct)}`).join(', ')}.`});
  }
  if(ranked.length){
    // The cause section's quotes are not repeated under a stock either.
    const usedTexts=new Set<string>(),causeText=cause.paragraphs.map(p=>p.text).join('\n');
    const mentions=(stock:USAttentionStock)=>{
      // A ticker counts only as a whole token (C must not match the C in FOMC); a Korean company name counts as written.
      const ticker=stock.symbol.length>=2?new RegExp(`(?<![A-Za-z])${stock.symbol.replace(/[.^$*+?()[\]{}|\\]/g,'\\$&')}(?![A-Za-z])`):null;
      // A broker sentence explains one stock only; a sentence already used for another stock is not repeated.
      const found=briefs.flatMap(brief=>brief.statements.filter(item=>item.region==='US'&&!usedTexts.has(item.text)&&!causeText.includes(item.text.replace(/\s+/g,' ').trim().slice(0,30))&&(Boolean(stock.koreanName&&stock.koreanName.length>=2&&item.text.includes(stock.koreanName))||Boolean(ticker?.test(item.text)))).map(item=>({item,brief})))[0];
      if(found)usedTexts.add(found.item.text);
      return found;
    };
    for(const stock of ranked){
      const name=displayName(stock),particle=josa(name,'은','는').slice(name.length),linked=mentions(stock);
      const rank=[stock.inNews?'리포트·기사 언급 종목':'',stock.bigMover?'시가총액 상위 종목':'',stock.trendingRank?`야후 파이낸스 검색 ${stock.trendingRank}위`:'',stock.mostActiveRank?`대형주 거래량 ${stock.mostActiveRank}위`:''].filter(Boolean).join(', ');
      market.push({text:`${name}(${stock.symbol})${particle} ${usd(stock.close)}달러로 ${absPct(stock.changePct)} ${moveWord(stock.changePct)}했다${rank?`(${rank})`:''}.${linked?` ${josa(linked.brief.report.broker,'은','는')} ${said([quote(linked.item.text)])} 설명했다.`:''}`,...(linked?{source:reportSource(linked.brief.report)}:{})});
    }
    // Titles use Korean company names only (the headline policy holds English names in titles).
    // The headline names the day's biggest megacap move when there is one, else the first searched name that moved 3%+.
    const named=ranked.filter(stock=>stock.koreanName),focus=[...named].filter(stock=>stock.bigMover||stock.inNews).sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct))[0]??named.find(stock=>Math.abs(stock.changePct)>=3)??named[0];
    if(focus)titleFocus=`${displayName(focus)} ${Math.abs(focus.changePct).toFixed(Math.abs(focus.changePct)>=10?0:1)}% ${moveWord(focus.changePct)}`;
  }
  if(market.length)sections.push({key:'us-sectors-stocks',placement:'early',role:'data',...(input.sectors.length>=6?{bars:input.sectors.map(item=>({label:item.label,value:item.changePct}))}:{}),title:'업종과 종목',intro:'종목 순위는 투자자 관심도를 보여 줄 뿐 주가 변동의 원인을 뜻하지 않는다. 등락은 해당 거래일 종가 기준이다.',paragraphs:market});
  const rateDigests=briefs.flatMap(brief=>brief.digests.filter(item=>/FOMC|연준|Fed|美|미국|달러/.test(item.heading)&&!/프랑스|유럽|ECB|중국|일본|독일|영국|국고채|코스피|KOSPI|하이닉스|퀀틴전시|국내/.test(item.heading)).map(item=>({item,brief}))).slice(0,2);
  // A report is cited for what it says; a title alone ('관련 분석을 내놨다') is not analysis.
  const economy=(input.bundle?.economy??[]).filter(item=>/FOMC|연준|금리|미국|美|달러|물가|고용|Fed|GDP/.test(item.title)&&item.summary.length).slice(0,3);
  if(rateDigests.length||economy.length)sections.push({key:'us-broker-analysis',placement:'late',role:'broker',title:'증권사별 분석: 금리와 통화정책',paragraphs:[...rateDigests.map(({item,brief})=>digestParagraph(item,brief)),...economy.map(report=>({text:ratingSentence(report),source:reportSource(report),report:reportCard(report)}))]});
  if(input.checkpoint&&sections.length){
    const watch=volatilityWatch(ranked.map(stock=>({label:displayName(stock),changePct:stock.changePct})),'직전 정규장 관심 종목');
    sections.push({key:'us-risks',placement:'risks',role:'watch',title:'위험 요인과 다음 확인 지표',paragraphs:[...riskParagraphs(briefs,'US',input.checkpoint),...(watch?[watch]:[])]});
  }
  const used=new Set(sections.flatMap(section=>section.paragraphs.map(p=>p.source?.url).filter(Boolean)));
  for(const report of [...briefs.map(item=>item.report),...economy])if(used.has(report.url))sources.push(sourceEntry(report));
  return {sections,leadAddition,titleFocus,sources:[...new Map(sources.map(item=>[item.url,item])).values()],hasCoreCommentary:Boolean(cause.first||wire)};
}

export function composeKoreaDeepSections(input:{bundle:BrokerResearchBundle|null;searchTop:KoreaSearchStock[];checkpoint?:string;wire?:WireReport[];kospiChangePct?:number|null}):DeepComposition {
  const sections:DeepSection[]=[],sources:DeepComposition['sources']=[],leadAddition:string[]=[];
  const briefs=input.bundle?.briefs??[],companyReports=input.bundle?.company??[];
  const cause=causeParagraphs(briefs,'KOREA');
  const wire=cause.first?null:wireCause(input.wire??[],'korea-causes',sources);
  if(cause.first){
    sections.push({key:'korea-causes',placement:'early',role:'broker',title:'상승·하락 요인과 반대 시각',paragraphs:cause.paragraphs});
  }else if(wire){sections.push(wire.section)}
  const digests=briefs.flatMap(brief=>brief.digests.filter(item=>plausibleHeading(item.heading)).map(item=>({item,brief})));
  const companyDigest=(name:string)=>digests.find(({item})=>item.heading.replace(/\s+/g,'').includes(name.replace(/\s+/g,'')));
  let titleFocus:string|null=null;
  if(input.searchTop.length){
    // Why the stock moved: a broker comment on the session that names it, quoted with the broker; then the latest rating.
    // The name must stand on its own: 'SK' does not match 'SK하이닉스', '현대차' does not match '현대차증권'.
    const named=(text:string,name:string)=>new RegExp(`(?<![가-힣A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![가-힣A-Za-z0-9&])|(?<![가-힣A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?=[은는이가을를의와과도에])`).test(text);
    const why=(name:string)=>briefs.flatMap(brief=>brief.statements.filter(item=>item.region==='KOREA'&&item.text.length<=200&&named(item.text,name)).map(item=>({item,brief})))[0];
    // One link per paragraph: the move with its reason (broker comment) and the rating (company report) are cited separately.
    const kospi=typeof input.kospiChangePct==='number'&&Number.isFinite(input.kospiChangePct)?input.kospiChangePct:null;
    const vsKospi=(value:number)=>kospi===null?'':`(코스피 대비 ${value-kospi>=0?'+':'-'}${Math.abs(value-kospi).toFixed(2)}%p)`;
    // 2026-11-11 owner: one-line number paragraphs read as an empty article. A stock with neither a broker comment
    // nor a report is no longer printed alone; such stocks are read together in one MOTUS paragraph below.
    const bare:KoreaSearchStock[]=[];
    const paragraphs:DeepParagraph[]=input.searchTop.flatMap(stock=>{
      const report=companyReports.find(item=>item.stockCode===stock.code),digest=companyDigest(stock.name),reason=why(stock.name);
      const head=`검색 ${stock.rank}위 ${josa(stock.name,'은','는')} ${won(stock.close)}원으로 ${absPct(stock.changePct)} ${moveWord(stock.changePct)}했다${vsKospi(stock.changePct)}.`;
      const out:DeepParagraph[]=[];
      if(reason)out.push({text:`${head} ${josa(reason.brief.report.broker,'은','는')} ${koreanDateLabel(reason.brief.report.date)} 「${reason.brief.report.title}」에서 ${said([quote(reason.item.text)])} 짚었다.`,source:reportSource(reason.brief.report)});
      const research=report?{text:ratingSentence(report),source:reportSource(report),report:reportCard(report)}:digest&&!reason?{text:digestParagraph(digest.item,digest.brief,2).text,source:reportSource(digest.brief.report)}:null;
      if(!reason&&research)out.push({text:`${head} ${research.text}`,source:research.source,...('report' in research&&research.report?{report:research.report}:{})});
      else if(!reason)bare.push(stock);
      else if(research)out.push(research);
      return out;
    });
    if(bare.length===1&&!paragraphs.length)paragraphs.push({text:`검색 ${bare[0]!.rank}위 ${josa(bare[0]!.name,'은','는')} ${won(bare[0]!.close)}원으로 ${absPct(bare[0]!.changePct)} ${moveWord(bare[0]!.changePct)}했다${vsKospi(bare[0]!.changePct)}.`});
    else if(bare.length){
      const list=bare.map(stock=>`${stock.name}(${stock.rank}위, ${won(stock.close)}원, ${signedPct(stock.changePct)})`).join(', ');
      const stronger=kospi===null?[]:bare.filter(stock=>stock.changePct>kospi),weaker=kospi===null?[]:bare.filter(stock=>stock.changePct<=kospi);
      const relative=kospi===null?'':` 코스피(${signedPct(kospi)})와 비교하면 ${stronger.length?`${stronger.map(stock=>stock.name).join('·')}${josa(stronger.at(-1)!.name,'이','가').slice(-1)} 지수보다 강했고`:'지수보다 강한 종목은 없었고'}${weaker.length?` ${weaker.map(stock=>stock.name).join('·')}${josa(weaker.at(-1)!.name,'은','는').slice(-1)} 지수를 밑돌았다`:' 지수를 밑돈 종목은 없었다'}.`;
      paragraphs.push({text:`이 밖의 검색 상위 종목은 해당 세션을 다룬 증권사 코멘트·리포트가 확인되지 않아 종가와 등락만 정리했다: ${list}.${relative}`});
    }
    const breadth=breadthParagraph(input.searchTop.map(stock=>({label:stock.name,changePct:stock.changePct})),'투자자 검색 상위',kospi===null?null:{label:'코스피',changePct:kospi});
    if(breadth)paragraphs.unshift(breadth);
    sections.push({key:'korea-stocks',placement:'early',role:'data',bars:input.searchTop.map(item=>({label:item.name,value:item.changePct})),title:'업종과 종목: 투자자 검색 상위',intro:'네이버페이 증권 검색 상위 종목(ETF·ETN·레버리지 제외)의 전일 종가 기준 등락과 최근 증권사 리포트다. 검색 순위는 관심도 지표이며 주가 변동의 원인이 아니다.',paragraphs});
    const top=input.searchTop[0]!;titleFocus=`검색 ${top.rank}위 ${top.name} ${Math.abs(top.changePct).toFixed(1)}% ${moveWord(top.changePct)}`;
  }
  const shown=new Set(input.searchTop.map(item=>item.code));
  const reviewDigests=digests.filter(({item})=>/Review|Preview|실적|목표주가|리뷰/.test(item.heading)&&!input.searchTop.some(stock=>item.heading.replace(/\s+/g,'').includes(stock.name.replace(/\s+/g,'')))).slice(0,3);
  // Only companies the brokers' session commentary names: an unrelated rating list is padding, not analysis.
  const commentary=briefs.flatMap(brief=>brief.statements.filter(item=>item.region==='KOREA').map(item=>item.text)).join('\n');
  const otherReports=[...new Map(companyReports.filter(item=>item.stockCode&&!shown.has(item.stockCode)&&(item.targetPrice||item.rating)&&item.company&&item.company.length>=2&&commentary.includes(item.company)).map(item=>[item.stockCode,item])).values()].slice(0,4);
  const strategy=digests.filter(({item})=>/전략|퀀틴전시|Strategy|시황|증시|KOSPI|코스피/.test(item.heading)).slice(0,1);
  const industry:BrokerReport[]=[];
  const analysis:DeepParagraph[]=[...strategy.map(({item,brief})=>digestParagraph(item,brief,2)),...reviewDigests.map(({item,brief})=>digestParagraph(item,brief,2)),...otherReports.map(report=>({text:`${report.company}: ${ratingSentence(report)}`,source:reportSource(report),report:reportCard(report)})),...(industry.length?[{text:`최근 산업 리포트: ${industry.map(report=>`${report.broker} 「${report.title}」(${koreanDateLabel(report.date)})`).join(', ')}.`,source:reportSource(industry[0]!)}]:[])];
  if(analysis.length)sections.push({key:'korea-broker-analysis',placement:'late',role:'broker',title:'증권사별 분석',intro:'투자의견과 목표주가는 각 증권사가 리포트에 게시한 값이며, 증권사마다 전제와 시점이 다르다.',paragraphs:analysis});
  if(input.checkpoint&&sections.length){
    const watch=volatilityWatch(input.searchTop.map(stock=>({label:stock.name,changePct:stock.changePct})),'직전 거래일 검색 상위');
    sections.push({key:'korea-risks',placement:'risks',role:'watch',title:'위험 요인과 다음 확인 지표',paragraphs:[...riskParagraphs(briefs,'KOREA',input.checkpoint),...(watch?[watch]:[])]});
  }
  const used=new Set(sections.flatMap(section=>section.paragraphs.map(p=>p.source?.url).filter(Boolean)));
  for(const report of [...briefs.map(item=>item.report),...companyReports,...industry])if(used.has(report.url))sources.push(sourceEntry(report));
  return {sections,leadAddition,titleFocus,sources:[...new Map(sources.map(item=>[item.url,item])).values()],hasCoreCommentary:Boolean(cause.first||wire)};
}

// A medical or surgical robot is not AI demand (2026-11-03: a kidney-stone surgical robot report reached the AI article).
const AI_WORDS=/AI|인공지능|반도체|HBM|데이터센터|GPU|엔비디아|LLM|클라우드|전력기기|인터커넥트|휴머노이드|파운드리|메모리|서버|MLCC|FC ?BGA/;

/** Ratings without a published summary, as one paragraph: who, which company, which rating and target, when. */
function ratingList(reports:BrokerReport[]):DeepParagraph[]{
  if(!reports.length)return [];
  if(reports.length===1)return [{text:`${reports[0]!.company??reports[0]!.title}: ${ratingSentence(reports[0]!)}`,source:reportSource(reports[0]!),report:reportCard(reports[0]!)}];
  const items=reports.map(report=>`${report.company??report.title}(${report.broker}, ${koreanDateLabel(report.date)}${report.rating?`, ${report.rating}`:''}${report.targetPrice?`, 목표주가 ${report.targetPrice}원`:''})`);
  return [{text:`요약문 없이 투자의견만 공개된 AI 관련 리포트도 있었다: ${items.join(', ')}.`,source:reportSource(reports[0]!)}];
}

/** AI article: AI bellwether moves on the latest U.S. session and broker research that names AI demand. */
const AI_ISSUE=/AI|인공지능|빅테크|알파벳|구글|마이크로소프트|\bMS\b|아마존|AWS|애저|Azure|메타(?!버스)|엔비디아|오라클|데이터센터|클라우드|설비투자|CapEx|반도체|HBM|GPU/;

/** AI article: the day's AI issue as brokers explained the latest U.S. session, AI bellwether moves and AI research. */
export function composeAIDeepSections(input:{bundle:BrokerResearchBundle|null;stocks:USAttentionStock[];sessionDate:string|null}):DeepComposition {
  const sections:DeepSection[]=[],sources:DeepComposition['sources']=[],leadAddition:string[]=[];
  // The day's AI issue: broker morning comments on the U.S. session that name AI companies or AI investment.
  const issueBriefs=(input.bundle?.briefs??[]).map(brief=>({...brief,statements:brief.statements.filter(item=>item.region==='US'&&AI_ISSUE.test(item.text))})).filter(brief=>brief.statements.length);
  const issue=causeParagraphs(issueBriefs,'US');
  let titleFocus:string|null=null;
  if(issue.first){
    sections.push({key:'ai-issue',placement:'early',role:'broker',title:'오늘의 AI 쟁점: 증권가 시각',intro:'직전 미국 정규장에서 AI 관련 기업의 주가를 움직인 사안을 증권사 아침 리포트 원문으로 정리했다.',paragraphs:issue.paragraphs});
    // The headline names the AI bellwether with the largest move that the brokers themselves discussed.
    // Only a stock whose move is printed in the stock section and whose name appears in a quoted paragraph qualifies.
    const quoted=issue.paragraphs.map(p=>p.text).join('\n'),mentions=(name:string)=>new RegExp(`${name}(?!버스)`).test(quoted);
    const named=input.stocks.length>=3&&input.sessionDate?[...input.stocks].filter(stock=>stock.koreanName&&Math.abs(stock.changePct)>=3&&mentions(stock.koreanName)).sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct))[0]:undefined;
    if(named){titleFocus=`${named.koreanName} ${Math.abs(named.changePct).toFixed(Math.abs(named.changePct)>=10?0:1)}% ${moveWord(named.changePct)}`;leadAddition.push(`직전 미국 정규장(${koreanDateLabel(input.sessionDate!)})에서 ${named.koreanName}(${named.symbol})${josa(named.koreanName!,'은','는').slice(named.koreanName!.length)} ${absPct(named.changePct)} ${moveWord(named.changePct)}했다.`)}
  }
  if(input.stocks.length>=3&&input.sessionDate){
    const sorted=[...input.stocks].sort((a,b)=>b.changePct-a.changePct),best=sorted[0]!,worst=sorted.at(-1)!;
    const up=sorted.filter(item=>item.changePct>0.005).length;
    sections.push({key:'ai-stocks',placement:'early',role:'data',bars:sorted.map(item=>({label:`${displayName(item)} ${item.symbol}`,value:item.changePct})),title:'AI 대표 종목의 주가 흐름',intro:`미국 AI 대표 종목 ${sorted.length}개의 직전 정규장(${input.sessionDate}) 종가 기준 등락이다.`,paragraphs:[
      {text:`${sorted.length}개 종목 가운데 ${up}개가 올랐다. 가장 강한 종목은 ${displayName(best)}(${best.symbol}, ${signedPct(best.changePct)}), 가장 약한 종목은 ${displayName(worst)}(${worst.symbol}, ${signedPct(worst.changePct)})${josa(displayName(worst),'이었다','였다').slice(displayName(worst).length)}.`},
      {text:sorted.map(item=>`${displayName(item)} ${signedPct(item.changePct)}`).join(' · ')},
    ]});
  }
  const briefs=input.bundle?.briefs??[];
  const digests=briefs.flatMap(brief=>brief.digests.filter(item=>AI_WORDS.test(item.heading)||item.bullets.some(bullet=>AI_WORDS.test(bullet))).map(item=>({item,brief}))).slice(0,3);
  const companies=[...new Map((input.bundle?.company??[]).filter(item=>AI_WORDS.test(item.title)&&(item.rating||item.targetPrice)).map(item=>[item.stockCode??item.url,item])).values()].slice(0,4);
  // An industry report is cited only with its summary; a title alone ('리포트를 냈다') is not analysis.
  const industry=(input.bundle?.industry??[]).filter(item=>AI_WORDS.test(item.title)&&!/daily|데일리|weekly|위클리/i.test(item.title)&&item.summary.length).slice(0,3);
  if(digests.length||companies.length||industry.length){
    sections.push({key:'ai-broker-research',role:'broker',title:'증권가가 본 AI 산업',intro:'국내 증권사가 최근 공개한 리포트 가운데 AI 수요를 직접 다룬 분석의 문장과 투자의견을 그대로 옮겼다.',paragraphs:[
      ...digests.map(({item,brief})=>digestParagraph(item,brief)),
      // A rating with no quoted reasoning is one line; such reports are listed together instead of one paragraph each.
      ...companies.filter(report=>report.summary.length).map(report=>({text:`${report.company??report.title}: ${ratingSentence(report)}`,source:reportSource(report),report:reportCard(report)})),
      ...ratingList(companies.filter(report=>!report.summary.length)),
      ...industry.map(report=>({text:`${subject(report)} ${koreanDateLabel(report.date)} 「${report.title}」 산업 리포트에서 ${said(report.summary.slice(0,2).map(quote))} 분석했다.`,source:reportSource(report)})),
    ]});
  }
  const used=new Set(sections.flatMap(section=>section.paragraphs.map(p=>p.source?.url).filter(Boolean)));
  for(const report of [...briefs.map(item=>item.report),...companies,...industry])if(used.has(report.url))sources.push(sourceEntry(report));
  return {sections,leadAddition,titleFocus,hasCoreCommentary:Boolean(issue.first),sources:[...new Map(sources.map(item=>[item.url,item])).values()]};
}

export {indexMove};

/**
 * 2026-11-13 owner: the 금리·달러·변동성 tile listed '미국 10년물 국채금리 5.10% +12bp' with no reading of it. The comment
 * under the tile says, from the verified series only: the level against the prior session, five sessions and the last
 * 20 sessions; why it moved, only as a named broker or wire sentence that mentions rates (otherwise it says no source
 * explained it); MOTUS's own reading against the index moves, labelled as such; and the levels and scheduled data to
 * watch next, labelled as check points, not a forecast. Every sentence carries a number or a named source.
 */
export interface RatePoint {date:string;value:number}
const RATE_WORDS=/(국채|금리|10년물|연준|FOMC|Fed|파월|인플레|물가|CPI|PPI|고용|소매판매|입찰)/;
const RATE_CORE=/(국채|금리|10년물|수익률)/;
const bp=(value:number)=>Math.round(value*100);
const signedBp=(value:number)=>`${bp(value)>0?'+':''}${bp(value)}bp`;
const moved=(value:number)=>bp(value)>0?'올랐다':bp(value)<0?'내렸다':'변동이 없었다';
const md=(iso:string)=>`${Number(iso.slice(5,7))}월 ${Number(iso.slice(8,10))}일`;
const pct2=(value:number)=>value.toFixed(2)+'%';
export function composeRatesComment(input:{label?:string;points:RatePoint[];sessionDate:string;indexes:Array<{name:string;changePct:number}>;bundle:BrokerResearchBundle|null;wire?:WireReport[]}):DeepSection|null{
  const points=[...input.points].filter(point=>Number.isFinite(point.value)).sort((a,b)=>a.date.localeCompare(b.date));
  const latest=points.at(-1),previous=points.at(-2);
  if(!latest||!previous)return null;
  const paragraphs:DeepParagraph[]=[],change=latest.value-previous.value;
  // 1. Level and context: prior session, five sessions, the last 20 sessions, and a run in one direction.
  let fact=`미국 10년물 국채금리는 ${md(latest.date)} ${pct2(latest.value)}로 전 거래일(${md(previous.date)} ${pct2(previous.value)})보다 ${Math.abs(bp(change))}bp ${moved(change)}.`;
  if(latest.date!==input.sessionDate)fact+=` 이 값은 ${md(latest.date)} 고시분으로, ${md(input.sessionDate)} 정규장 값은 아직 고시되지 않았다.`;
  const week=points.at(-6);if(week)fact+=` 5거래일 전(${md(week.date)} ${pct2(week.value)})과 비교하면 ${signedBp(latest.value-week.value)}이다.`;
  const window=points.slice(-20);
  if(window.length>=10){
    const values=window.map(point=>point.value),low=Math.min(...values),high=Math.max(...values);
    const place=latest.value>=high?'최고치':latest.value<=low?'최저치':(latest.value-low)/(high-low)>=0.75?'상단':(latest.value-low)/(high-low)<=0.25?'하단':'중간';
    fact+=` 최근 ${window.length}거래일 범위 ${pct2(low)}~${pct2(high)}에서 ${place}${place.endsWith('치')?'다':'이다'}.`;
  }
  let run=0;for(let i=points.length-1;i>0;i--){const step=bp(points[i]!.value-points[i-1]!.value);if(step===0||Math.sign(step)!==Math.sign(bp(change)))break;run++}
  if(run>=2)fact+=` ${run}거래일 연속 ${bp(change)>0?'상승':'하락'}이다.`;
  paragraphs.push({text:fact});
  // 2. Why: only a sourced sentence about rates. Broker statements first, then economy reports, then a wire sentence.
  const briefs=input.bundle?.briefs??[];
  const statements=briefs.flatMap(brief=>brief.statements.filter(item=>item.region==='US'&&RATE_CORE.test(item.text)).map(item=>({text:item.text,report:brief.report})));
  const economy=(input.bundle?.economy??[]).flatMap(report=>report.summary.filter(text=>RATE_CORE.test(text)).map(text=>({text,report})));
  const picks=[...new Map([...statements,...economy].map(item=>[item.text.replace(/\s+/g,' ').trim(),item])).values()].slice(0,2);
  if(picks.length)for(const pick of picks)paragraphs.push({text:`금리 관련 증권가 시각: ${subject(pick.report)} 「${pick.report.title}」에서 ${said([quote(pick.text)])} 짚었다.`,source:reportSource(pick.report)});
  else{
    const wire=(input.wire??[]).find(report=>RATE_CORE.test(report.sentence??'')||RATE_CORE.test(report.title));
    if(wire)paragraphs.push({text:`금리 배경(통신 보도): ${josa(wire.publisher,'은','는')} ${md(kstDay(wire.publishedAt))} 「${wire.title}」에서 ${said([quote(RATE_CORE.test(wire.sentence??'')?wire.sentence!:wire.title)])} 전했다.`,source:{label:`${wire.publisher} 「${wire.title}」`,url:wire.url,kind:'article'}});
    else paragraphs.push({text:`금리 배경: 이날 10년물 금리가 ${Math.abs(bp(change))}bp ${moved(change).replace(/다$/,'')}는데 그 이유를 직접 설명한 증권사 리포트·통신 기사 문장은 수집되지 않았다(원인 미확인).`});
  }
  // 3. MOTUS's own reading: the yield move next to the index moves of the same session.
  const nasdaq=input.indexes.find(item=>/나스닥|Nasdaq/i.test(item.name)),sp=input.indexes.find(item=>/S&P/.test(item.name));
  if(nasdaq&&latest.date===input.sessionDate){
    const b=bp(change),n=`나스닥 ${signedPct(nasdaq.changePct)}${sp?`, S&P 500 ${signedPct(sp.changePct)}`:''}`;
    const reading=Math.abs(b)<5?`금리 변동이 ${signedBp(change)}로 작아 이날 지수 등락(${n})의 주된 변수로 보기는 어렵다.`
      :b>0&&nasdaq.changePct<0?`금리가 ${signedBp(change)} 오른 날 지수가 내렸다(${n}). 금리 상승은 미래 이익의 현재가치를 낮춰 성장주에 부담이 되는 경우가 많아, 이날 약세와 방향이 같다.`
      :b>0?`금리가 ${signedBp(change)} 올랐는데도 지수가 올라(${n}), 이날 지수는 금리보다 실적·종목 재료의 영향이 컸던 것으로 읽힌다.`
      :nasdaq.changePct>0?`금리가 ${signedBp(change)} 내린 날 지수가 올랐다(${n}). 금리 하락이 성장주에 우호적으로 작용하는 방향과 같다.`
      :`금리가 ${signedBp(change)} 내렸는데도 지수가 내려(${n}), 금리 하락이 경기 둔화 우려를 반영했을 가능성도 함께 봐야 한다.`;
    paragraphs.push({text:`MOTUS 해석(추정): ${reading}`});
  }
  // 4. Next: the nearest quarter-point levels and the rate-related data on the brokers' calendars (check points only).
  const below=Math.floor(latest.value*4)/4,above=below+0.25,levels=latest.value-below<0.005?`${pct2(below)}선 위를 지키는지`:`${pct2(above)}를 넘어서는지(${Math.abs(bp(above-latest.value))}bp 위), ${pct2(below)} 아래로 되돌아오는지(${Math.abs(bp(latest.value-below))}bp 아래)`;
  const events=[...new Set(briefs.flatMap(brief=>(brief.events??[]).filter(item=>item.region==='US'&&RATE_WORDS.test(item.text)).map(item=>`${item.text}(${brief.report.broker} 집계)`)))].slice(0,2);
  paragraphs.push({text:`다음 거래일 관전 포인트(전망 아님): 10년물이 ${levels}가 1차 확인 지점이다.${events.length?` 금리에 영향을 줄 예정 일정: ${events.join(' / ')}.`:''}`});
  return {key:'us-rates-comment',placement:'early',role:'analysis',title:'금리 해설',paragraphs};
}

/**
 * 2026-11-13 owner standard (see composeRatesComment): Korea's FX tile and investor flows get the same reading:
 * the move, a sourced cause or 'unconfirmed', MOTUS's labelled reading against the index, and levels to watch.
 */
const fmtNum=(value:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
const FX_WORDS=/(환율|원화|원·달러|원\/달러|달러\s*강세|달러\s*약세|달러인덱스)/;
const won1=(value:number)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}).format(value);
export function composeKoreaFxFlowComment(input:{fx:{value:number;change:number}|null;flows:Array<{label:string;value:number}>;kospiChangePct:number|null;bundle:BrokerResearchBundle|null;wire?:WireReport[]}):DeepSection[]{
  const sections:DeepSection[]=[],briefs=input.bundle?.briefs??[],foreign=input.flows.find(item=>item.label==='외국인');
  if(input.fx&&Number.isFinite(input.fx.value)&&Number.isFinite(input.fx.change)){
    const {value,change}=input.fx,previous=value-change,pct=previous?change/previous*100:0;
    const paragraphs:DeepParagraph[]=[{text:`원·달러 환율은 기사 작성 시점 ${won1(value)}원으로 전일보다 ${Math.abs(change)<0.05?'변동이 없었다':`${won1(Math.abs(change))}원(${Math.abs(pct).toFixed(2)}%) ${change>0?'올랐다(원화 약세)':'내렸다(원화 강세)'}`}.`}];
    const statement=briefs.flatMap(brief=>brief.statements.filter(item=>item.region==='KOREA'&&FX_WORDS.test(item.text)).map(item=>({text:item.text,report:brief.report})))[0];
    const wire=statement?null:(input.wire??[]).find(report=>FX_WORDS.test(report.sentence??''));
    if(statement)paragraphs.push({text:`환율 관련 증권가 시각: ${subject(statement.report)} 「${statement.report.title}」에서 ${said([quote(statement.text)])} 짚었다.`,source:reportSource(statement.report)});
    else if(wire)paragraphs.push({text:`환율 배경(통신 보도): ${josa(wire.publisher,'은','는')} ${md(kstDay(wire.publishedAt))} 「${wire.title}」에서 ${said([quote(wire.sentence!)])} 전했다.`,source:{label:`${wire.publisher} 「${wire.title}」`,url:wire.url,kind:'article'}});
    else if(Math.abs(change)>=0.05)paragraphs.push({text:`환율 배경: 이날 환율이 ${won1(Math.abs(change))}원 ${change>0?'오른':'내린'} 이유를 직접 설명한 증권사 리포트·통신 기사 문장은 수집되지 않았다(원인 미확인).`});
    if(foreign&&Math.abs(change)>=0.05&&foreign.value!==0){
      const sell=foreign.value<0,weak=change>0,flow=`외국인 ${foreign.value>0?'+':''}${fmtNum(foreign.value)}`;
      paragraphs.push({text:`MOTUS 해석(추정): ${sell===weak?`외국인이 ${sell?'순매도':'순매수'}(${flow})한 날 원화가 ${weak?'약해져':'강해져'}, 외국인 주식 수급과 환율이 같은 방향으로 움직였다.`:`외국인 ${sell?'순매도':'순매수'}(${flow})와 달리 원화가 ${weak?'약해져':'강해져'}, 이날 환율은 국내 주식 수급보다 다른 요인의 영향이 컸던 것으로 읽힌다.`}`});
    }
    const below=Math.floor(value/10)*10,above=below+10;
    paragraphs.push({text:`다음 거래일 관전 포인트(전망 아님): ${value-below<0.05?`환율이 ${fmtNum(below)}원선 위를 지키는지`:`환율이 ${fmtNum(above)}원을 넘어서는지(${won1(above-value)}원 위), ${fmtNum(below)}원 아래로 내려가는지(${won1(value-below)}원 아래)`}가 확인 지점이다.`});
    sections.push({key:'korea-fx-comment',placement:'early',role:'analysis',title:'환율 해설',paragraphs});
  }
  if(input.flows.length>=2){
    const sorted=[...input.flows].sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)),lead=sorted[0]!,rest=input.flows.filter(item=>item!==lead);
    const sign=(value:number)=>`${value>0?'+':''}${fmtNum(value)}`;
    const paragraphs:DeepParagraph[]=[{text:`투자자별로는 ${lead.label}의 ${lead.value<0?'순매도':'순매수'}(${sign(lead.value)}) 규모가 가장 컸고, ${rest.map(item=>`${item.label}(${sign(item.value)})`).join('·')}${rest.every(item=>item.value>0)?josa(rest.at(-1)!.label,'은','는').slice(rest.at(-1)!.label.length)+' 순매수했다':rest.every(item=>item.value<0)?josa(rest.at(-1)!.label,'은','는').slice(rest.at(-1)!.label.length)+' 순매도했다':josa(rest.at(-1)!.label,'이','가').slice(rest.at(-1)!.label.length)+' 뒤를 이었다'}.`}];
    if(foreign&&input.kospiChangePct!==null&&Math.abs(input.kospiChangePct)>=0.05&&foreign.value!==0){
      const same=(foreign.value>0)===(input.kospiChangePct>0);
      paragraphs.push({text:`MOTUS 해석(추정): 코스피가 ${Math.abs(input.kospiChangePct).toFixed(2)}% ${input.kospiChangePct>0?'오른':'내린'} 날 외국인은 ${foreign.value>0?'순매수':'순매도'}(${sign(foreign.value)})해, ${same?'지수 방향과 외국인 수급이 같았다.':'지수 방향과 외국인 수급이 엇갈렸다. 지수를 움직인 주체가 외국인 밖에 있었을 가능성이 있다.'}`});
    }
    sections.push({key:'korea-flow-comment',placement:'early',role:'analysis',title:'수급 해설',paragraphs});
  }
  return sections;
}
