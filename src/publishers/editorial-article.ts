import type {AIIntelligenceDailyViewModel,KoreaMarketDailyViewModel,USMarketDailyViewModel,DailyMasterRenderResult} from '../intelligence/daily-masters.js';
import type {NewsletterSourceLink} from '../intelligence/newsletter.js';
import {MOTUS_DISPLAY_NAME} from '../content/publisher-schema.js';
import {renderMarketTrendSection} from './motus.js';
import {assertNewsletterPublicHtmlSafe} from './motus-newsletter.js';

const BODY='font-family:Arial,&quot;Noto Sans KR&quot;,sans-serif;color:#172033;line-height:1.78;font-size:17px;width:100%;max-width:820px;box-sizing:border-box;margin:0 auto;overflow-x:hidden;overflow-wrap:anywhere';
const SECTION='width:100%;max-width:100%;box-sizing:border-box;margin:26px 0 0';
const HEADING='margin:0 0 12px;padding:0 0 8px;border-bottom:2px solid #173a63;color:#03162e;font-size:clamp(19px,4.8vw,23px);line-height:1.35;font-weight:850;word-break:keep-all;overflow-wrap:normal';
const LINK='color:#0759a6;text-decoration:underline;text-underline-offset:2px;font-weight:700;overflow-wrap:anywhere';

export const BLOGGER_EDITORIAL_MASTER={id:'BLOGGER_EDITORIAL_ARTICLE',version:'4Q.1.0',defaultForNewPublications:true,forbiddenPublicLabels:['왜 중요한가','무슨 일이 있었나','산업 연결','시장 연결','핵심 내용']} as const;
export const BLOGGER_EDITORIAL_CATEGORIES={
  AI_INTELLIGENCE:{canonicalLabel:'ai-intelligence',publicLabel:'AI 인텔리전스'},
  US_MARKET:{canonicalLabel:'us-market',publicLabel:'미국증시'},
  KOREA_MARKET:{canonicalLabel:'korea-market',publicLabel:'국내증시'}
} as const;

/* ---- 2026-11-04 owner-approved article design: typed sections, charts for prices, a broker panel, a key-points box ---- */
const C={navy:'#0b2545',ink:'#16202e',muted:'#566476',line:'#dbe2ea',navySoft:'#e8eef6',gold:'#a8822e',goldSoft:'#fbf5e6',goldLine:'#e6d2a0',up:'#c62828',down:'#1f5fbf',news:'#3b5b7a',newsSoft:'#f1f5f9'};
type Role='data'|'news'|'broker'|'analysis'|'watch';
const TAGS:Record<Role,[string,string]>={data:['데이터',`background:${C.navySoft};color:${C.navy}`],news:['뉴스·공식 발표',`background:${C.newsSoft};color:${C.news};border:1px solid #cdd8e3`],broker:['증권가 리포트',`background:${C.gold};color:#fff`],analysis:['MOTUS 분석',`background:#f2f4f7;color:#2b3a4c;border:1px solid #cfd6df`],watch:['체크포인트',`background:#fff;color:${C.navy};border:1px solid ${C.navy}`]};
/** Escaped text with every figure in bold: a signed change in red (+) or blue (-), a level or unsigned figure in ink. */
export function emph(value:string):string {
  // An unsigned change takes its colour from the verb that follows it (3.06% 하락 → blue, 29.97% 급등 → red).
  return esc(value).replace(/(^|[\s(·,:“‘;~])([+\-−]?\d[\d,]*(?:\.\d+)?)(\s?(?:%p|%|bps|bp|억원|조원|원|달러))(?=(?:으로|로|을|를|이|가|은|는|의|대|에|씩|까지)?(?![가-힣A-Za-z]))(?=(?:으로|로|을|를|이|가|은|는|의)?(\s?(?:상승|급등|올랐|오른|반등|하락|급락|내렸|내린|떨어))?)/g,(_match,lead:string,number:string,unit:string,verb?:string)=>{
    const color=/^[+]/.test(number)?C.up:/^[\-−]/.test(number)?C.down:/%/.test(unit)&&verb?(/상승|급등|올랐|오른|반등/.test(verb)?C.up:C.down):C.ink;return `${lead}<b style="color:${color};font-weight:800;white-space:nowrap">${number}${unit}</b>`});
}
function heading(title:string,role?:Role){const tag=role?`<span style="font-size:12px;font-weight:800;letter-spacing:.03em;padding:3px 8px;border-radius:3px;white-space:nowrap;${TAGS[role][1]}">${TAGS[role][0]}</span>`:'';return `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:2px solid ${C.navy};padding-bottom:7px;margin:0 0 12px"><h2 style="margin:0;font-size:clamp(19px,4.8vw,22px);line-height:1.35;font-weight:900;color:${C.navy};word-break:keep-all">${esc(title)}</h2>${tag}</div>`}
function roleSection(title:string,content:string,role?:Role,key?:string){return `<section${key?` data-section="${attr(key)}"`:''} style="${SECTION}">${heading(title,role)}${content}</section>`}
const intro=(value?:string)=>value?`<p style="margin:0 0 12px;color:${C.muted};font-size:15px">${esc(value)}</p>`:'';
const sourceLink=(source?:{label:string;url:string;kind?:'article'})=>source&&/^https:\/\//.test(source.url)?` <a href="${attr(source.url)}" target="_blank" rel="nofollow noopener noreferrer" style="${LINK};font-size:14px">${source.kind==='article'?'[기사 원문]':'[리포트 원문]'}</a>`:'';
const prose=(values:string[])=>values.map(value=>value.trim()).filter(Boolean).map(value=>`<p style="margin:0 0 13px">${emph(value)}</p>`).join('');
/** Horizontal bars of signed changes on one scale, labelled with the printed value (red up, blue down). */
export function barsSvg(rows:Array<{label:string;value:number}>):string {
  const data=rows.filter(row=>Number.isFinite(row.value));if(data.length<2)return '';
  const width=360,rowH=24,labelW=128,valueW=54,max=Math.max(...data.map(row=>Math.abs(row.value)),0.01),neg=data.some(row=>row.value<0),pos=data.some(row=>row.value>0);
  const plotL=labelW+(neg?valueW:6),plotR=width-(pos?valueW:6),half=neg&&pos?(plotR-plotL)/2:plotR-plotL,zero=neg&&pos?plotL+half:neg?plotR:plotL;
  const height=data.length*rowH+8,out=[`<svg viewBox="0 0 ${width} ${height}" width="100%" style="display:block;max-width:100%" xmlns="http://www.w3.org/2000/svg" role="img"><line x1="${zero}" x2="${zero}" y1="2" y2="${height-2}" stroke="#9aa6b2" stroke-width="1"/>`];
  data.forEach((row,index)=>{const y=4+index*rowH,length=Math.max(1,half*Math.abs(row.value)/max),x=row.value>=0?zero:zero-length,color=row.value>0?C.up:row.value<0?C.down:'#8a96a3',label=row.label.length>10?row.label.slice(0,9)+'…':row.label,text=`${row.value>0?'+':row.value<0?'-':''}${Math.abs(row.value).toFixed(2)}%`;
    out.push(`<text x="${labelW-6}" y="${y+15}" font-size="12" text-anchor="end" fill="${C.ink}">${esc(label)}</text><rect x="${x.toFixed(1)}" y="${y+4}" width="${length.toFixed(1)}" height="14" fill="${color}"/><text x="${(row.value>=0?x+length+4:x-4).toFixed(1)}" y="${y+15}" font-size="11.5" font-weight="700" text-anchor="${row.value>=0?'start':'end'}" fill="${color}">${text}</text>`)});
  out.push('</svg>');return `<div data-visualization="change-bars" style="border:1px solid ${C.line};padding:10px 10px 4px;margin:0 0 12px">${out.join('')}</div>`;
}
/** Key figures as tiles: label, value and the change in colour. */
function tiles(items:Array<{label:string;value:string;change?:string|null}>){return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;margin:0 0 12px">${items.map(item=>{const color=/^\s*[+]/.test(item.change??'')?C.up:/^\s*[-−]/.test(item.change??'')?C.down:C.muted;return `<div style="border:1px solid ${C.line};padding:9px 11px;min-width:0"><div style="font-size:13px;color:${C.muted};word-break:keep-all">${esc(item.label)}</div><div style="font-size:19px;font-weight:800;color:${C.ink};white-space:nowrap">${esc(item.value)}</div>${item.change?`<div style="font-size:14px;font-weight:800;color:${color};white-space:nowrap">${esc(item.change)}</div>`:''}</div>`}).join('')}</div>`}
function keyPoints(items:string[]){const list=items.map(item=>item.trim()).filter(Boolean).slice(0,3);if(!list.length)return '';return `<div data-section="key-points" style="border:1.5px solid ${C.navy};padding:13px 15px 5px;margin:0 0 6px"><div style="font-size:13px;font-weight:800;color:${C.navy};letter-spacing:.05em;margin:0 0 8px">오늘의 핵심</div>${list.map((item,index)=>`<p style="margin:0 0 9px;font-size:16px;line-height:1.65;display:flex;gap:8px"><span style="color:${C.gold};font-weight:800">${index+1}</span><span>${emph(item)}</span></p>`).join('')}</div>`}
function checklist(items:string[]){return `<div style="display:grid;gap:9px">${items.filter(Boolean).map(item=>{const [head,...rest]=item.split(/:\s/);return `<p style="margin:0;display:flex;gap:10px;align-items:flex-start"><span style="flex:0 0 14px;height:14px;border:2px solid ${C.navy};margin-top:6px"></span><span>${rest.length?`<b style="color:${C.navy}">${esc(head!)}:</b> ${emph(rest.join(': '))}`:emph(item)}</span></p>`}).join('')}</div>`}
function analysisBox(values:string[]){const text=prose(values);return text?`<div style="background:#f5f7fa;border:1px solid #d8dee6;padding:12px 14px 1px">${text}</div>`:''}
function newsCard(head:string,body:string[],meta?:string,reading?:string|null){return `<div style="border:1px solid ${C.line};border-left:4px solid ${C.news};padding:12px 14px;margin:0 0 12px">${meta?`<div style="font-size:13px;color:${C.muted}">${esc(meta)}</div>`:''}<div style="font-size:18px;font-weight:800;line-height:1.45;margin:2px 0 6px;word-break:keep-all">${esc(head)}</div>${body.filter(Boolean).map(value=>`<p style="margin:0 0 8px;font-size:16px">${emph(value)}</p>`).join('')}${reading?`<div style="margin-top:6px;background:#f5f7fa;padding:8px 10px;font-size:15px"><b style="color:${C.navy}">MOTUS 분석:</b> ${emph(reading.replace(/^MOTUS 분석:\s*/,''))}</div>`:''}</div>`}
/** Buy-type ratings in red, sell-type in blue, others neutral. */
const ratingColor=(rating:string)=>/buy|매수|outperform|overweight|비중확대|strong/i.test(rating)?C.up:/sell|매도|underperform|underweight|비중축소|reduce/i.test(rating)?C.down:C.muted;
/** A broker paragraph as a card: a report card (company, broker, rating and target chips) or a quoted comment. */
function brokerCard(p:{text:string;source?:{label:string;url:string;kind?:'article'};report?:import('../intelligence/daily-masters.js').ArticleReportCard}){
  if(p.report){const r=p.report,who=[r.broker,r.analysts].filter(Boolean).join(' ')+(r.date?` · ${Number(r.date.slice(5,7))}월 ${Number(r.date.slice(8,10))}일`:''),summary=p.text.includes('요약:')?p.text.slice(p.text.indexOf('요약:')+3).trim():'',head=/^검색 \d+위/.test(p.text)?p.text.split(/(?<=했다\.)\s/)[0]:'';
    const chips=[r.rating?`<span style="font-size:13px;padding:2px 9px;border:1.5px solid ${ratingColor(r.rating)};color:${ratingColor(r.rating)};font-weight:800;border-radius:999px">${esc(r.rating)}</span>`:'',r.target?`<span style="font-size:13px;padding:2px 9px;border:1px solid ${C.line};font-weight:800;border-radius:999px;white-space:nowrap">목표주가 ${esc(r.target)}원</span>`:''].filter(Boolean).join(' ');
    return `<div style="background:#fff;border:1px solid ${C.goldLine};padding:12px 14px;margin:0 0 10px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline"><b style="font-size:18px;color:${C.ink}">${esc(r.company??r.title)}</b><span style="font-size:13px;color:${C.muted}">${esc(who)}</span></div>${chips?`<div style="margin:8px 0">${chips}</div>`:''}${head?`<p style="margin:0 0 6px;font-size:15.5px">${emph(head)}</p>`:''}<div style="border-left:3px solid ${C.gold};padding:1px 0 1px 10px;font-size:15.5px;color:#2b2a26">${summary?emph(summary):`「${esc(r.title)}」`}</div>${sourceLink(p.source)}</div>`}
  return `<div style="background:#fff;border:1px solid ${C.goldLine};border-left:4px solid ${C.gold};padding:11px 14px;margin:0 0 10px;font-size:16px">${emph(p.text)}${sourceLink(p.source)}</div>`;
}
/** A composed section, set apart by its role. A section whose text is a single short line is not printed. */
export function deepSection(input:import('../intelligence/daily-masters.js').ArticleDeepSection):string {
  let item=input;
  const paragraphs=item.paragraphs.filter(p=>p.text.trim());const total=paragraphs.map(p=>p.text).join(' ').length;
  // Sections composed before roles existed (stored units, republishes) get their role from the section key.
  const role=item.role??(/causes|issue|broker/.test(item.key)?'broker':/stocks/.test(item.key)?'data':/risks/.test(item.key)?'watch':undefined);
  if(!paragraphs.length||(paragraphs.length===1&&total<60&&role!=='data'&&role!=='broker'&&!item.bars))return '';
  if(!item.bars&&role==='data'){const list=paragraphs.find(p=>(p.text.match(/ · /g)??[]).length>=2);if(list){const rows=list.text.split(' · ').map(part=>{const match=part.match(/^(.*\S)\s+([+\-−]?\d+(?:\.\d+)?)%$/);return match?{label:match[1]!,value:Number(match[2]!.replace('−','-'))}:null});if(rows.every(Boolean))item={...item,bars:rows as Array<{label:string;value:number}>}}}
  let body=intro(item.intro);
  if(role==='broker')body=`<div style="background:${C.goldSoft};border:1px solid ${C.goldLine};padding:12px 12px 2px">${item.intro?`<p style="margin:0 0 10px;color:#6b5a2f;font-size:14px">${esc(item.intro)}</p>`:''}${paragraphs.map(brokerCard).join('')}</div>`;
  else if(role==='watch')body+=checklist(paragraphs.map(p=>p.text));
  else if(role==='news')body+=paragraphs.map(p=>`<div style="border:1px solid ${C.line};border-left:4px solid ${C.news};padding:11px 14px;margin:0 0 10px">${emph(p.text)}${sourceLink(p.source)}</div>`).join('');
  else{
    // A chart replaces the '·'-joined list of the same figures; other paragraphs stay as text.
    const chart=item.bars?barsSvg(item.bars):'',rest=chart?paragraphs.filter(p=>(p.text.match(/ · /g)??[]).length<2&&!/^업종별 등락:/.test(p.text)):paragraphs;
    body+=chart+rest.map(p=>`<p style="margin:0 0 13px">${emph(p.text)}${sourceLink(p.source)}</p>`).join('');
  }
  return roleSection(item.title,body,role,item.key);
}

export function renderAIEditorialArticle(view:AIIntelligenceDailyViewModel):DailyMasterRenderResult {
  const deep=view.deepSections??[],seen=new Set<string>([normalized(view.todayCore.summary)]),parts=[masthead(view.title,view.subtitle,view.displayLabel,view.issueDate),lead(view.todayCore.summary)];
  const stocks=deep.find(item=>item.key==='ai-stocks'),research=deep.find(item=>item.key==='ai-broker-research'),firstCard=research?.paragraphs.find(p=>p.report?.target)?.report;
  parts.push(keyPoints([stocks?.paragraphs[0]?.text??'',view.issues.length?`공식 발표: ${view.issues.slice(0,3).map(issue=>issue.headline).join(' / ')}.`:'',firstCard?`증권가: ${firstCard.company??firstCard.title} 목표주가 ${firstCard.target}원(${firstCard.broker}${firstCard.rating?`, ${firstCard.rating}`:''}) 등 AI 수요 리포트 ${research!.paragraphs.length}건.`:'']));
  for(const item of deep.filter(item=>item.placement==='early'))parts.push(deepSection(item));
  // With the day's market issue explained by brokers, official announcements are reported as facts only.
  const issueLed=deep.some(item=>item.key==='ai-issue');
  const cards=view.issues.map(issue=>{const facts=uniqueProse([...issue.whatHappened,issue.coreContent],seen);return facts.length?newsCard(issue.headline,facts,undefined,issueLed?null:[issue.whyItMatters,issue.marketConnection&&issue.marketConnection!==issue.whyItMatters?issue.marketConnection:null].filter(Boolean).join(' ')||null):''}).filter(Boolean);
  if(cards.length)parts.push(roleSection('오늘의 AI 발표',cards.join(''),'news','ai-issues'));
  for(const item of deep.filter(item=>item.placement!=='early'))parts.push(deepSection(item));
  // Connections and watch points become one checklist; a one-line 'path' section on its own is not printed.
  if(!issueLed){
    // Industry connections stay as a MOTUS reading when they say more than one line; watch points become one checklist.
    const connections=uniqueProse(view.industryConnections.map(item=>item.explanation),seen);
    if(connections.join(' ').length>=60)parts.push(roleSection('기업 AI가 실제 업무로 들어가는 경로',analysisBox(connections),'analysis','ai-connections'));
    const watch=uniqueProse([...view.whatToWatch.map(item=>`${item.headline}: ${item.watchFor}`),...view.industryConnections.map(item=>item.optionalWatchPoint??''),...(connections.join(' ').length<60?connections:[])].filter(Boolean),seen);
    if(watch.length)parts.push(roleSection('앞으로 확인할 것',checklist(watch),'watch','ai-watch'));
  }
  parts.push(sources(view.sources));return finish('ai-intelligence',view.title,BLOGGER_EDITORIAL_CATEGORIES.AI_INTELLIGENCE.publicLabel,parts.filter(Boolean),['masthead','lead','key-points','issues','watch','sources']);
}

export function renderUSEditorialArticle(view:USMarketDailyViewModel):DailyMasterRenderResult {
  const terms=new Set<string>();const describe=(value:string)=>explainTerms(value.replace('U.S. 10Y Treasury Yield (미국 10년물 국채금리)','미국 10년물 국채금리'),terms);
  const parts=[masthead(view.title,view.subtitle,view.displayLabel,view.issueDate),lead(describe([view.marketSummary,...view.marketCommentary].join(' ')))];
  const deep=view.deepSections??[],place=(where:'early'|'late'|'risks')=>deep.filter(item=>(item.placement??'early')===where).map(deepSection).filter(Boolean);
  const names:Record<string,string>={sp500:'S&P 500',nasdaq:'나스닥','dow-jones':'다우존스','russell-2000':'러셀 2000'};
  const idx=view.marketHistory.series.filter(item=>names[item.key]&&Number.isFinite(item.latestChangePct)).map(item=>`${names[item.key]} ${item.latestChangePct>0?'+':item.latestChangePct<0?'-':''}${Math.abs(item.latestChangePct).toFixed(2)}%`);
  const ten=view.supportingMetrics.find(item=>/10년물|10Y/.test(item.label)),sectors=deep.find(item=>item.key==='us-sectors-stocks')?.bars;
  const sorted=sectors?[...sectors].sort((a,b)=>b.value-a.value):[];
  parts.push(keyPoints([idx.length?`지수: ${idx.join(', ')}.`:'',ten?`미국 10년물 국채금리 ${ten.value}${ten.change?`(${ten.change})`:''}.`:'',sorted.length>=2?`업종: ${sorted[0]!.label} ${sorted[0]!.value>0?'+':''}${sorted[0]!.value.toFixed(2)}%로 가장 강했고 ${sorted.at(-1)!.label} ${sorted.at(-1)!.value>0?'+':''}${sorted.at(-1)!.value.toFixed(2)}%로 가장 약했다.`:'']));
  parts.push(...place('early'));
  const period=view.marketHistory.sessionCount>=60?'3개월':`${view.marketHistory.sessionCount}거래일`;
  parts.push(renderMarketTrendSection(view.marketHistory).replace('미국 주요 증시 추이',`미국 주요지수 ${period} 흐름`));
  if(view.supportingMetrics.length)parts.push(roleSection('금리·달러·변동성',tiles(view.supportingMetrics.map(item=>({label:describe(item.label),value:item.value,change:item.change??null}))),'data','us-macro'));
  if(view.narrative?.facts.length)parts.push(roleSection('지수별 흐름과 위치',prose(view.narrative.facts),'data','us-index-facts'));
  if(view.narrative?.analysis.length)parts.push(roleSection('MOTUS 분석',analysisBox(view.narrative.analysis),'analysis','us-analysis'));
  parts.push(...place('late'));
  if(view.sectorsCompanies.length)parts.push(roleSection('종목과 업종에서 읽힌 신호',prose(view.sectorsCompanies),'data'));
  if(view.marketResearch?.length)parts.push(renderMarketResearchEntries(view.marketResearch,view.issueDate));
  const risks=place('risks');
  if(risks.length)parts.push(...risks);else if(view.checkpoints.length)parts.push(roleSection('다음 거래일',checklist(view.checkpoints.map(item=>`${item.headline}: ${item.watchFor}`)),'watch'));
  parts.push(sources(view.sources));return finish('us-market',view.title,BLOGGER_EDITORIAL_CATEGORIES.US_MARKET.publicLabel,parts.filter(Boolean),['masthead','lead','key-points','charts','macro','companies','research','watch','sources']);
}

const metricValue=(value:string)=>{const number=Number(value.replace(/[^0-9.+\-−]/g,'').replace('−','-'));return Number.isFinite(number)?number:Number.NaN};
export function renderKoreaEditorialArticle(view:KoreaMarketDailyViewModel):DailyMasterRenderResult {
  const parts=[masthead(view.title,view.subtitle,view.displayLabel,view.issueDate),lead(view.marketSummary)];
  const deep=view.deepSections??[],place=(where:'early'|'late'|'risks')=>deep.filter(item=>(item.placement??'early')===where).map(deepSection).filter(Boolean);
  const top=deep.find(item=>item.key==='korea-stocks')?.bars?.[0];
  parts.push(keyPoints([view.indexMetrics.length?`지수: ${view.indexMetrics.map(item=>`${item.label} ${item.displayValue}`).join(', ')}.`:'',view.investorFlows.length?`수급: ${view.investorFlows.map(item=>`${item.label} ${item.displayValue}`).join(', ')}.`:'',top?`검색 1위 ${top.label} ${top.value>0?'+':top.value<0?'-':''}${Math.abs(top.value).toFixed(2)}%.`:'']));
  parts.push(...place('early'));
  if(view.marketCommentary.length&&!deep.length)parts.push(roleSection(view.edition==='PREVIOUS_SESSION_MORNING'?'전일 장을 읽는 기준':'마감 흐름을 읽는 기준',prose(view.marketCommentary)));
  // The index change is the one the narrative states for that index ('코스피는 … 전 거래일보다 3.59% 하락').
  const changeOf=(label:string)=>{const name=/KOSPI/i.test(label)?'코스피':/KOSDAQ/i.test(label)?'코스닥':null;if(!name)return null;const match=(view.narrative?.facts??[]).join(' ').match(new RegExp(`${name}(?:은|는) [\\d,.]+(?:으로|로) 마감해 전 거래일보다 ([\\d.]+)% (상승|하락)`));return match?`${match[2]==='상승'?'+':'-'}${match[1]}%`:null};
  const tileOf=(item:{label:string;displayValue:string})=>{const match=item.displayValue.match(/^(.*?)\s*\(([^)]*)\)\s*$/);return {label:item.label,value:match?match[1]!:item.displayValue,change:match?match[2]!:changeOf(item.label)}};
  if(view.indexMetrics.length||view.fxAndSupporting.length)parts.push(roleSection('코스피·코스닥·환율',tiles([...view.indexMetrics,...view.fxAndSupporting].map(tileOf))+(view.narrative?.facts.length?prose(view.narrative.facts):''),'data','korea-indexes'));
  if(view.investorFlows.length)parts.push(roleSection('투자자별 순매수',flow(view.investorFlows.map(item=>({label:item.label,displayValue:item.displayValue,direction:item.direction}))),'data','korea-flows'));
  const bars=(rows:Array<{label:string;displayValue:string}>)=>rows.map(item=>({label:item.label,value:metricValue(item.displayValue.replace(/^.*\(([^)]*)\).*$/,'$1'))})).filter(item=>Number.isFinite(item.value));
  if(view.sectors.length){const chart=barsSvg(bars(view.sectors));parts.push(roleSection('업종별 등락',chart||metricProse(view.sectors),'data','korea-sectors'))}
  const ordinaryMovers=view.movers.filter(item=>!isStructuredLeveragedProduct(item.label));
  if(ordinaryMovers.length){const chart=barsSvg(bars(ordinaryMovers));parts.push(roleSection('주요 종목 흐름',chart||metricProse(ordinaryMovers),'data','korea-movers'))}
  if(view.narrative?.analysis.length)parts.push(roleSection('MOTUS 분석',analysisBox(view.narrative.analysis),'analysis','korea-analysis'));
  parts.push(...place('late'));
  if(view.marketResearch?.length)parts.push(renderMarketResearchEntries(view.marketResearch,view.operationDate??view.issueDate));
  const risks=place('risks');
  if(risks.length)parts.push(...risks);else if(view.checkpoints.length)parts.push(roleSection(view.edition==='PREVIOUS_SESSION_MORNING'?'오늘 체크포인트':'다음 거래일',checklist(view.checkpoints.map(item=>`${item.headline}: ${item.watchFor}`)),'watch'));
  if(view.marketCommentary.length&&deep.length)parts.push(roleSection('자료 기준',`<div style="font-size:14px;color:${C.muted}">${prose(view.marketCommentary)}</div>`));
  parts.push(sources(view.sources));return finish('korea-market',view.title,BLOGGER_EDITORIAL_CATEGORIES.KOREA_MARKET.publicLabel,parts.filter(Boolean),['masthead','lead','key-points','indexes','fx','flows','sectors','research','watch','sources']);
}

/** Show what the publisher actually published, without manufacturing a brokerage opinion.
 * Report dates older than a week are reference context, never same-session commentary. */
export function renderMarketResearchEntries(entries:ReadonlyArray<{publisher:string;headline:string;url:string;publishedAt:string;kind:'FINANCIAL_MEDIA'|'BROKER_RESEARCH';evidence?:string[]}>,issueDate:string):string {
 const issued=Date.parse(issueDate+'T23:59:59Z');
 // Material older than a week is not about this session and only crowds the article.
 const filtered=entries.filter(item=>/^https:\/\/[^\s]+$/.test(item.url)&&Number.isFinite(Date.parse(item.publishedAt))&&Date.parse(item.publishedAt)<=issued&&issued-Date.parse(item.publishedAt)<=8*86400000);
 const make=(kind:'FINANCIAL_MEDIA'|'BROKER_RESEARCH')=>{
  const rows=filtered.filter(item=>item.kind===kind&&item.headline.trim().length>=8);if(!rows.length)return '';
  const list=rows.map(item=>{
   const age=Math.floor((issued-Date.parse(item.publishedAt))/86400000),older=age>7;
   const title=item.headline;
   return `<li style="margin:0 0 11px"><strong>${esc(item.publisher)}</strong> · ${esc(item.publishedAt.slice(0,10))}${older?' · 과거 자료':''}<div><a href="${attr(item.url)}" target="_blank" rel="nofollow noopener noreferrer" style="${LINK}">${esc(title)}</a></div>${kind==='BROKER_RESEARCH'&&item.evidence?.length?`<p style="margin:6px 0 0">공식 공개 요약: ${esc(item.evidence.slice(0,2).join(' / '))}</p>`:''}</li>`;
  }).join('');
  return roleSection(kind==='BROKER_RESEARCH'?'증권사 공개 리서치 자료':'금융 전문 언론 원문',`<p style="margin:0 0 12px">${kind==='BROKER_RESEARCH'?'증권사가 공식 사이트에 최근 일주일 안에 공개한 자료의 제목과 발행일이다.':'해외·국내 금융 매체가 같은 시기에 보도한 시장 기사다. 해외 기사는 원문 제목을 그대로 적었다.'}</p><ul style="margin:0;padding-left:20px">${list}</ul>`,kind==='BROKER_RESEARCH'?'broker':'news');
 };
 return make('BROKER_RESEARCH')+make('FINANCIAL_MEDIA');
}

function masthead(title:string,subtitle:string,label:string,date:string){return `<header style="width:100%;max-width:100%;box-sizing:border-box;background:#03162e;color:#fff;padding:26px 22px;margin:0 0 22px"><p style="margin:0 0 9px;color:#c7d8ea;font-size:14px;font-weight:800">${esc(MOTUS_DISPLAY_NAME)}</p><div role="heading" aria-level="2" style="font-size:clamp(25px,7vw,34px);line-height:1.22;font-weight:850;word-break:keep-all">${esc(title)}</div><p style="margin:10px 0 0;color:#e6edf5">${esc(subtitle)}</p><p style="margin:11px 0 0;color:#b7c8da;font-size:13px">${esc(label)} · ${esc(date)}</p></header>`;}
function lead(value:string){return `<p data-section="editorial-lead" style="margin:0 0 24px;font-size:18px;line-height:1.82;color:#172033">${esc(value)}</p>`;}
function section(title:string,content:string){return `<section style="${SECTION}"><h2 style="${HEADING}">${esc(title)}</h2>${content}</section>`;}
function paragraphs(values:string[]){return values.map(value=>value.trim()).filter(Boolean).map(value=>`<p style="margin:0 0 13px">${esc(value)}</p>`).join('');}
function uniqueProse(values:string[],seen:Set<string>):string[]{const result:string[]=[];for(const value of values){const key=normalized(value);if(!key||seen.has(key))continue;seen.add(key);result.push(value)}return result}
function normalized(value:string){return value.replace(/\s+/g,' ').trim()}
export function isStructuredLeveragedProduct(label:string):boolean {return /레버리지|인버스|선물단일종목|ETN|ETF|[23]X/i.test(label)}
function metricProse(values:Array<{label:string;displayValue:string}>){return `<p style="margin:0">${values.map(item=>`${esc(item.label)} ${esc(item.displayValue)}`).join(' · ')}</p>`;}
function flow(values:Array<{label:string;displayValue:string;direction:'UP'|'DOWN'|'FLAT'}>){const max=Math.max(...values.map(item=>Math.abs(Number(item.displayValue.replace(/[^0-9.-]/g,'')))),1);return `<div data-visualization="korea-investor-flow" style="width:100%;max-width:100%;box-sizing:border-box">${values.map(item=>{const size=Math.max(4,Math.round(Math.abs(Number(item.displayValue.replace(/[^0-9.-]/g,'')))/max*46));const color=item.direction==='UP'?'#c62828':item.direction==='DOWN'?'#1565c0':'#59697d';return `<div style="margin:0 0 12px;width:100%;max-width:100%;box-sizing:border-box"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>${esc(item.label)}</strong><span style="color:${color};font-weight:800">${esc(item.displayValue)}</span></div><div style="height:8px;background:#eef2f6"><span style="display:block;width:${size}%;height:100%;background:${color}"></span></div></div>`;}).join('')}</div>`;}
function sources(values:NewsletterSourceLink[]){const unique=[...new Map(values.map(item=>[item.url,item])).values()];return section('자료',`<ul style="margin:0;padding-left:20px">${unique.map(item=>`<li style="margin:5px 0"><a href="${attr(item.url)}" target="_blank" rel="nofollow noopener noreferrer" style="${LINK}">${esc(item.label)}</a></li>`).join('')}</ul>`);}
function finish(product:string,title:string,label:string,parts:string[],renderedSections:string[]):DailyMasterRenderResult {const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body><article data-product="motus-${product}" data-layout="editorial-article-4q" style="${BODY}">${parts.join('\n')}</article></body></html>`;assertNewsletterPublicHtmlSafe(html);for(const forbidden of BLOGGER_EDITORIAL_MASTER.forbiddenPublicLabels)if(new RegExp(`>${forbidden}<`).test(html))throw new Error(`forbidden public analytical label: ${forbidden}`);return {html,renderedSections,label};}
function esc(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}function attr(value:string){return esc(value).replace(/'/g,'&#39;');}
function explainTerms(value:string,seen:Set<string>):string {const terms:[string,string][]=[['VIX','VIX (변동성지수)'],['DXY','DXY (달러인덱스)'],['미국 10년물','미국 10년물 국채금리']];let output=value;for(const [term,label] of terms){if(seen.has(term))continue;if(output.includes(label)){seen.add(term);continue;}const index=output.indexOf(term);if(index<0)continue;output=`${output.slice(0,index)}${label}${output.slice(index+term.length)}`;seen.add(term);}return output;}

/** One weekly section (intro, table, links, quoted paragraphs) in the editorial style; also used to add a section to a published post. */
export function renderWeeklySection(item:import('../operations/weekly-review.js').WeeklySection):string {
  const table=(data:{headers:string[];rows:string[][];note?:string})=>`<div style="width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch"><table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.5;min-width:340px"><thead><tr>${data.headers.map(cell=>`<th style="text-align:left;padding:8px 10px;background:#eef3f9;color:#03162e;border-bottom:2px solid #173a63;white-space:nowrap">${esc(cell)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row=>`<tr>${row.map((cell,index)=>`<td style="padding:8px 10px;border-bottom:1px solid #dbe3ec;vertical-align:top;${index===0?'font-weight:700;white-space:nowrap;':''}${/^\$?[\d,.]+(?:원|%)?$/.test(cell)?'white-space:nowrap;':''}${/^[+-]\d|^[+-]?\d+bp$/.test(cell)?`white-space:nowrap;color:${cell.startsWith('-')?'#1f5fbf':cell.startsWith('+')?'#c62828':'#172033'};font-weight:700`:''}">${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${data.note?`<p style="margin:8px 0 0;color:#4a5a6e;font-size:13px">${esc(data.note)}</p>`:''}`;
  let body=item.intro?`<p style="margin:0 0 12px;color:#4a5a6e;font-size:15px">${esc(item.intro)}</p>`:'';
  if(item.table)body+=table(item.table);
  if(item.links?.length)body+=`<ul style="margin:0;padding-left:20px">${item.links.map(link=>`<li style="margin:0 0 10px"><span style="color:#4a5a6e;font-size:14px">${esc(link.meta)}</span><br><a href="${attr(link.url)}" style="${LINK}">${esc(link.label)}</a></li>`).join('')}</ul>`;
  const role:Role|undefined=/broker/.test(item.key)?'broker':item.key==='weekly-calendar'?'watch':item.key==='weekly-daily'?'news':item.table||item.key==='weekly-pdf'?'data':undefined;
  if(item.paragraphs?.length)body+=role==='broker'?`<div style="background:${C.goldSoft};border:1px solid ${C.goldLine};padding:12px 12px 2px">${item.paragraphs.map(brokerCard).join('')}</div>`:item.paragraphs.map(p=>`<p style="margin:0 0 13px">${emph(p.text)}${sourceLink(p.source)}</p>`).join('');
  return roleSection(item.title,body,role,item.key);
}

/** Weekly review: the same editorial masthead and sections as the daily articles, with tables for the numbers and the calendar. */
export function renderWeeklyEditorialArticle(view:import('../operations/weekly-review.js').WeeklyArticle):DailyMasterRenderResult {
  const parts=[masthead(view.title,view.subtitle,'주간 증시',view.weekEnd),lead(view.lead),...view.sections.map(renderWeeklySection)];
  parts.push(sources(view.sources.map(item=>({...item,publisher:''}))));
  return finish('weekly-intelligence',view.title,'주간 증시',parts,['masthead','lead',...view.sections.map(item=>item.key),'sources']);
}
