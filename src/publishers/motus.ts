import {
  MOTUS_BRAND,
  MOTUS_CATEGORIES,
  MOTUS_CTA_TEXT,
  MOTUS_DISPLAY_NAME,
  type GlobalContentMetadata,
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

const ARTICLE_STYLE='font-family:Arial,&quot;Noto Sans KR&quot;,sans-serif;color:#172033;line-height:1.72;font-size:16px;width:100%;max-width:820px;box-sizing:border-box;margin:0 auto;overflow-wrap:anywhere';
const SECTION_STYLE='width:100%;max-width:100%;box-sizing:border-box;margin:22px 0 0';
const TITLE_STYLE='background:#071a33;color:#ffffff;padding:12px 16px;font-size:18px;font-weight:700;line-height:1.35;margin:0;width:100%;max-width:100%;box-sizing:border-box';
const SLATE_TITLE_STYLE='background:#24364d;color:#ffffff;padding:12px 16px;font-size:18px;font-weight:700;line-height:1.35;margin:0;width:100%;max-width:100%;box-sizing:border-box';
const CONTENT_STYLE='border:1px solid #cfd8e5;padding:20px 22px;background:#ffffff;margin:0 0 22px;width:100%;max-width:100%;box-sizing:border-box';
const KOREA_CONTENT_STYLE='border:2px solid #8eabc9;padding:20px 22px;background:#edf4fb;margin:0 0 22px;width:100%;max-width:100%;box-sizing:border-box';

export function renderMotusBloggerContent(document:PublisherContentDocument,config:MotusPublisherConfig):MotusRenderedContent {
  validateMotusConfig(config);
  const article=markdownToHtml(document.markdown);
  const relatedLinks=document.glossary.filter(term=>isPublishedArticleUrl(term.publishedUrl)).slice(0,3).map(term=>({title:term.evergreenTitle,url:term.publishedUrl!}));
  const related=relatedLinks.length?`<div class="related" style="margin-top:14px;padding-top:10px;border-top:1px solid #dbe3ee;font-size:14px"><strong>관련 글</strong><ul>${relatedLinks.map(item=>`<li><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></div>`:'';
  const glossary=document.glossary.length?`<section class="editorial-block glossary" data-section="glossary" style="${SECTION_STYLE}"><h2 style="${TITLE_STYLE}">용어설명</h2><div class="editorial-content glossary-reference" style="${CONTENT_STYLE};background:#f4f7fb;font-size:14px;line-height:1.55"><table style="width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;box-sizing:border-box"><tbody>${document.glossary.slice(0,6).map(term=>`<tr class="glossary-row"><th scope="row" style="width:24%;padding:8px 10px;text-align:left;vertical-align:top;color:#071a33;font-size:14px;border-bottom:1px solid #dbe3ee;overflow-wrap:anywhere">${escapeHtml(term.term)}</th><td style="padding:8px 10px;vertical-align:top;font-size:14px;border-bottom:1px solid #dbe3ee;overflow-wrap:anywhere">${escapeHtml(term.explanation)}${isPublishedArticleUrl(term.publishedUrl)?` <a href="${escapeAttr(term.publishedUrl!)}">${escapeHtml(term.evergreenTitle)}</a>`:''}</td></tr>`).join('')}</tbody></table>${related}</div></section>`:'';
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

function markdownToHtml(markdown:string):string {
  const sections:{heading:string;lines:string[]}[]=[];
  let current:{heading:string;lines:string[]}|null=null;
  for(const line of markdown.split(/\r?\n/)) {
    if(line.startsWith('## ')) { if(current) sections.push(current); current={heading:line.slice(3),lines:[]}; }
    else if(current) current.lines.push(line);
  }
  if(current) sections.push(current);
  return sections.filter(section=>section.lines.some(line=>line.trim()&&!line.startsWith('### '))).map(section=>renderMarkdownSection(section.heading,section.lines)).join('\n');
}

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
      html.push(`<div class="market-dashboard" style="width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;margin:8px 0 4px"><table style="width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid #cfd8e5;box-sizing:border-box"><thead><tr>${headers.map((cell,cellIndex)=>`<th style="background:#e7edf4;color:#071a33;padding:8px 6px;font-size:13px;overflow-wrap:anywhere;${cellIndex>=numericStart?'text-align:right':'text-align:left'}">${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,cellIndex)=>`<td style="padding:8px 6px;font-size:13px;border-top:1px solid #dbe3ee;overflow-wrap:anywhere;${cellIndex>=numericStart?'text-align:right':'text-align:left'}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
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
  return `<section class="editorial-block sources" data-section="sources" style="${SECTION_STYLE}"><h2 style="${SLATE_TITLE_STYLE}">주요 출처</h2><div class="editorial-content source-groups" style="${CONTENT_STYLE};background:#f8fafc;font-size:14px;line-height:1.55">${groups.filter(group=>group.items.length).map(group=>`<div class="source-group" style="width:100%;max-width:100%;box-sizing:border-box;padding:10px 12px;margin:0 0 10px;background:#ffffff;border-left:3px solid #718096"><h3 style="margin:0 0 6px;color:#173a63;font-size:14px">${group.title}</h3><ul style="margin:0;padding-left:18px">${group.items.map(item=>`<li><a href="${escapeAttr(item.url)}" rel="nofollow noopener">${escapeHtml(item.label)}</a></li>`).join('')}</ul></div>`).join('')}</div></section>`;
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
function isPublishedArticleUrl(value:string|undefined):boolean {
  if(!value) return false;
  try { const url=new URL(value); return url.protocol==='https:'&&url.hostname==='motusnova.blogspot.com'&&url.pathname.replace(/\/+$/,'')!==''&&!url.pathname.startsWith('/search/'); }
  catch { return false; }
}

function linkify(text:string):string { return text.replace(/https?:\/\/[^\s<]+/g,url=>`<a href="${escapeAttr(url)}" rel="nofollow noopener">${url}</a>`); }
function unique(values:string[]):string[] { return [...new Set(values.map(value=>value.trim()).filter(Boolean))]; }
function escapeHtml(text:string):string { return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeAttr(text:string):string { return escapeHtml(text).replace(/'/g,'&#39;'); }
