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

const EDITORIAL_CSS='.motus-editorial{font-family:Arial,"Noto Sans KR",sans-serif;color:#172033;line-height:1.72;max-width:820px;margin:auto;font-size:16px}.editorial-block{margin:22px 0;padding:22px 24px;background:#fff;border:1px solid #cfd8e5;box-shadow:0 5px 16px rgba(7,26,51,.05)}.editorial-block>h2{margin:-22px -24px 18px;padding:11px 16px;background:#071a33;color:#fff;font-size:1.08rem;line-height:1.35;letter-spacing:.01em}.editorial-block h3{margin:20px 0 8px;color:#173a63;font-size:1rem}.block-market-drivers>h2,.block-checklist>h2,.sources>h2{background:#24364d}.block-korea-market{background:#edf4fb;border:2px solid #8eabc9}.block-korea-market>h2{background:#173a63}.market-dashboard{width:100%;max-width:100%;overflow-x:hidden;margin:8px 0 4px}.market-dashboard table{width:100%;table-layout:fixed;border-collapse:collapse;border:1px solid #cfd8e5}.market-dashboard th{background:#e7edf4;color:#071a33;padding:9px 8px;text-align:left;font-size:.9em}.market-dashboard td{padding:9px 8px;border-top:1px solid #dbe3ee;overflow-wrap:anywhere}.market-dashboard th:nth-child(n+3),.market-dashboard td:nth-child(n+3){text-align:right}.market-dashboard th:nth-child(1){width:20%}.market-dashboard th:nth-child(2){width:36%}.market-dashboard th:nth-child(3),.market-dashboard th:nth-child(4){width:22%}.glossary{background:#f5f7fa}.glossary-reference{font-size:.9em;line-height:1.55}.glossary-row{display:grid;grid-template-columns:minmax(70px,110px) 1fr;gap:10px;padding:8px 0;border-bottom:1px solid #dbe3ee}.glossary-row:last-child{border-bottom:0}.glossary-row strong{color:#071a33}.source-groups{display:grid;gap:12px;font-size:.9em;line-height:1.55}.source-group{padding:12px 14px;background:#f8fafc;border-left:3px solid #718096}.source-group h3{margin:0 0 6px;font-size:.95rem}.source-group ul{margin:0;padding-left:18px}.related{margin-top:14px;padding-top:10px;border-top:1px solid #dbe3ee;font-size:.9em}.hashtags{margin:22px 2px;color:#40516b;font-size:.9em}@media(max-width:640px){.motus-editorial{font-size:15px}.editorial-block{margin:18px 0;padding:18px 14px}.editorial-block>h2{margin:-18px -14px 15px;padding:10px 12px}.market-dashboard th,.market-dashboard td{padding:7px 5px;font-size:.78rem}.market-dashboard th:nth-child(1){width:21%}.market-dashboard th:nth-child(2){width:35%}.glossary-row{grid-template-columns:1fr;gap:2px}.source-group{padding:10px 11px}}';

export function renderMotusBloggerContent(document:PublisherContentDocument,config:MotusPublisherConfig):MotusRenderedContent {
  validateMotusConfig(config);
  const article=markdownToHtml(document.markdown);
  const relatedLinks=document.glossary.filter(term=>isPublishedArticleUrl(term.publishedUrl)).slice(0,3).map(term=>({title:term.evergreenTitle,url:term.publishedUrl!}));
  const related=relatedLinks.length?`<div class="related"><strong>관련 글</strong><ul>${relatedLinks.map(item=>`<li><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></div>`:'';
  const glossary=document.glossary.length?`<section class="editorial-block glossary" data-section="glossary"><h2>용어설명</h2><div class="glossary-reference">${document.glossary.map(term=>`<div class="glossary-row"><strong>${escapeHtml(term.term)}</strong><span>${escapeHtml(term.explanation)}${isPublishedArticleUrl(term.publishedUrl)?` <a href="${escapeAttr(term.publishedUrl!)}">${escapeHtml(term.evergreenTitle)}</a>`:''}</span></div>`).join('')}</div>${related}</section>`:'';
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
    ${EDITORIAL_CSS}
  </style>
</head>
<body>
  <article class="motus-editorial" data-channel="motus-blogger" data-layout="financial-research-v1">
<style class="motus-editorial-style">${EDITORIAL_CSS}</style>
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
  const html=[`<section class="editorial-block ${blockClass(heading)}" data-section="${sectionKey(heading)}"><h2>${escapeHtml(heading)}</h2>`];
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
      html.push(`<div class="market-dashboard"><table><thead><tr>${headers.map((cell,cellIndex)=>`<th style="${cellIndex>=numericStart?'text-align:right':'text-align:left'}">${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,cellIndex)=>`<td style="${cellIndex>=numericStart?'text-align:right':'text-align:left'}">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if(line.startsWith('### ')) { closeList(); html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`); continue; }
    if(line.startsWith('- ')) { if(!inList) { html.push('<ul>'); inList=true; } html.push(`<li>${linkify(escapeHtml(line.slice(2)))}</li>`); continue; }
    if(!line.trim()) { closeList(); continue; }
    closeList(); html.push(`<p>${linkify(escapeHtml(line))}</p>`);
  }
  closeList();
  html.push('</section>');
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
    '핵심 요약':'block-opening-summary','시장 한눈에 보기':'block-market-overview','시장을 움직인 핵심 요인':'block-market-drivers',
    'AI·반도체 / 핵심 산업':'block-ai-industry','한국시장 연결 포인트':'block-korea-market','오늘 체크리스트':'block-checklist'
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
