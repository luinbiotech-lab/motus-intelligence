import {
  MOTUS_BRAND,
  MOTUS_CATEGORIES,
  MOTUS_CTA_TEXT,
  MOTUS_DISPLAY_NAME,
  type GlobalContentMetadata,
  type MajorIndexHistory,
  type MajorIndexHistorySeries,
  type MotusCategory,
  type PublisherContentDocument
} from '../content/publisher-schema.js';

export interface MotusPublisherConfig {
  brand: typeof MOTUS_BRAND;
  displayName: typeof MOTUS_DISPLAY_NAME;
  baseUrl: string;
  ctaText: typeof MOTUS_CTA_TEXT;
  categories: MotusCategory[];
}

export interface MotusRenderedContent {
  html: string;
  labels: string[];
  relatedLinks: { title: string; url: string }[];
}

const ARTICLE_STYLE='font-family:Arial,&quot;Noto Sans KR&quot;,sans-serif;color:#172033;line-height:1.74;font-size:17px;width:100%;max-width:820px;box-sizing:border-box;margin:0 auto;overflow-x:hidden;overflow-wrap:anywhere';
const SECTION_STYLE='width:100%;max-width:100%;box-sizing:border-box;margin:22px 0 0';
const TITLE_STYLE='background:#03162e;color:#ffffff;border:1px solid #010b17;padding:13px 16px;font-size:clamp(18px,4.8vw,20px);font-weight:800;line-height:1.35;margin:0;width:100%;max-width:100%;box-sizing:border-box;word-break:keep-all;overflow-wrap:normal';
const SLATE_TITLE_STYLE='background:#17283d;color:#ffffff;border:1px solid #0b1522;padding:13px 16px;font-size:clamp(18px,4.8vw,20px);font-weight:800;line-height:1.35;margin:0;width:100%;max-width:100%;box-sizing:border-box;word-break:keep-all;overflow-wrap:normal';
const CONTENT_STYLE='border:1px solid #aebed2;padding:21px 22px;background:#ffffff;margin:0 0 22px;width:100%;max-width:100%;box-sizing:border-box';
const KOREA_CONTENT_STYLE='border:2px solid #8eabc9;padding:20px 22px;background:#edf4fb;margin:0 0 22px;width:100%;max-width:100%;box-sizing:border-box';
const SOURCE_LINK_STYLE='color:#0759a6;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px;font-weight:600;overflow-wrap:anywhere';

export function renderMotusBloggerContent(document:PublisherContentDocument,config:MotusPublisherConfig):MotusRenderedContent {
  validateMotusConfig(config);
  const article=markdownToHtml(document.markdown,document.marketHistory);
  const relatedLinks=document.glossary.filter(term=>isPublishedArticleUrl(term.publishedUrl)).slice(0,3).map(term=>({title:term.evergreenTitle,url:term.publishedUrl!}));
  const related=relatedLinks.length?`<div class="related" style="margin-top:14px;padding-top:10px;border-top:1px solid #dbe3ee;font-size:14px"><strong>관련 글</strong><ul>${relatedLinks.map(item=>`<li><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></div>`:'';
  const glossary=document.glossary.length?`<section class="editorial-block glossary" data-section="glossary" style="${SECTION_STYLE}"><h2 style="${TITLE_STYLE}">용어설명</h2><div class="editorial-content glossary-reference" style="${CONTENT_STYLE};background:#f1f5fa;font-size:14px;line-height:1.55"><table style="width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;box-sizing:border-box"><tbody>${document.glossary.slice(0,6).map(term=>`<tr class="glossary-row"><th scope="row" style="width:22%;padding:9px 8px;text-align:left;vertical-align:top;color:#03162e;font-size:14px;font-weight:800;border-bottom:1px solid #c9d5e3;overflow-wrap:anywhere">${escapeHtml(term.term)}</th><td style="width:36%;padding:9px 8px;vertical-align:top;color:#344860;font-size:14px;font-weight:600;border-bottom:1px solid #c9d5e3;overflow-wrap:anywhere">${escapeHtml(glossaryFullSpelling(term.term,term.fullSpelling))}</td><td style="width:42%;padding:9px 8px;vertical-align:top;color:#172033;font-size:14px;border-bottom:1px solid #c9d5e3;overflow-wrap:anywhere">${escapeHtml(dictionaryMeaning(term.explanation))}${isPublishedArticleUrl(term.publishedUrl)?` <a href="${escapeAttr(term.publishedUrl!)}" style="${SOURCE_LINK_STYLE}">${escapeHtml(term.evergreenTitle)}</a>`:''}</td></tr>`).join('')}</tbody></table>${related}</div></section>`:'';
  const sourceSection=renderSourceSection(document.sources);
  const tags=`<p class="hashtags" style="margin:22px 2px;color:#40516b;font-size:14px;overflow-wrap:anywhere">${document.hashtags.map(escapeHtml).join(' ')}</p>`;
  const html=`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(document.seoTitle)}</title>
  <meta name="description" content="${escapeAttr(document.metaDescription)}" />
  <meta name="keywords" content="${escapeAttr(document.hashtags.map(tag=>tag.replace(/^#/, '')).join(', '))}" />
</head>
<body>
  <article class="motus-editorial" data-channel="motus-blogger" data-layout="blogger-inline-v1" style="${ARTICLE_STYLE}">
${article}
${glossary}
${sourceSection}
${tags}
  </article>
</body>
</html>`;
  return {html,labels:buildLabels(document),relatedLinks};
}

function buildLabels(document:PublisherContentDocument):string[] {
  return unique([
    document.metadata.primaryCategory,
    ...document.metadata.categories,
    ...document.metadata.companies,
    ...document.metadata.sectors,
    ...document.metadata.themes,
    ...document.metadata.countries,
    ...document.metadata.regions,
    ...document.hashtags.map(tag=>tag.replace(/^#/,''))
  ]).slice(0,20);
}

function validateMotusConfig(config:MotusPublisherConfig):void {
  if(config.brand!==MOTUS_BRAND||config.displayName!==MOTUS_DISPLAY_NAME) throw new Error('invalid MOTUS publisher identity');
  if(config.ctaText!==MOTUS_CTA_TEXT) throw new Error('invalid MOTUS CTA');
  const base=new URL(config.baseUrl);
  if(base.protocol!=='https:'||base.hostname!=='motusnova.blogspot.com') throw new Error('invalid MOTUS Blogger target');
  if(MOTUS_CATEGORIES.some(category=>!config.categories.includes(category))) throw new Error('MOTUS publisher must support every required category');
}

function markdownToHtml(markdown:string,marketHistory?:MajorIndexHistory):string {
  const sections:{heading:string;lines:string[]}[]=[];
  let current:{heading:string;lines:string[]}|null=null;
  for(const line of markdown.split(/\r?\n/)) {
    if(line.startsWith('## ')) { if(current) sections.push(current); current={heading:line.slice(3),lines:[]}; }
    else if(current) current.lines.push(line);
  }
  if(current) sections.push(current);
  return sections.filter(section=>section.lines.some(line=>line.trim()&&!line.startsWith('### '))).map(section=>{
    const rendered=renderMarkdownSection(section.heading,section.lines);
    return section.heading==='시장 한눈에 보기'?`${rendered}\n${renderMarketTrendSection(marketHistory)}`:rendered;
  }).join('\n');
}

export function renderMarketTrendSection(history:MajorIndexHistory|undefined):string {
  try {
    const series=validateMarketHistory(history);
    const cards=series.map(renderTrendCard);
    const grid=`<div class="index-trend-grid" data-layout="responsive-two-by-two" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:10px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;margin:0;overflow:hidden">${cards.map(card=>`<div class="index-trend-cell" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box">${card}</div>`).join('')}</div>`;
    const uniqueSources=[...new Map(series.map(item=>[`${item.sourceUrl}\u0000${item.sourceLabel}`,item])).values()];
    const sources=uniqueSources.map(item=>`<a href="${escapeAttr(item.sourceUrl)}" target="_blank" rel="nofollow noopener noreferrer" style="${SOURCE_LINK_STYLE}">${escapeHtml(item.sourceLabel)}</a>`).join(' · ');
    const dates=series.flatMap(item=>item.dates).sort();
    const caption=`${formatKoreanDate(dates[0]!)}~${formatKoreanDate(dates.at(-1)!,dates[0]!)} 정규장 종가`;
    return `<section class="editorial-block block-major-index-trend" data-section="major-index-trend" data-chart-status="rendered" data-session-count="${history!.sessionCount}" style="${SECTION_STYLE}"><h2 style="${SLATE_TITLE_STYLE}">미국 주요 증시 추이</h2><div class="editorial-content chart-content" style="${CONTENT_STYLE};background:#f7f9fc;padding:14px;width:100%;max-width:100%;box-sizing:border-box;overflow:hidden">${grid}<p style="margin:11px 2px 0;color:#59697d;font-size:12px;line-height:1.5">${caption} · ${sources}</p></div></section>`;
  } catch {
    return `<section class="editorial-block block-major-index-trend" data-section="major-index-trend" data-chart-status="fallback" style="${SECTION_STYLE}"><h2 style="${SLATE_TITLE_STYLE}">미국 주요 증시 추이</h2><div class="editorial-content chart-content" style="${CONTENT_STYLE};background:#f7f9fc;width:100%;max-width:100%;box-sizing:border-box;overflow:hidden"><p style="margin:0;color:#59697d;font-size:14px">검증된 5거래일 종가를 모두 확인할 수 없어 차트를 표시하지 않았습니다.</p></div></section>`;
  }
}

function formatKoreanDate(value:string,first?:string):string {const [year,month,day]=value.split('-').map(Number);const firstYear=first?Number(first.slice(0,4)):null;return `${firstYear===year?'':`${year}년 `}${month}월 ${day}일`;}

function validateMarketHistory(history:MajorIndexHistory|undefined):MajorIndexHistorySeries[] {
  if(!history||history.sessionCount<5||!/^\d{4}-\d{2}-\d{2}$/.test(history.asOf)) throw new Error('missing verified market history');
  const order=['sp500','nasdaq','dow-jones','russell-2000'];
  if((history.series.length!==3&&history.series.length!==4)||history.series.some((item,index)=>item.key!==order[index]||item.dates.length!==history.sessionCount||item.closes.length!==history.sessionCount||item.provenance.length!==history.sessionCount||item.dates.some(date=>!/^\d{4}-\d{2}-\d{2}$/.test(date))||item.closes.some(value=>!Number.isFinite(value))||item.closes.at(-1)!==item.latestClose||!Number.isFinite(item.latestChangePct)||!/^https:\/\//.test(item.sourceUrl))) throw new Error('invalid verified market history');
  return history.series;
}

function renderTrendCard(item:MajorIndexHistorySeries):string {
  const min=Math.min(...item.closes),max=Math.max(...item.closes),range=Math.max(max-min,Math.max(Math.abs(max),1)*0.002);
  const step=204/Math.max(1,item.closes.length-1);const points=item.closes.map((value,index)=>`${18+index*step},${Math.round(86-(value-min)/range*60)}`).join(' ');
  const pct=`${item.latestChangePct>0?'+':''}${Number(item.latestChangePct.toFixed(2))}%`;
  const directionColor=item.latestChangePct>0?'#c62828':item.latestChangePct<0?'#1565c0':'#59697d';
  const values=item.closes.map(value=>String(value)).join(',');
  const ticks=[0,Math.round((item.dates.length-1)/4),Math.round((item.dates.length-1)/2),Math.round((item.dates.length-1)*3/4),item.dates.length-1].filter((value,index,all)=>all.indexOf(value)===index);
  return `<div class="index-trend-card" data-index="${escapeAttr(item.key)}" data-values="${escapeAttr(values)}" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;background:#fbfcfe;border:1px solid #c4cfdb;margin:0;overflow:hidden"><h3 style="margin:0;padding:8px;background:#203a57;color:#ffffff;font-size:14px;font-weight:800;line-height:1.3;white-space:nowrap;word-break:keep-all;overflow-wrap:normal">${escapeHtml(item.label)}</h3><div style="padding:8px;width:100%;max-width:100%;min-width:0;box-sizing:border-box"><svg class="index-line-chart" data-index="${escapeAttr(item.key)}" width="100%" viewBox="0 0 240 112" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeAttr(item.label)} 최근 ${item.dates.length}거래일 종가 추이" style="display:block;width:100%;max-width:100%;height:auto;box-sizing:border-box;overflow:hidden"><title>${escapeHtml(item.label)} 최근 ${item.dates.length}거래일 종가</title><desc>${escapeHtml(item.dates.map((date,index)=>`${date} ${item.closes[index]}`).join(', '))}</desc><line x1="18" y1="26" x2="222" y2="26" stroke="#dce3eb" stroke-width="1"></line><line x1="18" y1="56" x2="222" y2="56" stroke="#dce3eb" stroke-width="1"></line><line x1="18" y1="86" x2="222" y2="86" stroke="#dce3eb" stroke-width="1"></line><polyline points="${points}" fill="none" stroke="#456b91" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>${item.closes.map((_,index)=>`<circle cx="${18+index*step}" cy="${points.split(' ')[index]!.split(',')[1]}" r="${item.closes.length>20?1.4:3}" fill="#173a63"></circle>`).join('')}${ticks.map((index,tickIndex)=>`<text x="${18+index*step}" y="105" fill="#65758a" font-size="8" text-anchor="${tickIndex===0?'start':tickIndex===ticks.length-1?'end':'middle'}">${escapeHtml(item.dates[index]!.slice(5).replace('-','/'))}</text>`).join('')}</svg><div style="display:flex;justify-content:space-between;gap:4px;align-items:baseline;margin-top:3px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;white-space:nowrap"><strong style="color:#172033;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap">${escapeHtml(formatIndexClose(item.latestClose))}</strong><span style="color:${directionColor};font-size:12px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap">${escapeHtml(pct)}</span></div></div></div>`;
}

function formatIndexClose(value:number):string { return value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function renderMarkdownSection(heading:string,lines:string[]):string {
  const contentStyle=heading==='한국시장 연결 포인트'?KOREA_CONTENT_STYLE:CONTENT_STYLE;
  const html=[`<section class="editorial-block ${blockClass(heading)}" data-section="${sectionKey(heading)}" style="${SECTION_STYLE}"><h2 style="${titleStyle(heading)}">${escapeHtml(heading)}</h2><div class="editorial-content" style="${contentStyle}">`];
  let inList=false;
  const closeList=()=>{ if(inList) { html.push('</ul>'); inList=false; } };
  for(let index=0;index<lines.length;index++) {
    const line=lines[index]!;
    if(isTableHeader(line,lines[index+1])) {
      closeList();
      const headers=parseTableRow(line);
      const numericStart=Math.max(1,headers.length-2);
      index+=2;
      const rows:string[][]=[];
      while(index<lines.length&&/^\s*\|.*\|\s*$/.test(lines[index]!)) { rows.push(parseTableRow(lines[index]!)); index+=1; }
      index-=1;
      html.push(`<div class="market-dashboard" style="width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;margin:8px 0 4px"><table style="width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;border:2px solid #183552;box-sizing:border-box"><thead><tr>${headers.map((cell,cellIndex)=>`<th style="background:#0b2745;color:#ffffff;padding:10px 7px;font-size:14px;font-weight:800;border:1px solid #36536f;overflow-wrap:anywhere;${cellIndex>=numericStart?'text-align:right':'text-align:left'}">${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,cellIndex)=>`<td style="${marketCellStyle(row,cell,cellIndex,numericStart)}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if(line.startsWith('### ')) { closeList(); html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`); continue; }
    if(line.startsWith('- ')) { if(!inList) { html.push('<ul>'); inList=true; } html.push(`<li>${linkify(escapeHtml(line.slice(2)))}</li>`); continue; }
    if(!line.trim()) { closeList(); continue; }
    closeList(); html.push(`<p>${linkify(escapeHtml(line))}</p>`);
  }
  closeList();
  html.push('</div></section>');
  return html.join('\n');
}

function renderSourceSection(sources:{label:string;url:string}[]):string {
  const groups=[
    {title:'시장지수',items:sources.filter(item=>sourceCategory(item.label)==='MARKET')},
    {title:'거시',items:sources.filter(item=>sourceCategory(item.label)==='MACRO')},
    {title:'기업·산업',items:sources.filter(item=>sourceCategory(item.label)==='INDUSTRY')}
  ];
  return `<section class="editorial-block sources" data-section="sources" style="${SECTION_STYLE}"><h2 style="${SLATE_TITLE_STYLE}">주요 출처</h2><div class="editorial-content source-groups" style="${CONTENT_STYLE};background:#f8fafc;font-size:14px;line-height:1.55">${groups.filter(group=>group.items.length).map(group=>`<div class="source-group" style="width:100%;max-width:100%;box-sizing:border-box;padding:10px 12px;margin:0 0 10px;background:#ffffff;border-left:4px solid #405f7f"><h3 style="margin:0 0 6px;color:#102f50;font-size:15px;font-weight:800">${group.title}</h3><ul style="margin:0;padding-left:18px">${group.items.map(item=>`<li><a href="${escapeAttr(item.url)}" target="_blank" rel="nofollow noopener noreferrer" style="${SOURCE_LINK_STYLE}">${escapeHtml(item.label)}</a></li>`).join('')}</ul></div>`).join('')}</div></section>`;
}
function sourceCategory(label:string):'MARKET'|'MACRO'|'INDUSTRY' {
  if(/S&P|Nasdaq|FTSE|Russell|Cboe|VIX|ICE|Dollar Index|Brent|WTI/i.test(label)) return 'MARKET';
  if(/Treasury|Bureau of Labor|Federal Reserve|FOMC|CPI|PCE/i.test(label)) return 'MACRO';
  return 'INDUSTRY';
}
function sectionKey(heading:string):string { return blockClass(heading).replace(/^block-/,''); }
function titleStyle(heading:string):string { return heading==='시장을 움직인 핵심 요인'||heading==='오늘 체크리스트'?SLATE_TITLE_STYLE:TITLE_STYLE; }
function blockClass(heading:string):string {
  const classes:Record<string,string>={
    '핵심 요약':'block-opening-summary','시장 한눈에 보기':'block-market-overview','시장을 움직인 핵심 요인':'block-market-drivers',
    'AI·반도체 / 주요 산업':'block-ai-industry','한국시장 연결 포인트':'block-korea-market','오늘 체크리스트':'block-checklist'
  };
  return classes[heading]??'block-general';
}

function isTableHeader(line:string,next:string|undefined):boolean { return /^\s*\|.*\|\s*$/.test(line)&&Boolean(next&&/^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(next)); }
function parseTableRow(line:string):string[] { return line.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim()); }
function marketCellStyle(row:string[],cell:string,cellIndex:number,numericStart:number):string {
  const isNumeric=cellIndex>=numericStart;
  const isChange=cellIndex===row.length-1;
  const direction=isChange&&/^\+/.test(cell)?'up':isChange&&/^-/.test(cell)?'down':'flat';
  const directionStyle=direction==='up'?'color:#c62828;background:#fff2f2':direction==='down'?'color:#1565c0;background:#eef5ff':'color:#59697d';
  const groupStyle=cellIndex===0?'color:#173a63;background:#f0f4f8;font-weight:700':'';
  return `padding:10px 7px;font-size:14px;border:1px solid #c9d5e3;overflow-wrap:anywhere;${isNumeric?'text-align:right;font-weight:800;font-variant-numeric:tabular-nums':'text-align:left'};${directionStyle};${groupStyle}`;
}
function glossaryFullSpelling(term:string,explicit:string|undefined):string {
  if(explicit?.trim()) return explicit.trim();
  const spellings:Record<string,string>={CAPEX:'Capital Expenditure',FOMC:'Federal Open Market Committee',bp:'basis point','국채금리':'Treasury yield',PER:'Price Earnings Ratio',PBR:'Price Book-value Ratio',EPS:'Earnings Per Share',BPS:'Book-value Per Share',ROE:'Return on Equity',EBITDA:'Earnings Before Interest, Taxes, Depreciation and Amortization',FCF:'Free Cash Flow',CPI:'Consumer Price Index',PCE:'Personal Consumption Expenditures',VIX:'Cboe Volatility Index',DXY:'U.S. Dollar Index',YoY:'Year over Year',MoM:'Month over Month',QoQ:'Quarter over Quarter'};
  return spellings[term]??term;
}
function dictionaryMeaning(value:string):string { return value.trim().replace(/[.!?]+$/g,'').replace(/(?:입니다|합니다|뜻합니다)$/,'').trim(); }
function isPublishedArticleUrl(value:string|undefined):boolean {
  if(!value) return false;
  try { const url=new URL(value); return url.protocol==='https:'&&url.hostname==='motusnova.blogspot.com'&&url.pathname.replace(/\/+$/,'')!==''&&!url.pathname.startsWith('/search/'); }
  catch { return false; }
}

function linkify(text:string):string { return text.replace(/https?:\/\/[^\s<]+/g,url=>`<a href="${escapeAttr(url)}" rel="nofollow noopener">${url}</a>`); }
function unique(values:string[]):string[] { return [...new Set(values.map(value=>value.trim()).filter(Boolean))]; }
function escapeHtml(text:string):string { return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeAttr(text:string):string { return escapeHtml(text).replace(/'/g,'&#39;'); }
