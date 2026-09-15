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
  const article=markdownToHtml(replaceDocumentTitle(document.markdown,document.title));
  const relatedLinks=document.glossary.slice(0,3).map(term=>({title:term.evergreenTitle,url:joinUrl(config.baseUrl,`search/label/${encodeURIComponent('Evergreen')}`)}));
  const glossary=document.glossary.length?`<section class="glossary"><h2>용어 해설</h2><dl>${document.glossary.map(term=>`<dt>${escapeHtml(term.term)}</dt><dd>${escapeHtml(term.explanation)} <a href="${escapeAttr(joinUrl(config.baseUrl,`search/label/${encodeURIComponent('Evergreen')}`))}">${escapeHtml(term.evergreenTitle)}</a></dd>`).join('')}</dl></section>`:'';
  const related=`<section class="related"><h2>관련 글</h2><ul>${relatedLinks.map(item=>`<li><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></section>`;
  const sourceSection=`<section class="sources"><h2>출처</h2><ol>${document.sources.map(item=>`<li><a href="${escapeAttr(item.url)}" rel="nofollow noopener">${escapeHtml(item.label)}</a></li>`).join('')}</ol></section>`;
  const tags=`<p class="hashtags">${document.hashtags.map(escapeHtml).join(' ')}</p>`;
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
  <article class="motus-editorial" data-channel="motus-blogger">
    <header class="motus-brand"><strong>${escapeHtml(config.displayName)}</strong><span>${escapeHtml(document.metadata.primaryCategory)}</span></header>
    ${article}
    ${glossary}
    ${related}
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
  let inList=false;
  const closeList=()=>{ if(inList) { html.push('</ul>'); inList=false; } };
  for(const line of lines) {
    if(line.startsWith('# ')) { closeList(); html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`); continue; }
    if(line.startsWith('## ')) { closeList(); html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`); continue; }
    if(line.startsWith('- ')) { if(!inList) { html.push('<ul>'); inList=true; } html.push(`<li>${linkify(escapeHtml(line.slice(2)))}</li>`); continue; }
    if(!line.trim()) { closeList(); continue; }
    closeList(); html.push(`<p>${linkify(escapeHtml(line))}</p>`);
  }
  closeList();
  return html.join('\n');
}

function replaceDocumentTitle(markdown:string,title:string):string {
  return markdown.replace(/^# .+$/m,`# ${title}`);
}

function linkify(text:string):string { return text.replace(/https?:\/\/[^\s<]+/g,url=>`<a href="${escapeAttr(url)}" rel="nofollow noopener">${url}</a>`); }
function unique(values:string[]):string[] { return [...new Set(values.map(value=>value.trim()).filter(Boolean))]; }
function joinUrl(base:string,path:string):string { return `${base.replace(/\/+$/,'')}/${path.replace(/^\/+/, '')}`; }
function escapeHtml(text:string):string { return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeAttr(text:string):string { return escapeHtml(text).replace(/'/g,'&#39;'); }
