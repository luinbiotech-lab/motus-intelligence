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

export function renderMotusBloggerContent(document:PublisherContentDocument,config:MotusPublisherConfig):MotusRenderedContent {
  validateMotusConfig(config);
  const article=markdownToHtml(document.markdown);
  const relatedLinks=document.glossary.filter(term=>isPublishedArticleUrl(term.publishedUrl)).slice(0,3).map(term=>({title:term.evergreenTitle,url:term.publishedUrl!}));
  const related=relatedLinks.length?`<div class="related"><h3>관련 글</h3><ul>${relatedLinks.map(item=>`<li><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></div>`:'';
  const glossary=document.glossary.length?`<section class="editorial-block glossary" data-section="glossary"><h2>용어해설</h2><div class="glossary-grid">${document.glossary.map(term=>`<article class="glossary-card"><h3>${escapeHtml(term.term)}</h3><p>${escapeHtml(term.explanation)}${isPublishedArticleUrl(term.publishedUrl)?` <a href="${escapeAttr(term.publishedUrl!)}">${escapeHtml(term.evergreenTitle)}</a>`:''}</p></article>`).join('')}</div>${related}</section>`:'';
  const sourceSection=renderSourceSection(document.sources);
  const tags=`<p class="hashtags">${document.hashtags.map(escapeHtml).join(' ')}</p>`;
  const html=`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(document.seoTitle)}</title>
  <meta name="description" content="${escapeAttr(document.metaDescription)}" />
  <meta name="keywords" content="${escapeAttr(document.hashtags.map(tag=>tag.replace(/^#/, '')).join(', '))}" />
  <style>
    .motus-editorial{font-family:Arial,"Noto Sans KR",sans-serif;color:#172033;line-height:1.75;max-width:820px;margin:auto}.editorial-block{margin:20px 0;padding:22px 24px;background:#fff;border:1px solid #dbe3ee;border-radius:16px;box-shadow:0 7px 22px rgba(7,26,51,.06)}.editorial-block h2{margin:0 0 14px;color:#071a33;font-size:1.35rem}.editorial-block h3{margin:20px 0 8px;color:#173a63}.block-opening-summary{border-top:4px solid #173a63}.block-market-overview{padding-bottom:8px}.block-korea-market{background:#edf4fb;border-color:#a9c3df;border-left:6px solid #173a63}.market-dashboard{overflow-x:auto;margin:12px 0 16px}.market-dashboard table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #dbe3ee;border-radius:12px;overflow:hidden}.market-dashboard th{background:#071a33;color:#fff;padding:11px 12px;text-align:left}.market-dashboard td{padding:10px 12px;border-top:1px solid #e7ecf3}.market-dashboard th:nth-child(n+2),.market-dashboard td:nth-child(n+2){text-align:right}.glossary{background:#f5f7fa}.glossary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.glossary-card{padding:15px;background:#fff;border:1px solid #dbe3ee;border-radius:12px}.glossary-card h3{margin:0 0 5px}.glossary-card p{margin:0}.source-groups{display:grid;gap:14px}.source-group{padding:14px 16px;background:#f8fafc;border-radius:12px}.source-group h3{margin:0 0 7px}.source-group ul{margin:0;padding-left:20px}.related{margin-top:16px;padding-top:12px;border-top:1px solid #dbe3ee}.hashtags{margin:24px 4px;color:#40516b}@media(max-width:640px){.editorial-block{padding:18px}.glossary-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <article class="motus-editorial" data-channel="motus-blogger">
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
  const lines=markdown.split(/\r?\n/),html:string[]=[];
  let inList=false,inSection=false;
  const closeList=()=>{ if(inList) { html.push('</ul>'); inList=false; } };
  const closeSection=()=>{ closeList(); if(inSection) { html.push('</section>'); inSection=false; } };
  for(let index=0;index<lines.length;index++) {
    const line=lines[index]!;
    if(isTableHeader(line,lines[index+1])) {
      closeList();
      const headers=parseTableRow(line);
      index+=2;
      const rows:string[][]=[];
      while(index<lines.length&&/^\s*\|.*\|\s*$/.test(lines[index]!)) { rows.push(parseTableRow(lines[index]!)); index+=1; }
      index-=1;
      html.push(`<div class="market-dashboard" style="overflow-x:auto;margin:14px 0 26px"><table style="width:100%;border-collapse:collapse;border:1px solid #dbe3ee"><thead><tr>${headers.map((cell,cellIndex)=>`<th style="background:#071a33;color:#fff;padding:11px 12px;${cellIndex?'text-align:right':'text-align:left'}">${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,cellIndex)=>`<td style="padding:10px 12px;border-top:1px solid #e7ecf3;${cellIndex?'text-align:right':'text-align:left'}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if(line.startsWith('# ')) { closeList(); continue; }
    if(line.startsWith('### ')) { closeList(); html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`); continue; }
    if(line.startsWith('## ')) { closeSection(); const heading=line.slice(3); html.push(`<section class="editorial-block ${blockClass(heading)}" data-section="${sectionKey(heading)}"><h2>${escapeHtml(heading)}</h2>`); inSection=true; continue; }
    if(line.startsWith('- ')) { if(!inList) { html.push('<ul>'); inList=true; } html.push(`<li>${linkify(escapeHtml(line.slice(2)))}</li>`); continue; }
    if(!line.trim()) { closeList(); continue; }
    closeList(); html.push(`<p>${linkify(escapeHtml(line))}</p>`);
  }
  closeSection();
  return html.join('\n');
}

function renderSourceSection(sources:{label:string;url:string}[]):string {
  const groups=[
    {title:'시장지수',items:sources.filter(item=>sourceCategory(item.label)==='MARKET')},
    {title:'거시',items:sources.filter(item=>sourceCategory(item.label)==='MACRO')},
    {title:'기업·산업',items:sources.filter(item=>sourceCategory(item.label)==='INDUSTRY')}
  ];
  return `<section class="editorial-block sources" data-section="sources"><h2>주요 출처</h2><div class="source-groups">${groups.filter(group=>group.items.length).map(group=>`<div class="source-group"><h3>${group.title}</h3><ul>${group.items.map(item=>`<li><a href="${escapeAttr(item.url)}" rel="nofollow noopener">${escapeHtml(item.label)}</a></li>`).join('')}</ul></div>`).join('')}</div></section>`;
}
function sourceCategory(label:string):'MARKET'|'MACRO'|'INDUSTRY' {
  if(/S&P|Nasdaq|FTSE|Russell|Cboe|VIX|ICE|Dollar Index|Brent|WTI/i.test(label)) return 'MARKET';
  if(/Treasury|Bureau of Labor|Federal Reserve|FOMC|CPI|PCE/i.test(label)) return 'MACRO';
  return 'INDUSTRY';
}
function sectionKey(heading:string):string { return blockClass(heading).replace(/^block-/,''); }
function blockClass(heading:string):string {
  const classes:Record<string,string>={
    'Opening Summary':'block-opening-summary','시장 한눈에 보기':'block-market-overview','시장을 움직인 핵심 요인':'block-market-drivers',
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
