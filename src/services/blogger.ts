import type { EvidencePackage, InputBundle, ReportRecord } from '../domain/models.js';
import { renderDailyEditorial, type EditorialTerm } from './editorial.js';
import { assertAdminRequest, type AdminRequestContext } from './admin.js';
import type { GlobalContentMetadata, MotusCategory, PublisherContentDocument } from '../content/publisher-schema.js';
import { renderMotusBloggerContent, type MotusPublisherConfig } from '../publishers/motus.js';

export type BloggerPublicationStatus = 'DRAFT'|'PREVIEW_READY'|'APPROVED'|'PUBLISHED'|'FAILED';
export type BloggerHistoryEvent = { at: string; from: BloggerPublicationStatus|null; to: BloggerPublicationStatus; reason: string };

export interface BloggerPublishingConfig {
  previewBaseUrl: string;
  placeholderBaseUrl: string;
  publicBaseUrl?: string|null;
  blogId?: string|null;
  blogIdEnvironmentVariable?: string|null;
  clientIdEnvironmentVariable?: string|null;
  clientSecretEnvironmentVariable?: string|null;
  refreshTokenEnvironmentVariable?: string|null;
  credentialEnvironmentVariable?: string|null;
  credentialAvailable?: boolean;
  publishAsDraft?: boolean;
  publisher: MotusPublisherConfig;
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
  metadata: GlobalContentMetadata;
  previewUrl: string;
  placeholderUrl: string;
  draftPostId: string|null;
  publicPostUrl: string|null;
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
export interface BloggerPublishResult { publicPostUrl?: string|null; postId?: string; publishedAt?: string; status?: 'DRAFT'|'PUBLISHED' }
export interface BloggerPostReadback { postId:string;title:string;content:string;status:'DRAFT'|'PUBLISHED'|'UNKNOWN';url:string|null;labels:string[];publishedAt?:string;updatedAt?:string }
export interface BloggerAdapter {
  name: string;
  hasCredential(config:BloggerPublishingConfig): boolean;
  findExistingDraft?(record:BloggerPublicationRecord,config:BloggerPublishingConfig): Promise<{postId:string;title:string}|null>;
  publish(record:BloggerPublicationRecord,config:BloggerPublishingConfig): Promise<BloggerPublishResult>;
}

export const BLOGGER_PUBLICATION_VERSION = '2I.BLOGGER.2.0';
export const GOOGLE_BLOGGER_ADAPTER_VERSION = '2H.GOOGLEBLOGGER.1.0';
const internalLeakPattern=/\b(CLAIM-|AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|DATA_NOT_CONNECTED|confidenceScore|verificationStatus|publicationVersion|history|draftPostId)\b/i;

export function createBloggerPreview(report:ReportRecord,evidence:EvidencePackage,config:BloggerPublishingConfig,now=new Date().toISOString()):BloggerPublicationRecord {
  validatePublishingConfig(config);
  const editorial=renderDailyEditorial(report,evidence);
  const title=editorial.seo.title;
  const slug=`daily-market-${report.tradingDate}`;
  const previewUrl=joinUrl(config.previewBaseUrl,slug);
  const placeholderUrl=joinUrl(config.placeholderBaseUrl,slug);
  const sources=buildSources(evidence);
  const metadata=buildMotusMetadata(evidence.originalInput as InputBundle);
  const document:PublisherContentDocument={title,seoTitle:title,metaDescription:editorial.seo.description,slug,markdown:editorial.bloggerMarkdown,hashtags:editorial.seo.hashtags,glossary:editorial.terms,sources,metadata};
  const {html,labels,relatedLinks}=renderMotusBloggerContent(document,config.publisher);
  assertPublicBloggerHtmlSafe(html);
  return {
    publicationVersion:BLOGGER_PUBLICATION_VERSION,
    reportId:report.reportId,
    tradingDate:report.tradingDate,
    status:'PREVIEW_READY',
    title,
    seoTitle:title,
    metaDescription:editorial.seo.description,
    slug,
    labels,
    hashtags:editorial.seo.hashtags,
    metadata,
    previewUrl,
    placeholderUrl,
    draftPostId:null,
    publicPostUrl:null,
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

export function approveBloggerPublication(record:BloggerPublicationRecord,context:AdminRequestContext,now=new Date().toISOString()):BloggerPublicationRecord {
  assertAdminRequest({...context,action:'BLOGGER_APPROVE'});
  if(record.status==='PUBLISHED') throw new Error('already-published reportId');
  if(record.status!=='PREVIEW_READY'&&record.status!=='APPROVED'&&record.status!=='FAILED') throw new Error(`cannot approve from ${record.status}`);
  const reason=record.status==='FAILED'?'admin approved Blogger publication retry after failed attempt':'admin approved Blogger publication preview';
  return transition(record,'APPROVED',reason,now,{error:null,dryRun:false});
}

export async function publishBloggerPublication(record:BloggerPublicationRecord,adapter:BloggerAdapter,config:BloggerPublishingConfig,context:AdminRequestContext,options:{dryRun?:boolean; now?:string}={}):Promise<BloggerPublicationRecord> {
  assertAdminRequest({...context,action:'BLOGGER_PUBLISH'});
  validatePublishingConfig(config);
  const now=options.now??new Date().toISOString();
  if(record.status==='PUBLISHED') throw new Error('already-published reportId');
  if(record.publicPostUrl) throw new Error('duplicate publish: public post URL already exists');
  if(record.draftPostId) throw new Error('duplicate publish: draft post ID already exists');
  if(record.status!=='APPROVED') throw new Error(`cannot publish from ${record.status}`);
  if(options.dryRun) return transition(record,'APPROVED','dry-run publish checked adapter path without external write',now,{dryRun:true,error:null});
  if(!adapter.hasCredential(config)) return transition(record,'FAILED','missing Blogger credential; external publish was not attempted',now,{error:'missing credential',dryRun:false});
  try {
    const existing=adapter.findExistingDraft?await adapter.findExistingDraft(record,config):null;
    if(existing) return transition(record,'DRAFT','duplicate draft creation blocked; existing Blogger draft retained',now,{draftPostId:existing.postId,publicPostUrl:null,error:null,dryRun:false});
    const result=await adapter.publish(record,config);
    const status=result.status??'PUBLISHED';
    if(status==='DRAFT') {
      if(!result.postId) return transition(record,'FAILED','Blogger adapter returned missing draft post ID',now,{error:'missing draft post ID',dryRun:false});
      return transition(record,'DRAFT','Blogger draft created after human approval; public permalink remains unresolved',result.publishedAt??now,{draftPostId:result.postId,publicPostUrl:null,error:null,dryRun:false});
    }
    if(!isPublicBloggerPostUrl(result.publicPostUrl)) return transition(record,'FAILED','Blogger adapter returned missing or non-article public permalink',now,{error:'missing public permalink',dryRun:false});
    return transition(record,'PUBLISHED','Blogger publish completed and verified public permalink stored',result.publishedAt??now,{draftPostId:result.postId??record.draftPostId,publicPostUrl:result.publicPostUrl!,error:null,dryRun:false});
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
type GoogleBloggerPost = { id?:string; title?:string; url?:string; status?:string; published?:string; updated?:string; content?:string; labels?:string[] };
type GoogleBloggerPostList = { items?:GoogleBloggerPost[]; nextPageToken?:string };
type GoogleOAuthToken = { access_token?:string; token_type?:string; expires_in?:number };

export class GoogleBloggerApiAdapter implements BloggerAdapter {
  name=`google-blogger-api-v3@${GOOGLE_BLOGGER_ADAPTER_VERSION}`;
  private cachedAccessToken:{value:string;expiresAt:number}|null=null;
  constructor(
    private readonly tokenProvider:(environmentVariable:string)=>string|undefined=(name)=>process.env[name],
    private readonly fetcher:FetchLike=fetch
  ) {}
  hasCredential(config:BloggerPublishingConfig):boolean {
    if(!config.blogId?.trim()) return false;
    const refresh=this.readConfigured(config.refreshTokenEnvironmentVariable);
    const clientId=this.readConfigured(config.clientIdEnvironmentVariable);
    const clientSecret=this.readConfigured(config.clientSecretEnvironmentVariable);
    if(refresh||clientId||clientSecret) return Boolean(refresh&&clientId&&clientSecret);
    return Boolean(this.readConfigured(config.credentialEnvironmentVariable));
  }
  async findExistingDraft(record:BloggerPublicationRecord,config:BloggerPublishingConfig):Promise<{postId:string;title:string}|null> {
    const blogId=config.blogId?.trim();
    if(!blogId) throw new Error('missing Blogger blogId');
    const accessToken=await this.resolveAccessToken(config);
    let pageToken:string|undefined;
    const koreanDate=record.tradingDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/,(_,year,month,day)=>`${year}년 ${Number(month)}월 ${Number(day)}일`);
    do {
      const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts`);
      endpoint.searchParams.set('status','draft');
      endpoint.searchParams.set('fetchBodies','false');
      endpoint.searchParams.set('maxResults','50');
      if(pageToken) endpoint.searchParams.set('pageToken',pageToken);
      const response=await this.fetcher(endpoint,{headers:{authorization:`Bearer ${accessToken}`}});
      if(!response.ok) throw new Error(`Blogger draft lookup ${response.status}: ${safeGoogleApiError(await response.text())}`);
      const page=await response.json() as GoogleBloggerPostList;
      const match=(page.items??[]).find(post=>post.id&&post.title&&(post.title===record.title||post.title.includes(koreanDate)));
      if(match?.id&&match.title) return {postId:match.id,title:match.title};
      pageToken=page.nextPageToken;
    } while(pageToken);
    return null;
  }
  async publish(record:BloggerPublicationRecord,config:BloggerPublishingConfig):Promise<BloggerPublishResult> {
    const blogId=config.blogId?.trim();
    if(!blogId) throw new Error('missing Blogger blogId');
    const accessToken=await this.resolveAccessToken(config);
    const isDraft=config.publishAsDraft!==false;
    const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts`);
    endpoint.searchParams.set('isDraft',String(isDraft));
    const response=await this.fetcher(endpoint,{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify({
      title:record.title,
      content:extractBloggerArticle(record.html),
      labels:record.labels
    })});
    if(!response.ok) throw new Error(`Blogger API ${response.status}: ${safeGoogleApiError(await response.text())}`);
    const post=await response.json() as GoogleBloggerPost;
    if(!post.id) throw new Error('Blogger API response missing post id');
    if(!isDraft&&!post.url) throw new Error('Blogger API response missing public post URL');
    const publishedAt=post.published??post.updated;
    const publicPostUrl=isDraft?null:post.url!;
    return {publicPostUrl,postId:post.id,...(publishedAt?{publishedAt}:{}),status:isDraft?'DRAFT':'PUBLISHED'};
  }

  async readPost(postId:string,config:BloggerPublishingConfig):Promise<BloggerPostReadback> {
    const blogId=config.blogId?.trim();if(!blogId)throw new Error('missing Blogger blogId');if(!postId.trim())throw new Error('missing Blogger postId');
    const accessToken=await this.resolveAccessToken(config);const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}`);endpoint.searchParams.set('view','ADMIN');
    const response=await this.fetcher(endpoint,{headers:{authorization:`Bearer ${accessToken}`}});if(!response.ok)throw new Error(`Blogger post readback ${response.status}: ${safeGoogleApiError(await response.text())}`);
    const post=await response.json() as GoogleBloggerPost&{content?:string;labels?:string[]};if(!post.id||!post.title||typeof post.content!=='string')throw new Error('Blogger readback missing post fields');
    const status=post.status==='DRAFT'?'DRAFT':post.status==='LIVE'?'PUBLISHED':'UNKNOWN';return {postId:post.id,title:post.title,content:post.content,status,url:status==='PUBLISHED'&&isPublicBloggerPostUrl(post.url)?post.url!:null,labels:Array.isArray(post.labels)?post.labels:[],...(post.published?{publishedAt:post.published}:{}),...(post.updated?{updatedAt:post.updated}:{})};
  }

  async findMatchingPosts(input:{title:string;label:string;operationDate?:string;publicationFingerprint?:string},config:BloggerPublishingConfig):Promise<BloggerPostReadback[]> {
    const blogId=config.blogId?.trim();if(!blogId)throw new Error('missing Blogger blogId');
    const accessToken=await this.resolveAccessToken(config);const matches:BloggerPostReadback[]=[];
    for(const requestedStatus of ['draft','live'] as const){let pageToken:string|undefined;do{
      const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts`);
      endpoint.searchParams.set('status',requestedStatus);endpoint.searchParams.set('fetchBodies','true');endpoint.searchParams.set('maxResults','50');if(pageToken)endpoint.searchParams.set('pageToken',pageToken);
      const response=await this.fetcher(endpoint,{headers:{authorization:`Bearer ${accessToken}`}});if(!response.ok)throw new Error(`Blogger remote duplicate lookup ${response.status}: ${safeGoogleApiError(await response.text())}`);
      const page=await response.json() as GoogleBloggerPostList&{items?:GoogleBloggerPost[]};
      for(const post of page.items??[]){if(!post.id||!post.title||!(post.labels??[]).includes(input.label)||!identityMatches(post,input))continue;const status=post.status==='DRAFT'?'DRAFT':post.status==='LIVE'?'PUBLISHED':'UNKNOWN';matches.push({postId:post.id,title:post.title,content:post.content??'',status,url:status==='PUBLISHED'&&isPublicBloggerPostUrl(post.url)?post.url!:null,labels:post.labels??[],...(post.published?{publishedAt:post.published}:{}),...(post.updated?{updatedAt:post.updated}:{})});}
      pageToken=page.nextPageToken;
    }while(pageToken);}
    return matches;
  }

  async insertDraftContent(input:{title:string;content:string;labels:string[]},config:BloggerPublishingConfig):Promise<BloggerPostReadback> {
    const blogId=config.blogId?.trim();if(!blogId)throw new Error('missing Blogger blogId');const accessToken=await this.resolveAccessToken(config);
    const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts`);endpoint.searchParams.set('isDraft','true');
    const response=await this.fetcher(endpoint,{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify({title:input.title,content:extractBloggerArticle(input.content),labels:input.labels})});
    if(!response.ok)throw new Error(`Blogger draft insert ${response.status}: ${safeGoogleApiError(await response.text())}`);const post=await response.json() as GoogleBloggerPost;
    if(!post.id)throw new Error('Blogger draft insert response missing post id');return this.readPost(post.id,config);
  }

  async patchPostContent(postId:string,input:{title:string;content:string;labels?:string[]},config:BloggerPublishingConfig):Promise<BloggerPostReadback> {
    const blogId=config.blogId?.trim();if(!blogId)throw new Error('missing Blogger blogId');if(!postId.trim())throw new Error('missing Blogger postId');const accessToken=await this.resolveAccessToken(config);
    const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}`);
    const response=await this.fetcher(endpoint,{method:'PATCH',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify({title:input.title,content:extractBloggerArticle(input.content),...(input.labels?{labels:input.labels}:{})})});
    if(!response.ok)throw new Error(`Blogger post patch ${response.status}: ${safeGoogleApiError(await response.text())}`);return this.readPost(postId,config);
  }

  async publishDraftPost(postId:string,config:BloggerPublishingConfig):Promise<{postId:string;publicPostUrl:string;publishedAt:string}> {
    const blogId=config.blogId?.trim();if(!blogId)throw new Error('missing Blogger blogId');if(!postId.trim())throw new Error('missing Blogger postId');const accessToken=await this.resolveAccessToken(config);
    const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}/publish`);
    const response=await this.fetcher(endpoint,{method:'POST',headers:{authorization:`Bearer ${accessToken}`}});if(!response.ok)throw new Error(`Blogger publish ${response.status}: ${safeGoogleApiError(await response.text())}`);const post=await response.json() as GoogleBloggerPost;
    if(post.id!==postId||!isPublicBloggerPostUrl(post.url))throw new Error('Blogger publish response missing article permalink');return {postId,publicPostUrl:post.url!,publishedAt:post.published??post.updated??new Date().toISOString()};
  }

  async healthCheck(config:BloggerPublishingConfig):Promise<{state:'PASS';checkedAt:string}> {await this.resolveAccessToken(config);return {state:'PASS',checkedAt:new Date().toISOString()}}

  private readConfigured(environmentVariable:string|null|undefined):string|undefined {
    const name=environmentVariable?.trim();
    return name?this.tokenProvider(name)?.trim()||undefined:undefined;
  }

  private async resolveAccessToken(config:BloggerPublishingConfig):Promise<string> {
    if(this.cachedAccessToken&&this.cachedAccessToken.expiresAt>Date.now()) return this.cachedAccessToken.value;
    const refreshToken=this.readConfigured(config.refreshTokenEnvironmentVariable);
    const clientId=this.readConfigured(config.clientIdEnvironmentVariable);
    const clientSecret=this.readConfigured(config.clientSecretEnvironmentVariable);
    if(refreshToken||clientId||clientSecret) {
      if(!refreshToken||!clientId||!clientSecret) throw new Error('incomplete Blogger refresh credential');
      const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'});
      const response=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
      if(!response.ok) throw new Error(`Blogger OAuth refresh failed (${response.status})`);
      const token=await response.json() as GoogleOAuthToken;
      if(!token.access_token?.trim()) throw new Error('Blogger OAuth refresh response missing access token');
      const value=token.access_token.trim();
      this.cachedAccessToken={value,expiresAt:Date.now()+Math.max(60,(token.expires_in??3600)-60)*1000};
      return value;
    }
    const fallback=this.readConfigured(config.credentialEnvironmentVariable);
    if(!fallback) throw new Error('missing Blogger credential');
    return fallback;
  }
}

export function resolveBloggerUrl(record:BloggerPublicationRecord|null|undefined): { url: string; state: 'PUBLISHED'|'DRAFT'|'PREVIEW'|'UNRESOLVED' } {
  if(record?.status==='PUBLISHED'&&record.publicPostUrl&&isPublicBloggerPostUrl(record.publicPostUrl)) return {url:record.publicPostUrl,state:'PUBLISHED'};
  if(record?.status==='DRAFT') return {url:'',state:'DRAFT'};
  if(record?.previewUrl) return {url:record.previewUrl,state:'PREVIEW'};
  return {url:'about:blank#blogger-url-unresolved',state:'UNRESOLVED'};
}

export function isPublicBloggerPostUrl(value:string|null|undefined):boolean {
  if(!value?.trim()) return false;
  try {
    const url=new URL(value);
    return (url.protocol==='https:'||url.protocol==='http:')&&url.pathname.replace(/\/+$/,'')!=='';
  } catch { return false; }
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
  if(/<script\b|javascript:|<foreignObject\b|\son\w+\s*=|<object\b|<embed\b/i.test(html)) throw new Error('public Blogger HTML contains unsafe active content');
}

function buildSources(evidence:EvidencePackage):{label:string;url:string}[] {
  const seen=new Set<string>();
  const sourceNames=new Map(evidence.sourceMetadata.map(source=>[source.sourceId,source.name]));
  return evidence.records
    .filter(record=>record.sourceUrl&&!seen.has(record.sourceUrl)&&seen.add(record.sourceUrl))
    .map(record=>({label:sourceLabel(record.sourceId,record.sourceUrl,sourceNames.get(record.sourceId)),url:record.sourceUrl}));
}
function sourceLabel(sourceId:string,url:string,configuredName:string|undefined):string {
  if(sourceId==='SP_DJI'&&/sp-500/i.test(url)) return 'S&P Dow Jones Indices · S&P 500';
  if(sourceId==='SP_DJI'&&/dow-jones/i.test(url)) return 'S&P Dow Jones Indices · Dow Jones Industrial Average';
  if(sourceId==='NASDAQ') return 'Nasdaq · Nasdaq Composite';
  if(sourceId==='FTSE_RUSSELL') return 'FTSE Russell · Russell 2000';
  if(sourceId==='CBOE') return 'Cboe · VIX Historical Data';
  if(sourceId==='US_TREASURY') return 'U.S. Treasury · Daily Treasury Par Yield Curve';
  if(sourceId==='ICE'&&/products\/194/i.test(url)) return 'ICE · U.S. Dollar Index Futures';
  if(sourceId==='ICE'&&/products\/219/i.test(url)) return 'ICE · Brent Crude Futures';
  if(sourceId==='BLS') return 'U.S. Bureau of Labor Statistics · Consumer Price Index';
  if(sourceId==='CORPORATE_IR'&&/oracle/i.test(url)) return 'Oracle Investor Relations · FY27 Q1 Results';
  if(sourceId==='CORPORATE_IR'&&/daveandbusters/i.test(url)) return "Dave & Buster's Investor Relations · Quarterly Results";
  if(sourceId==='SEC_EDGAR'&&/1525769/i.test(url)) return "U.S. SEC · Dave & Buster's 8-K Filing";
  if(sourceId==='SEC_EDGAR'&&/oracle/i.test(url)) return 'U.S. SEC · Oracle 8-K Filing';
  return configuredName??sourceId.replaceAll('_',' ');
}
function buildMotusMetadata(input:InputBundle):GlobalContentMetadata {
  const companies=unique([...input.companyEvents.flatMap(item=>[item.companyId,item.ticker]),...input.filings.flatMap(item=>[item.companyName??item.companyId,item.ticker])]);
  const sectors=unique(input.signals.map(item=>item.usIndustry));
  const themes=unique([...input.signals.map(item=>item.trigger.replace(/_/g,' ')),...input.macro.map(item=>item.indicatorName)]);
  const categories:MotusCategory[]=['Daily Market'];
  if(input.signals.some(item=>/AI|CAPEX|DATA.CENTER/i.test(`${item.trigger} ${item.usIndustry}`))) categories.push('AI & Industry');
  if(companies.length) categories.push('Global Company');
  categories.push('Market / Investment Insight');
  return {schemaVersion:'1.0',brand:'MOTUS',displayName:'MOTUS | What Moves the World',primaryCategory:'Daily Market',categories,companies,sectors,themes,countries:['United States','South Korea'],regions:['North America','Asia']};
}
function buildMotusTitle(editorialTitle:string,tradingDate:string):string {
  const subject=editorialTitle.replace(/^\d{4}-\d{2}-\d{2}\s+미국증시\s+마감:\s*/,'');
  return `MOTUS Daily Market | ${tradingDate} ${subject}`;
}
function unique(values:string[]):string[] { return [...new Set(values.map(value=>value.trim()).filter(Boolean))]; }
function transition(record:BloggerPublicationRecord,to:BloggerPublicationStatus,reason:string,at:string,patch:Partial<BloggerPublicationRecord>={}):BloggerPublicationRecord {
  return {...record,...patch,status:to,updatedAt:at,history:[...record.history,{at,from:record.status,to,reason}]};
}
function validatePublishingConfig(config:BloggerPublishingConfig):void {
  if(!config.previewBaseUrl) throw new Error('missing Blogger preview URL');
  if(!config.placeholderBaseUrl) throw new Error('missing Blogger placeholder URL');
  if(!config.publisher) throw new Error('missing MOTUS publisher config');
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
export function identityMatches(post:GoogleBloggerPost,input:{title:string;operationDate?:string}):boolean {
  // Date/updatedAt alone is not an identity: multiple distinct articles share a
  // publication date. Cross-operation same-session duplicates are caught by the
  // persisted publication ledger before this remote lookup.
  return post.title===input.title;
}
function kstDate(value:string):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const get=(type:string)=>parts.find(part=>part.type===type)?.value??'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function joinUrl(base:string,path:string):string { return `${base.replace(/\/+$/,'')}/${path.replace(/^\/+/, '')}`; }
function escapeHtml(text:string):string { return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escapeAttr(text:string):string { return escapeHtml(text).replace(/'/g,'&#39;'); }
