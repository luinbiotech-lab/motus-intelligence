/**
 * Composes the expert and search-ranked parts of the U.S. and Korea daily articles from collected evidence.
 * Every sentence either restates a verified number or quotes a named broker verbatim with its date and report;
 * nothing here invents a cause, a rating or a target.
 */
import {josa} from './ai-generic-synthesis.js';
import {analystLabel,koreanDateLabel,type BrokerBrief,type BrokerDigest,type BrokerReport,type BrokerResearchBundle} from './broker-briefs.js';
import {displayName,moveWord,signedPct,absPct,type KoreaSearchStock,type SectorMove,type USAttentionStock} from './market-attention.js';

export interface DeepParagraph {text:string;source?:{label:string;url:string}}
export interface DeepSection {key:string;title:string;intro?:string;placement?:'early'|'late'|'risks';paragraphs:DeepParagraph[]}
export interface DeepComposition {sections:DeepSection[];leadAddition:string[];titleFocus:string|null;sources:Array<{label:string;url:string;publisher:string}>;hasCoreCommentary?:boolean}

const quote=(value:string)=>`“${value.replace(/[“"]/g,'‘').replace(/[”]/g,'’').replace(/\s+/g,' ').trim().replace(/[.。]$/,'')}”`;
/** “…”라고 / “…”이라고 by the final syllable of the quotation. */
function said(quotes:string[]):string {const last=quotes.at(-1)??'',char=last.replace(/[”’\s]+$/,'').slice(-1),code=char.charCodeAt(0)-0xac00;const batchim=code>=0&&code<11172&&code%28!==0;return `${quotes.join(', ')}${batchim?'이라고':'라고'}`}
/** Statements that describe the market as a whole lead; side notes (FX, oil) follow. */
function marketScore(text:string){const digits=(text.match(/\d/g)??[]).length/Math.max(text.length,1);return (/마감|지수|증시|코스피|KOSPI|나스닥|S&P|다우|3대/.test(text)?2:0)+(/상승|하락|강세|약세|급등|급락|반등/.test(text)?1:0)+(/힘입|기대|영향|덕분|때문|배경|속에?\s|에\s?(?:상승|하락|급등|급락|강세|약세)/.test(text)?3:0)-(digits>0.12?3:0)}
const reportSource=(report:BrokerReport)=>({label:`${report.broker} ${report.title} (${koreanDateLabel(report.date)})`,url:report.url});
const sourceEntry=(report:BrokerReport)=>({label:`${report.broker} 「${report.title}」 (${report.date})`,url:report.url,publisher:report.broker});
function subject(report:BrokerReport):string {return josa(analystLabel(report),'은','는')}
function won(value:number){return new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(value)}
function usd(value:number){return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)}
function indexMove(value:number):string {const size=Math.abs(value);if(size<0.005)return '보합';if(value>0)return size>=2?'급등':'상승';return size>=2?'급락':'하락'}

function digestParagraph(digest:BrokerDigest,brief:BrokerBrief,limit=3):DeepParagraph {
  const who=digest.analyst?`${brief.report.broker} ${digest.analyst} 연구원`:analystLabel(brief.report);
  return {text:`${josa(who,'은','는')} 「${digest.heading.replace(/\s+/g,' ')}」에서 ${said(digest.bullets.slice(0,limit).map(quote))} 밝혔다.`,source:reportSource(brief.report)};
}

function ratingSentence(report:BrokerReport):string {
  const parts=[report.rating?`투자의견 ${report.rating}`:'',report.targetPrice?`목표주가 ${report.targetPrice}원`:''].filter(Boolean);
  const headline=report.company?report.title.replace(/^.+?\(\d{6}\)\s*/,''):report.title;
  return `${subject(report)} ${koreanDateLabel(report.date)} 「${headline}」 리포트에서 ${parts.length?parts.join(', ')+'을 제시했다':'관련 분석을 내놨다'}${report.summary.length?`. 요약: ${report.summary.slice(0,2).map(quote).join(', ')}`:''}.`;
}

const THEMES:Array<[string,RegExp]>=[['반도체 업황·실적',/반도체|하이닉스|HBM|메모리|필라델피아/],['AI 투자 기대',/AI|인공지능|빅테크/],['FOMC·통화정책',/FOMC|연준|금리|기준금리|Fed/],['기업 실적',/실적|어닝|영업이익/],['외국인·기관 수급',/외국인|기관|순매수|순매도|사이드카/],['환율·달러',/환율|달러/],['국제유가',/유가|원유/],['주주환원',/주주환원|배당|자사주/]];
const CAUTION=/우려|경계|부담|리스크|불확실|하락 전환|차익실현|관망|둔화|대기|엇갈|급락/;
type Pick={text:string;brief:BrokerBrief};

/** Splits each broker's session commentary into drivers and cautions, one short quote per broker for each. */
function causes(briefs:BrokerBrief[],region:'US'|'KOREA'){
  const drivers:Pick[]=[],cautions:Pick[]=[];
  for(const brief of briefs){
    const items=brief.statements.filter(item=>item.region===region&&item.text.length<=130);
    const caution=items.find(item=>CAUTION.test(item.text)),driver=items.filter(item=>item!==caution&&!CAUTION.test(item.text)).sort((a,b)=>marketScore(b.text)-marketScore(a.text))[0];
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
    return `증권사 ${brokers.length}곳의 아침 리포트를 대조하면 ${top.map(item=>`${item.label}(${item.names.join('·')})`).join(', ')}${josa(top.at(-1)!.label,'이','가').slice(-1)} 공통으로 꼽힌 배경이다.${tail}`;
  }
  const views=brokers.map(broker=>({broker,themes:themesOf(broker)})).filter(item=>item.themes.length);
  if(views.length<2)return null;
  return `증권사들이 강조한 배경은 엇갈렸다. ${views.map(item=>`${josa(item.broker,'은','는')} ${item.themes.slice(0,2).join('·')}`).join(', ')}에 무게를 뒀다.`;
}
function causeParagraphs(briefs:BrokerBrief[],region:'US'|'KOREA'):{paragraphs:DeepParagraph[];first:Pick|null}{
  const {drivers,cautions}=causes(briefs,region),all=briefs.flatMap(brief=>brief.statements.filter(item=>item.region===region).map(item=>({text:item.text,brief})));
  const paragraphs:DeepParagraph[]=[];const summary=consensus(drivers,all);if(summary)paragraphs.push({text:'MOTUS 정리: '+summary});
  for(const pick of drivers)paragraphs.push({text:`${subject(pick.brief.report)} ${koreanDateLabel(pick.brief.report.date)} 아침 리포트 「${pick.brief.report.title}」에서 ${said([quote(pick.text)])} 진단했다.`,source:reportSource(pick.brief.report)});
  for(const pick of cautions)paragraphs.push({text:`경계 요인도 제시됐다. ${subject(pick.brief.report)} ${said([quote(pick.text)])} 짚었다.`,source:reportSource(pick.brief.report)});
  return {paragraphs,first:[...drivers].sort((a,b)=>marketScore(b.text)-marketScore(a.text))[0]??null};
}
function riskParagraphs(briefs:BrokerBrief[],region:'US'|'KOREA',checkpoint:string):DeepParagraph[]{
  const events=[...new Map(briefs.flatMap(brief=>(brief.events??[]).filter(item=>item.region===region).map(item=>[item.text,{item,brief}]))).values()].slice(0,4);
  const paragraphs:DeepParagraph[]=events.map(({item,brief})=>({text:`예정 일정(${brief.report.broker} 집계): ${item.text}`,source:reportSource(brief.report)}));
  paragraphs.push({text:checkpoint});
  return paragraphs;
}

export function composeUSDeepSections(input:{bundle:BrokerResearchBundle|null;stocks:USAttentionStock[];sectors:SectorMove[];checkpoint?:string}):DeepComposition {
  const sections:DeepSection[]=[],sources:DeepComposition['sources']=[],leadAddition:string[]=[];
  const briefs=input.bundle?.briefs??[];
  const cause=causeParagraphs(briefs,'US');
  if(cause.first){
    sections.push({key:'us-causes',placement:'early',title:'상승·하락 요인과 반대 시각',paragraphs:cause.paragraphs});
    leadAddition.push(`${subject(cause.first.brief.report)} 이날 장을 ${said([quote(cause.first.text)])} 요약했다.`);
  }
  const ranked=[...input.stocks].sort((a,b)=>(a.trendingRank??99)-(b.trendingRank??99)||(a.mostActiveRank??99)-(b.mostActiveRank??99)).slice(0,5);
  let titleFocus:string|null=null;const market:DeepParagraph[]=[];
  if(input.sectors.length>=6){
    const best=input.sectors[0]!,worst=input.sectors.at(-1)!,up=input.sectors.filter(item=>item.changePct>0.005).length;
    market.push({text:`S&P 500 업종을 추종하는 SPDR 업종 ETF 11종 가운데 ${up}종이 올랐다. ${best.label}(${best.symbol}) ${signedPct(best.changePct)}가 가장 강했고 ${worst.label}(${worst.symbol}) ${signedPct(worst.changePct)}가 가장 약했다. 업종별 등락: ${input.sectors.map(item=>`${item.label} ${signedPct(item.changePct)}`).join(', ')}.`});
  }
  if(ranked.length){
    const mentions=(stock:USAttentionStock)=>briefs.flatMap(brief=>brief.statements.filter(item=>item.region==='US'&&(stock.koreanName&&item.text.includes(stock.koreanName)||item.text.includes(stock.symbol))).map(item=>({item,brief})))[0];
    for(const stock of ranked){
      const name=displayName(stock),particle=josa(name,'은','는').slice(name.length),linked=mentions(stock);
      const rank=[stock.trendingRank?`야후 파이낸스 검색 ${stock.trendingRank}위`:'',stock.mostActiveRank?`대형주 거래량 ${stock.mostActiveRank}위`:''].filter(Boolean).join(', ');
      market.push({text:`${name}(${stock.symbol})${particle} ${usd(stock.close)}달러로 ${absPct(stock.changePct)} ${moveWord(stock.changePct)}했다(${rank}).${linked?` ${josa(linked.brief.report.broker,'은','는')} ${said([quote(linked.item.text)])} 설명했다.`:''}`,...(linked?{source:reportSource(linked.brief.report)}:{})});
    }
    const focus=ranked.find(stock=>Math.abs(stock.changePct)>=3)??ranked[0]!;
    titleFocus=`${displayName(focus)} ${Math.abs(focus.changePct).toFixed(Math.abs(focus.changePct)>=10?0:1)}% ${moveWord(focus.changePct)}`;
  }
  if(market.length)sections.push({key:'us-sectors-stocks',placement:'early',title:'업종과 종목',intro:'종목 순위는 투자자 관심도를 보여 줄 뿐 주가 변동의 원인을 뜻하지 않는다. 등락은 해당 거래일 종가 기준이다.',paragraphs:market});
  const rateDigests=briefs.flatMap(brief=>brief.digests.filter(item=>/FOMC|연준|Fed|美|미국|달러/.test(item.heading)&&!/프랑스|유럽|ECB|중국|일본|독일|영국|국고채|코스피|KOSPI|하이닉스|퀀틴전시|국내/.test(item.heading)).map(item=>({item,brief}))).slice(0,2);
  const economy=(input.bundle?.economy??[]).filter(item=>/FOMC|연준|금리|미국|美|달러|물가|고용|Fed/.test(item.title)).slice(0,3);
  if(rateDigests.length||economy.length)sections.push({key:'us-broker-analysis',placement:'late',title:'증권사별 분석: 금리와 통화정책',paragraphs:[...rateDigests.map(({item,brief})=>digestParagraph(item,brief)),...economy.map(report=>({text:ratingSentence(report),source:reportSource(report)}))]});
  if(input.checkpoint&&sections.length)sections.push({key:'us-risks',placement:'risks',title:'위험 요인과 다음 확인 지표',paragraphs:riskParagraphs(briefs,'US',input.checkpoint)});
  const used=new Set(sections.flatMap(section=>section.paragraphs.map(p=>p.source?.url).filter(Boolean)));
  for(const report of [...briefs.map(item=>item.report),...economy])if(used.has(report.url))sources.push(sourceEntry(report));
  return {sections,leadAddition,titleFocus,sources:[...new Map(sources.map(item=>[item.url,item])).values()],hasCoreCommentary:Boolean(cause.first)};
}

export function composeKoreaDeepSections(input:{bundle:BrokerResearchBundle|null;searchTop:KoreaSearchStock[];checkpoint?:string}):DeepComposition {
  const sections:DeepSection[]=[],sources:DeepComposition['sources']=[],leadAddition:string[]=[];
  const briefs=input.bundle?.briefs??[],companyReports=input.bundle?.company??[];
  const cause=causeParagraphs(briefs,'KOREA');
  if(cause.first){
    sections.push({key:'korea-causes',placement:'early',title:'상승·하락 요인과 반대 시각',paragraphs:cause.paragraphs});
    leadAddition.push(`${subject(cause.first.brief.report)} 전일 장을 ${said([quote(cause.first.text)])} 진단했다.`);
  }
  const digests=briefs.flatMap(brief=>brief.digests.map(item=>({item,brief})));
  const companyDigest=(name:string)=>digests.find(({item})=>item.heading.replace(/\s+/g,'').includes(name.replace(/\s+/g,'')));
  let titleFocus:string|null=null;
  if(input.searchTop.length){
    const paragraphs:DeepParagraph[]=input.searchTop.map(stock=>{
      const report=companyReports.find(item=>item.stockCode===stock.code),digest=companyDigest(stock.name);
      const research=report?` ${ratingSentence(report)}`:digest?` ${digestParagraph(digest.item,digest.brief,2).text}`:'';
      return {text:`검색 ${stock.rank}위 ${josa(stock.name,'은','는')} ${won(stock.close)}원으로 ${absPct(stock.changePct)} ${moveWord(stock.changePct)}했다.${research}`,...(report?{source:reportSource(report)}:digest?{source:reportSource(digest.brief.report)}:{})};
    });
    sections.push({key:'korea-stocks',placement:'early',title:'업종과 종목: 투자자 검색 상위',intro:'네이버페이 증권 검색 상위 종목(ETF·ETN·레버리지 제외)의 전일 종가 기준 등락과 최근 증권사 리포트다. 검색 순위는 관심도 지표이며 주가 변동의 원인이 아니다.',paragraphs});
    const top=input.searchTop[0]!;titleFocus=`검색 1위 ${top.name} ${Math.abs(top.changePct).toFixed(1)}% ${moveWord(top.changePct)}`;
  }
  const shown=new Set(input.searchTop.map(item=>item.code));
  const reviewDigests=digests.filter(({item})=>/Review|Preview|실적|목표주가|리뷰/.test(item.heading)&&!input.searchTop.some(stock=>item.heading.replace(/\s+/g,'').includes(stock.name.replace(/\s+/g,'')))).slice(0,3);
  const otherReports=[...new Map(companyReports.filter(item=>item.stockCode&&!shown.has(item.stockCode)&&(item.targetPrice||item.rating)).map(item=>[item.stockCode,item])).values()].slice(0,4);
  const strategy=digests.filter(({item})=>/전략|퀀틴전시|Strategy|시황|증시|KOSPI|코스피/.test(item.heading)).slice(0,1);
  const industry=(input.bundle?.industry??[]).filter(item=>!/daily|데일리|weekly|위클리|안녕하세요/i.test(item.title)).slice(0,3);
  const analysis:DeepParagraph[]=[...strategy.map(({item,brief})=>digestParagraph(item,brief,2)),...reviewDigests.map(({item,brief})=>digestParagraph(item,brief,2)),...otherReports.map(report=>({text:`${report.company}: ${ratingSentence(report)}`,source:reportSource(report)})),...(industry.length?[{text:`최근 산업 리포트: ${industry.map(report=>`${report.broker} 「${report.title}」(${koreanDateLabel(report.date)})`).join(', ')}.`,source:reportSource(industry[0]!)}]:[])];
  if(analysis.length)sections.push({key:'korea-broker-analysis',placement:'late',title:'증권사별 분석',intro:'투자의견과 목표주가는 각 증권사가 리포트에 게시한 값이며, 증권사마다 전제와 시점이 다르다.',paragraphs:analysis});
  if(input.checkpoint&&sections.length)sections.push({key:'korea-risks',placement:'risks',title:'위험 요인과 다음 확인 지표',paragraphs:riskParagraphs(briefs,'KOREA',input.checkpoint)});
  const used=new Set(sections.flatMap(section=>section.paragraphs.map(p=>p.source?.url).filter(Boolean)));
  for(const report of [...briefs.map(item=>item.report),...companyReports,...industry])if(used.has(report.url))sources.push(sourceEntry(report));
  return {sections,leadAddition,titleFocus,sources:[...new Map(sources.map(item=>[item.url,item])).values()],hasCoreCommentary:Boolean(cause.first)};
}

const AI_WORDS=/AI|인공지능|반도체|HBM|데이터센터|GPU|엔비디아|LLM|클라우드|전력기기|인터커넥트|로봇|휴머노이드|파운드리|메모리|서버|MLCC|FC ?BGA/;

/** AI article: AI bellwether moves on the latest U.S. session and broker research that names AI demand. */
export function composeAIDeepSections(input:{bundle:BrokerResearchBundle|null;stocks:USAttentionStock[];sessionDate:string|null}):DeepComposition {
  const sections:DeepSection[]=[],sources:DeepComposition['sources']=[];
  if(input.stocks.length>=3&&input.sessionDate){
    const sorted=[...input.stocks].sort((a,b)=>b.changePct-a.changePct),best=sorted[0]!,worst=sorted.at(-1)!;
    const up=sorted.filter(item=>item.changePct>0.005).length;
    sections.push({key:'ai-stocks',title:'AI 대표 종목의 주가 흐름',intro:`미국 AI 대표 종목 ${sorted.length}개의 직전 정규장(${input.sessionDate}) 종가 기준 등락이다.`,paragraphs:[
      {text:`${sorted.length}개 종목 가운데 ${up}개가 올랐다. 가장 강한 종목은 ${displayName(best)}(${best.symbol}, ${signedPct(best.changePct)}), 가장 약한 종목은 ${displayName(worst)}(${worst.symbol}, ${signedPct(worst.changePct)})였다.`},
      {text:sorted.map(item=>`${displayName(item)} ${signedPct(item.changePct)}`).join(' · ')},
    ]});
  }
  const briefs=input.bundle?.briefs??[];
  const digests=briefs.flatMap(brief=>brief.digests.filter(item=>AI_WORDS.test(item.heading)||item.bullets.some(bullet=>AI_WORDS.test(bullet))).map(item=>({item,brief}))).slice(0,3);
  const companies=[...new Map((input.bundle?.company??[]).filter(item=>AI_WORDS.test(item.title)&&(item.rating||item.targetPrice)).map(item=>[item.stockCode??item.url,item])).values()].slice(0,4);
  const industry=(input.bundle?.industry??[]).filter(item=>AI_WORDS.test(item.title)&&!/daily|데일리|weekly|위클리/i.test(item.title)).slice(0,3);
  if(digests.length||companies.length||industry.length){
    sections.push({key:'ai-broker-research',title:'증권가가 본 AI 산업',intro:'국내 증권사가 최근 공개한 리포트 가운데 AI 수요를 직접 다룬 분석의 문장과 투자의견을 그대로 옮겼다.',paragraphs:[
      ...digests.map(({item,brief})=>digestParagraph(item,brief)),
      ...companies.map(report=>({text:`${report.company??report.title}: ${ratingSentence(report)}`,source:reportSource(report)})),
      ...industry.map(report=>({text:`${subject(report)} ${koreanDateLabel(report.date)} 산업 리포트 「${report.title}」를 냈다.${report.summary.length?` 요약: ${report.summary.slice(0,2).map(quote).join(', ')}.`:''}`,source:reportSource(report)})),
    ]});
  }
  const used=new Set(sections.flatMap(section=>section.paragraphs.map(p=>p.source?.url).filter(Boolean)));
  for(const report of [...briefs.map(item=>item.report),...companies,...industry])if(used.has(report.url))sources.push(sourceEntry(report));
  return {sections,leadAddition:[],titleFocus:null,sources:[...new Map(sources.map(item=>[item.url,item])).values()]};
}

export {indexMove};
