/**
 * Composes the expert and search-ranked parts of the U.S. and Korea daily articles from collected evidence.
 * Every sentence either restates a verified number or quotes a named broker verbatim with its date and report;
 * nothing here invents a cause, a rating or a target.
 */
import {josa} from './ai-generic-synthesis.js';
import {analystLabel,koreanDateLabel,type BrokerBrief,type BrokerDigest,type BrokerReport,type BrokerResearchBundle} from './broker-briefs.js';
import {displayName,moveWord,signedPct,absPct,type KoreaSearchStock,type SectorMove,type USAttentionStock} from './market-attention.js';

export interface DeepParagraph {text:string;source?:{label:string;url:string}}
export interface DeepSection {key:string;title:string;intro?:string;paragraphs:DeepParagraph[]}
export interface DeepComposition {sections:DeepSection[];leadAddition:string[];titleFocus:string|null;sources:Array<{label:string;url:string;publisher:string}>}

const quote=(value:string)=>`“${value.replace(/[“”"]/g,'').replace(/\s+/g,' ').trim().replace(/[.。]$/,'')}”`;
const reportSource=(report:BrokerReport)=>({label:`${report.broker} ${report.title} (${koreanDateLabel(report.date)})`,url:report.url});
const sourceEntry=(report:BrokerReport)=>({label:`${report.broker} 「${report.title}」 (${report.date})`,url:report.url,publisher:report.broker});
function subject(report:BrokerReport):string {return josa(analystLabel(report),'은','는')}
function won(value:number){return new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(value)}
function usd(value:number){return new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value)}
function indexMove(value:number):string {const size=Math.abs(value);if(size<0.005)return '보합';if(value>0)return size>=2?'급등':'상승';return size>=2?'급락':'하락'}

function briefParagraphs(briefs:BrokerBrief[],region:'US'|'KOREA',maxBriefs=3,perBrief=2):{paragraphs:DeepParagraph[];first:{text:string;brief:BrokerBrief}|null}{
  const paragraphs:DeepParagraph[]=[];let first:{text:string;brief:BrokerBrief}|null=null;const used=new Set<string>();
  for(const brief of briefs){
    if(paragraphs.length>=maxBriefs)break;
    const statements=brief.statements.filter(item=>item.region===region&&!used.has(item.text)).slice(0,perBrief);if(!statements.length)continue;
    statements.forEach(item=>used.add(item.text));if(!first)first={text:statements[0]!.text,brief};
    paragraphs.push({text:`${subject(brief.report)} ${koreanDateLabel(brief.report.date)} 아침 리포트 「${brief.report.title}」에서 ${statements.map(item=>quote(item.text)).join(', ')}라고 정리했다.`,source:reportSource(brief.report)});
  }
  return {paragraphs,first};
}

function digestParagraph(digest:BrokerDigest,brief:BrokerBrief):DeepParagraph {
  const who=digest.analyst?`${brief.report.broker} ${digest.analyst} 연구원`:analystLabel(brief.report);
  return {text:`${josa(who,'은','는')} 「${digest.heading.replace(/\s+/g,' ')}」에서 ${digest.bullets.slice(0,3).map(quote).join(', ')}라고 밝혔다.`,source:reportSource(brief.report)};
}

function ratingSentence(report:BrokerReport):string {
  const parts=[report.rating?`투자의견 ${report.rating}`:'',report.targetPrice?`목표주가 ${report.targetPrice}원`:''].filter(Boolean);
  const headline=report.company?report.title.replace(/^.+?\(\d{6}\)\s*/,''):report.title;
  return `${subject(report)} ${koreanDateLabel(report.date)} 「${headline}」 리포트에서 ${parts.length?parts.join(', ')+'을 제시했다':'분석을 내놓았다'}${report.summary.length?`. 요약: ${report.summary.slice(0,2).map(quote).join(', ')}`:''}.`;
}

export function composeUSDeepSections(input:{bundle:BrokerResearchBundle|null;stocks:USAttentionStock[];sectors:SectorMove[]}):DeepComposition {
  const sections:DeepSection[]=[],sources:DeepComposition['sources']=[],leadAddition:string[]=[];
  const briefs=input.bundle?.briefs??[];
  const commentary=briefParagraphs(briefs,'US');
  if(commentary.paragraphs.length){
    sections.push({key:'us-broker-commentary',title:'증권가가 본 간밤 뉴욕증시',intro:'국내 증권사가 이 거래일을 정리한 아침 리포트의 문장을 그대로 옮겼다. 해석은 각 증권사의 판단이다.',paragraphs:commentary.paragraphs});
    leadAddition.push(`${subject(commentary.first!.brief.report)} 이날 장을 ${quote(commentary.first!.text)}라고 요약했다.`);
  }
  const ranked=[...input.stocks].sort((a,b)=>(a.trendingRank??99)-(b.trendingRank??99)||(a.mostActiveRank??99)-(b.mostActiveRank??99)).slice(0,6);
  let titleFocus:string|null=null;
  if(ranked.length){
    const mentions=(stock:USAttentionStock)=>briefs.flatMap(brief=>brief.statements.filter(item=>item.region==='US'&&(stock.koreanName&&item.text.includes(stock.koreanName)||item.text.includes(stock.symbol))).map(item=>({item,brief})))[0];
    const paragraphs=ranked.map(stock=>{
      const rank=[stock.trendingRank?`야후 파이낸스 검색 상위 ${stock.trendingRank}위`:'',stock.mostActiveRank?`대형주 거래량 상위 ${stock.mostActiveRank}위`:''].filter(Boolean).join(', ');
      const linked=mentions(stock);
      const name=displayName(stock),particle=josa(name,'은','는').slice(name.length);
      return {text:`${name}(${stock.symbol})${particle} ${usd(stock.close)}달러로 마감해 전 거래일보다 ${absPct(stock.changePct)} ${moveWord(stock.changePct)}했다(${rank}).${linked?` ${josa(linked.brief.report.broker,'은','는')} ${quote(linked.item.text)}라고 설명했다.`:''}`,...(linked?{source:reportSource(linked.brief.report)}:{})};
    });
    sections.push({key:'us-attention',title:'투자자 관심이 몰린 종목',intro:'야후 파이낸스에서 많이 검색된 종목과 시가총액 200억 달러 이상 거래량 상위 종목의 해당 거래일 종가 기준 등락이다.',paragraphs});
    const focus=ranked.find(stock=>Math.abs(stock.changePct)>=3)??ranked[0]!;
    titleFocus=`${displayName(focus)} ${Math.abs(focus.changePct).toFixed(Math.abs(focus.changePct)>=10?0:1)}% ${moveWord(focus.changePct)}`;
    leadAddition.push(`투자자 관심이 가장 높았던 종목 가운데 ${josa(displayName(focus),'은','는')} ${absPct(focus.changePct)} ${moveWord(focus.changePct)}했다.`);
  }
  if(input.sectors.length>=6){
    const best=input.sectors[0]!,worst=input.sectors.at(-1)!,up=input.sectors.filter(item=>item.changePct>0.005).length;
    sections.push({key:'us-sectors',title:'업종별 흐름',intro:'S&P 500 업종을 추종하는 SPDR 업종 ETF 11종의 해당 거래일 종가 기준 등락이다.',paragraphs:[
      {text:`11개 업종 가운데 ${up}개가 올랐다. 가장 강한 업종은 ${best.label}(${best.symbol}, ${signedPct(best.changePct)}), 가장 약한 업종은 ${worst.label}(${worst.symbol}, ${signedPct(worst.changePct)})였다.`},
      {text:input.sectors.map(item=>`${item.label} ${signedPct(item.changePct)}`).join(' · ')},
    ]});
  }
  const rateDigests=briefs.flatMap(brief=>brief.digests.filter(item=>/FOMC|연준|금리|국채|Fed|美/.test(item.heading)).map(item=>({item,brief}))).slice(0,2);
  const economy=(input.bundle?.economy??[]).filter(item=>/FOMC|연준|금리|미국|美|달러|물가|고용|Fed/.test(item.title)).slice(0,3);
  if(rateDigests.length||economy.length){
    sections.push({key:'us-rates-research',title:'금리·통화정책에 대한 증권가 시각',paragraphs:[...rateDigests.map(({item,brief})=>digestParagraph(item,brief)),...economy.map(report=>({text:ratingSentence(report),source:reportSource(report)}))]});
  }
  for(const brief of briefs)if(sections.some(section=>section.paragraphs.some(p=>p.source?.url===brief.report.url)))sources.push(sourceEntry(brief.report));
  for(const report of economy)sources.push(sourceEntry(report));
  return {sections,leadAddition,titleFocus,sources:[...new Map(sources.map(item=>[item.url,item])).values()]};
}

export function composeKoreaDeepSections(input:{bundle:BrokerResearchBundle|null;searchTop:KoreaSearchStock[]}):DeepComposition {
  const sections:DeepSection[]=[],sources:DeepComposition['sources']=[],leadAddition:string[]=[];
  const briefs=input.bundle?.briefs??[],companyReports=input.bundle?.company??[];
  const commentary=briefParagraphs(briefs,'KOREA',3,3);
  if(commentary.paragraphs.length){
    sections.push({key:'korea-broker-commentary',title:'증권가가 본 전일 국내 증시',intro:'국내 증권사가 전일 장을 정리한 아침 리포트의 문장을 그대로 옮겼다. 원인에 대한 해석은 각 증권사의 판단이다.',paragraphs:commentary.paragraphs});
    leadAddition.push(`${subject(commentary.first!.brief.report)} ${quote(commentary.first!.text)}라고 정리했다.`);
  }
  const digests=briefs.flatMap(brief=>brief.digests.map(item=>({item,brief})));
  const companyDigest=(name:string)=>digests.find(({item})=>item.heading.replace(/\s+/g,'').includes(name.replace(/\s+/g,'')));
  let titleFocus:string|null=null;
  if(input.searchTop.length){
    const paragraphs:DeepParagraph[]=input.searchTop.map(stock=>{
      const report=companyReports.find(item=>item.stockCode===stock.code),digest=companyDigest(stock.name);
      const research=report?` ${ratingSentence(report)}`:digest?` ${digestParagraph(digest.item,digest.brief).text}`:'';
      return {text:`검색 ${stock.rank}위 ${josa(stock.name,'은','는')} ${won(stock.close)}원으로 마감해 ${absPct(stock.changePct)} ${moveWord(stock.changePct)}했다.${research}`,...(report?{source:reportSource(report)}:digest?{source:reportSource(digest.brief.report)}:{})};
    });
    sections.push({key:'korea-search-top',title:'검색 상위 종목과 증권사 의견',intro:'네이버페이 증권에서 투자자 검색이 많은 종목의 전일 종가와, 해당 종목에 대한 최근 증권사 리포트다.',paragraphs});
    const top=input.searchTop[0]!;titleFocus=`검색 1위 ${top.name} ${Math.abs(top.changePct).toFixed(1)}% ${moveWord(top.changePct)}`;
    leadAddition.push(`투자자 검색 1위 ${josa(top.name,'은','는')} ${absPct(top.changePct)} ${moveWord(top.changePct)}했다.`);
  }
  const shown=new Set(input.searchTop.map(item=>item.code));
  const reviewDigests=digests.filter(({item})=>/Review|Preview|실적|목표주가|리뷰/.test(item.heading)&&!input.searchTop.some(stock=>item.heading.replace(/\s+/g,'').includes(stock.name.replace(/\s+/g,'')))).slice(0,4);
  const otherReports=[...new Map(companyReports.filter(item=>item.stockCode&&!shown.has(item.stockCode)&&(item.targetPrice||item.rating)).map(item=>[item.stockCode,item])).values()].slice(0,5);
  if(reviewDigests.length||otherReports.length){
    sections.push({key:'korea-company-research',title:'증권사 기업 리포트',intro:'최근 증권사들이 공개한 기업 분석 리포트의 투자의견·목표주가와 핵심 문장이다.',paragraphs:[...reviewDigests.map(({item,brief})=>digestParagraph(item,brief)),...otherReports.map(report=>({text:`${report.company}: ${ratingSentence(report)}`,source:reportSource(report)}))]});
  }
  const strategy=digests.filter(({item})=>/전략|퀀틴전시|Strategy|시황|증시|KOSPI|코스피/.test(item.heading)).slice(0,1);
  const industry=(input.bundle?.industry??[]).filter(item=>!/daily|데일리|weekly|위클리|안녕하세요/i.test(item.title)).slice(0,4);
  if(strategy.length||industry.length){
    sections.push({key:'korea-strategy-industry',title:'전략·산업 리포트',paragraphs:[...strategy.map(({item,brief})=>digestParagraph(item,brief)),...industry.map(report=>({text:`${subject(report)} ${koreanDateLabel(report.date)} 산업 리포트 「${report.title}」를 냈다.${report.summary.length?` 요약: ${report.summary.slice(0,2).map(quote).join(', ')}.`:''}`,source:reportSource(report)}))]});
  }
  const used=new Set(sections.flatMap(section=>section.paragraphs.map(p=>p.source?.url).filter(Boolean)));
  for(const report of [...briefs.map(item=>item.report),...companyReports,...industry])if(used.has(report.url))sources.push(sourceEntry(report));
  return {sections,leadAddition,titleFocus,sources:[...new Map(sources.map(item=>[item.url,item])).values()]};
}

export {indexMove};
