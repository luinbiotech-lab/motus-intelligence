import type { EvidencePackage, ReportRecord } from '../domain/models.js';
import { renderDailyEditorial, type DailyEditorialOutput, type EditorialTerm } from './editorial.js';
import { assertAdminRequest, type AdminRequestContext } from './admin.js';

export type BloggerPublicationStatus = 'DRAFT'|'PREVIEW_READY'|'APPROVED'|'PUBLISHED'|'FAILED';
export type BloggerHistoryEvent = { at: string; from: BloggerPublicationStatus|null; to: BloggerPublicationStatus; reason: string };

export interface BloggerPublishingConfig {
  previewBaseUrl: string;
  placeholderBaseUrl: string;
  publicBaseUrl?: string|null;
  blogId?: string|null;
  blogIdEnvironmentVariable?: string|null;
  credentialEnvironmentVariable?: string|null;
  credentialAvailable?: boolean;
  publishAsDraft?: boolean;
}
export interface BloggerPublicationRecord {
  publicationVersion: string;
  reportId: string;
  tradingDate: string;
  status: BloggerPublicationStatus;
  title: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  labels: string[];
  hashtags: string[];
  previewUrl: string;
  placeholderUrl: string;
  postUrl: string|null;
  providerPostId?: string|null;
  html: string;
  glossary: EditorialTerm[];
  relatedLinks: { title: string; url: string }[];
  sources: { label: string; url: string }[];
  dryRun: boolean;
  error: string|null;
  createdAt: string;
  updatedAt: string;
  history: BloggerHistoryEvent[];
}
export interface BloggerPublishResult { url: string; providerPostId?: string; publishedAt?: string; status?: 'DRAFT'|'PUBLISHED' }
export interface BloggerAdapter {
  name: string;
  hasCredential(config:BloggerPublishingConfig): boolean;
  publish(record:BloggerPublicationRecord,config:BloggerPublishingConfig): Promise<BloggerPublishResult>;
}

export const BLOGGER_PUBLICATION_VERSION = '2G.BLOGGER.1.0';
export const GOOGLE_BLOGGER_ADAPTER_VERSION = '2H.GOOGLEBLOGGER.1.0';
const internalLeakPattern=/\b(CLAIM-|AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|DATA_NOT_CONNECTED|confidenceScore|verificationStatus|publicationVersion|history|providerPostId)\b/i;

export function createBloggerPreview(report:ReportRecord,evidence:EvidencePackage,config:BloggerPublishingConfig,now='2026-09-14T00:00:00+09:00'):BloggerPublicationRecord {
  validatePublishingConfig(config);
  const editorial=renderDailyEditorial(report,evidence);
  const slug=editorial.seo.slug;
  const previewUrl=joinUrl(config.previewBaseUrl,slug);
  const placeholderUrl=joinUrl(config.placeholderBaseUrl,slug);
  const sources=buildSources(evidence);
  const relatedLinks=buildRelatedLinks(editorial,config);
  const html=renderBloggerHtml(editorial,sources,relatedLinks);
  return {
    publicationVersion:BLOGGER_PUBLICATION_VERSION,
    reportId:report.reportId,
    tradingDate:report.tradingDate,
    status:'PREVIEW_READY',
    title:editorial.seo.title,
    seoTitle:editorial.seo.title,
    metaDescription:editorial.seo.description,
    slug,
    labels:buildLabels(editorial),
    hashtags:editorial.seo.hashtags,
    previewUrl,
    placeholderUrl,
    postUrl:null,
    providerPostId:null,
    html,
    glossary:editorial.terms,
    relatedLinks,
    sources,
    dryRun:false,
    error:null,
    createdAt:now,
    updatedAt:now,
    history:[{at:now,from:null,to:'PREVIEW_READY',reason:'Blogger preview generated from approved Daily Editorial output'}]
  };
}

export function approveBloggerPublication(record:BloggerPublicationRecord,context:AdminRequestContext,now='2026-09-14T00:05:00+09:00'):BloggerPublicationRecord {
  assertAdminRequest({...context,action:'BLOGGER_APPROVE'});
  if(record.status==='PUBLISHED') throw new Error('already-published reportId');
  if(record.status!=='PREVIEW_READY'&&record.status!=='APPROVED') throw new Error(`cannot approve from ${record.status}`);
  return transition(record,'APPROVED','admin approved Blogger publication preview',now,{error:null,dryRun:false});
}

export async function publishBloggerPublication(record:BloggerPublicationRecord,adapter:BloggerAdapter,config:BloggerPublishingConfig,context:AdminRequestContext,options:{dryRun?:boolean; now?:string}={}):Promise<BloggerPublicationRecord> {
  assertAdminRequest({...context,action:'BLOGGER_PUBLISH'});
  validatePublishingConfig(config);
  const now=options.now??'2026-09-14T00:10:00+09:00';
  if(record.status==='PUBLISHED') throw new Error('already-published reportId');
  if(record.postUrl) throw new Error('duplicate publish: post URL already exists');
  if(record.status!=='APPROVED') throw new Error(`cannot publish from ${record.status}`);
  if(options.dryRun) return transition(record,'APPROVED','dry-run publish checked adapter path without external write',now,{dryRun:true,error:null});
  if(!adapter.hasCredential(config)) return transition(record,'FAILED','missing Blogger credential; external publish was not attempted',now,{error:'missing credential',dryRun:false});
  try {
    const result=await adapter.publish(record,config);
    if(!result.url) return transition(record,'FAILED','Blogger adapter returned missing URL',now,{error:'missing URL',dryRun:false});
    const status=result.status??'PUBLISHED';
    const reason=status==='DRAFT'?'Blogger draft created after human approval and remote post URL stored':'Blogger publish completed and post URL stored';
    return transition(record,status,reason,result.publishedAt??now,{postUrl:result.url,providerPostId:result.providerPostId??null,error:null,dryRun:false});
  } catch(error) {
    const message=error instanceof Error?error.message:'network error';
    return transition(record,'FAILED',`Blogger publish failed: ${message}`,now,{error:message,dryRun:false});
  }
}

export class DryRunBloggerAdapter implements BloggerAdapter {
  name='dry-run-blogger-adapter';
  hasCredential(): boolean { return false; }
  async publish(): Promise<BloggerPublishResult> { throw new Error('dry-run adapter cannot publish without credential'); }
}

export class ConfiguredBloggerAdapter implements BloggerAdapter {
  name='configured-blogger-adapter';
  constructor(private readonly post:(record:BloggerPublicationRecord,config:BloggerPublishingConfig)=>Promise<BloggerPublishResult>) {}
  hasCredential(config:BloggerPublishingConfig): boolean { return config.credentialAvailable===true; }
  async publish(record:BloggerPublicationRecord,config:BloggerPublishingConfig):Promise<BloggerPublishResult> { return this.post(record,config); }
}

type FetchLike = (input:string|URL,init?:RequestInit)=>Promise<Response>;
type GoogleBloggerPost = { id?:string; url?:string; status?:string; published?:string; updated?:string };

export class GoogleBloggerApiAdapter implements BloggerAdapter {
  name=`google-blogger-api-v3@${GOOGLE_BLOGGER_ADAPTER_VERSION}`;
  constructor(
    private readonly tokenProvider:(environmentVariable:string)=>string|undefined=(name)=>process.env[name],
    private readonly fetcher:FetchLike=fetch
  ) {}
  hasCredential(config:BloggerPublishingConfig):boolean {
    const envName=config.credentialEnvironmentVariable?.trim();
    return Boolean(config.blogId?.trim()&&envName&&this.tokenProvider(envName)?.trim());
  }
  async publish(record:BloggerPublicationRecord,config:BloggerPublishingConfig):Promise<BloggerPublishResult> {
    const blogId=config.blogId?.trim();
    const envName=config.credentialEnvironmentVariable?.trim();
    const accessToken=envName?this.tokenProvider(envName)?.trim():undefined;
    if(!blogId) throw new Error('missing Blogger blogId');
    if(!accessToken) throw new Error('missing Blogger credential');
    const isDraft=config.publishAsDraft!==false;
    const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts`);
    endpoint.searchParams.set('isDraft',String(isDraft));
    endpoint.searchParams.set('fetchBody','true');
    endpoint.searchParams.set('fields','id,status,url,published,updated,title,labels');
    const response=await this.fetcher(endpoint,{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify({
      kind:'blogger#post',
      title:record.title,
      content:extractBloggerArticle(record.html),
      labels:record.labels,
      customMetaData:JSON.stringify({description:record.metaDescription,slug:record.slug})
    })});
    if(!response.ok) throw new Error(`Blogger API ${response.status}: ${safeGoogleApiError(await response.text())}`);
    const post=await response.json() as GoogleBloggerPost;
    if(!post.id) throw new Error('Blogger API response missing post id');
    if(!post.url) throw new Error('Blogger API response missing post URL');
    const publishedAt=post.published??post.updated;
    return {url:post.url,providerPostId:post.id,...(publishedAt?{publishedAt}:{}),status:isDraft?'DRAFT':'PUBLISHED'};
  }
}

export function resolveBloggerUrl(record:BloggerPublicationRecord|null|undefined): { url: string; state: 'PUBLISHED'|'DRAFT'|'PREVIEW'|'UNRESOLVED' } {
  if(record?.status==='PUBLISHED'&&record.postUrl) return {url:record.postUrl,state:'PUBLISHED'};
  if(record?.status==='DRAFT'&&record.postUrl) return {url:record.postUrl,state:'DRAFT'};
  if(record?.previewUrl) return {url:record.previewUrl,state:'PREVIEW'};
  return {url:'about:blank#blogger-url-unresolved',state:'UNRESOLVED'};
}

export function renderPublishingConsole(record:BloggerPublicationRecord|null,context:AdminRequestContext):string {
  assertAdminRequest({...context,action:'BLOGGER_PREVIEW'});
  const status=record?.status??'DRAFT';
  const title=record?.title??'Blogger preview를 먼저 생성하세요';
  const preview=record?`<iframe title="Blogger preview" srcdoc="${escapeAttr(record.html)}"></iframe>`:'<p class="empty">날짜와 reportId를 선택하면 Blogger preview가 생성됩니다.</p>';
  const approveDisabled=status==='PREVIEW_READY'?'':' disabled';
  const publishDisabled=status==='APPROVED'?'':' disabled';
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>관리자 전용 Blogger Publishing Console</title>
  <style>
    body{margin:0;background:#eef2f7;color:#111827;font-family:Arial,"Noto Sans KR",sans-serif}
    main{max-width:1180px;margin:34px auto;padding:28px;background:#fff;border:1px solid #d6deea;border-radius:22px}
    h1{margin:0 0 10px;color:#071a33}.meta{color:#64748b;line-height:1.55}.toolbar{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:10px;margin:22px 0}
    input{padding:12px;border:1px solid #cbd5e1;border-radius:10px}button{border:0;border-radius:999px;padding:12px 16px;background:#071a33;color:#fff;font-weight:800}button:disabled{background:#94a3b8}.status{display:inline-block;background:#e2e8f0;border-radius:999px;padding:6px 10px;font-weight:800;color:#0f172a}
    iframe{width:100%;height:680px;border:1px solid #cbd5e1;border-radius:16px;background:white}.empty{padding:40px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:16px}.note{font-size:12px;color:#64748b;margin-top:16px}
  </style>
</head>
<body>
  <main data-admin-route="blogger-publishing-console">
    <h1>관리자 전용 Blogger Publishing Console</h1>
    <p class="meta">날짜/report 선택 → Blogger preview → approve → publish 순서로 처리합니다. 실제 credential이 없으면 외부 게시를 시도하지 않습니다.</p>
    <p>현재 상태 <span class="status">${escapeHtml(status)}</span></p>
    <form class="toolbar" method="post" action="/admin/blogger/preview">
      <input name="tradingDate" value="${escapeAttr(record?.tradingDate??'2026-09-11')}" />
      <input name="reportId" value="${escapeAttr(record?.reportId??'')}" placeholder="reportId" />
      <button type="submit">Preview</button>
      <button formaction="/admin/blogger/approve"${approveDisabled}>Approve</button>
      <button formaction="/admin/blogger/publish"${publishDisabled}>Publish</button>
    </form>
    <h2>${escapeHtml(title)}</h2>
    ${preview}
    <p class="note">이 콘솔은 server-side admin authorization 이후에만 렌더링됩니다. 공개 Blogger HTML에는 게시 action이나 내부 route가 포함되지 않습니다.</p>
  </main>
</body>
</html>`;
}

export function assertPublicBloggerHtmlSafe(html:string):void {
  if(internalLeakPattern.test(html)) throw new Error('public Blogger HTML leaks internal token');
  if(/\/admin\/blogger|BLOGGER_PUBLISH|BLOGGER_APPROVE|data-admin-route/i.test(html)) throw new Error('public Blogger HTML leaks admin route');
}

function renderBloggerHtml(editorial:DailyEditorialOutput,sources:{label:string;url:string}[],relatedLinks:{title:string;url:string}[]):string {
  const article=markdownToHtml(editorial.bloggerMarkdown);
  const glossary=editorial.terms.length?`<section class="glossary"><h2>용어 해설</h2><dl>${editorial.terms.map(term=>`<dt>${escapeHtml(term.term)}</dt><dd>${escapeHtml(term.explanation)} <a href="/evergreen/${escapeAttr(term.evergreenKey)}">${escapeHtml(term.evergreenTitle)}</a></dd>`).join('')}</dl></section>`:'';
  const related=`<section class="related"><h2>관련 글</h2><ul>${relatedLinks.map(item=>`<li><a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></section>`;
  const sourceSection=`<section class="sources"><h2>출처</h2><ol>${sources.map(item=>`<li><a href="${escapeAttr(item.url)}" rel="nofollow noopener">${escapeHtml(item.label)}</a></li>`).join('')}</ol></section>`;
  const tags=`<p class="hashtags">${editorial.seo.hashtags.map(escapeHtml).join(' ')}</p>`;
  const html=`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(editorial.seo.title)}</title>
  <meta name="description" content="${escapeAttr(editorial.seo.description)}" />
  <meta name="keywords" content="${escapeAttr(editorial.seo.hashtags.map(tag=>tag.replace(/^#/, '')).join(', '))}" />
</head>
<body>
  <article class="daily-editorial" data-channel="google-blogger">
    ${article}
    ${glossary}
    ${related}
    ${sourceSection}
    ${tags}
  </article>
</body>
</html>`;
  assertPublicBloggerHtmlSafe(html);
  return html;
}

function markdownToHtml(markdown:string):string {
  const lines=markdown.split(/\r?\n/);
  const html:string[]=[];
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
function linkify(text:string):string { return text.replace(/https?:\/\/[^\s<]+/g,url=>`<a href="${escapeAttr(url)}" rel="nofollow noopener">${url}</a>`); }
function buildLabels(editorial:DailyEditorialOutput):string[] { return editorial.seo.hashtags.map(tag=>tag.replace(/^#/,'')).slice(0,10); }
function buildSources(evidence:EvidencePackage):{label:string;url:string}[] {
  const seen=new Set<string>();
  return evidence.records.filter(record=>record.sourceUrl&&!seen.has(record.sourceUrl)&&seen.add(record.sourceUrl)).slice(0,8).map((record,index)=>({label:`자료 링크 ${index+1}`,url:record.sourceUrl}));
}
function buildRelatedLinks(editorial:DailyEditorialOutput,config:BloggerPublishingConfig):{title:string;url:string}[] {
  return editorial.terms.slice(0,3).map(term=>({title:term.evergreenTitle,url:joinUrl(config.placeholderBaseUrl,`evergreen/${term.evergreenKey}`)}));
}
function transition(record:BloggerPublicationRecord,to:BloggerPublicationStatus,reason:string,at:string,patch:Partial<BloggerPublicationRecord>={}):BloggerPublicationRecord {
  return {...record,...patch,status:to,updatedAt:at,history:[...record.history,{at,from:record.status,to,reason}]};
}
function validatePublishingConfig(config:BloggerPublishingConfig):void {
  if(!config.previewBaseUrl) throw new Error('missing Blogger preview URL');
  if(!config.placeholderBaseUrl) throw new Error('missing Blogger placeholder URL');
  const forbiddenPlaceholderHost=['blog','example','com'].join('.');
  if(config.previewBaseUrl.includes(forbiddenPlaceholderHost)||config.placeholderBaseUrl.includes(forbiddenPlaceholderHost)) throw new Error('Blogger placeholder must be config-managed and cannot use the reserved example host');
}
function extractBloggerArticle(html:string):string {
  const match=html.match(/<article\b[^>]*>[\s\S]*<\/article>/i);
  if(!match) throw new Error('Blogger preview HTML is missing article content');
  return match[0];
}
function safeGoogleApiError(body:string):string {
  try {
    const parsed=JSON.parse(body) as {error?:{message?:string;status?:string}};
    return [parsed.error?.status,parsed.error?.message].filter(Boolean).join(' - ').slice(0,300)||'request failed';
  } catch { return 'request failed'; }
}
function joinUrl(base:string,path:string):string { return `${base.replace(/\/+$/,'')}/${path.replace(/^\/+/, '')}`; }
function escapeHtml(text:string):string { return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeAttr(text:string):string { return escapeHtml(text).replace(/'/g,'&#39;'); }
