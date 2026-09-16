import { assertAdminRequest, type AdminRequestContext } from './admin.js';
import { assertPublicBloggerHtmlSafe, type BloggerPublicationRecord, type BloggerPublishingConfig } from './blogger.js';

type FetchLike=(input:string|URL,init?:RequestInit)=>Promise<Response>;
type BloggerPost={id?:string;status?:string;title?:string;content?:string;updated?:string;url?:string};
type BloggerPostList={items?:BloggerPost[];nextPageToken?:string};
type OAuthToken={access_token?:string};

export interface BloggerDraftUpdateVerification {
  postId: string;
  status: 'DRAFT';
  title: string;
  h1Count: number;
  marketDashboardCount: number;
  primarySourcesCount: number;
  visibleRawUrlCount: number;
  unpublishedRelatedLinksCount: number;
  duplicateDraftCount: number;
  marketDataUnchanged: boolean;
  internalTokenCount: number;
  aiSemiconductorFocus: boolean|null;
  consumerCheckCount: number;
  daveConsumerAuxiliary: boolean|null;
  draftCountBefore: number;
  draftCountAfter: number;
  updatedAt: string|null;
}

export interface BloggerDraftUpdateResult {
  record: BloggerPublicationRecord;
  verification: BloggerDraftUpdateVerification;
}

export async function updateExistingBloggerDraft(
  record:BloggerPublicationRecord,
  previewHtml:string,
  config:BloggerPublishingConfig,
  context:AdminRequestContext,
  options:{expectedPostId:string; expectedTitle:string; expectedEditorialFocus?:'AI_SEMICONDUCTOR'; now?:string; environment?:(name:string)=>string|undefined; fetcher?:FetchLike}
):Promise<BloggerDraftUpdateResult> {
  assertAdminRequest({...context,action:'BLOGGER_PUBLISH'});
  if(record.status!=='DRAFT') throw new Error(`draft update requires DRAFT publication, received ${record.status}`);
  if(record.draftPostId!==options.expectedPostId) throw new Error('draft post ID mismatch');
  if(record.publicPostUrl!==null) throw new Error('draft update requires publicPostUrl=null');
  assertPublicBloggerHtmlSafe(previewHtml);
  const title=readHtmlTitle(previewHtml);
  if(title!==options.expectedTitle) throw new Error('preview title does not match expected SEO title');
  const content=extractBloggerArticle(previewHtml);
  const environment=options.environment??((name:string)=>process.env[name]);
  const fetcher=options.fetcher??fetch;
  const blogId=requiredConfigValue(config.blogIdEnvironmentVariable,config.blogId,environment,'Blogger blogId');
  const accessToken=await refreshAccessToken(config,environment,fetcher);
  const before=await getPost(blogId,options.expectedPostId,accessToken,fetcher);
  assertTargetDraft(before,options.expectedPostId);
  const draftsBefore=await listDrafts(blogId,accessToken,fetcher);
  assertSingleTarget(draftsBefore,options.expectedPostId);
  await patchPost(blogId,options.expectedPostId,title,content,accessToken,fetcher);
  const after=await getPost(blogId,options.expectedPostId,accessToken,fetcher);
  const draftsAfter=await listDrafts(blogId,accessToken,fetcher);
  const verification=verifyUpdatedDraft(after,draftsBefore,draftsAfter,options.expectedPostId,title,content,options.expectedEditorialFocus);
  const at=after.updated??options.now??new Date().toISOString();
  return {
    record:{
      ...record,
      title,
      seoTitle:title,
      html:previewHtml,
      status:'DRAFT',
      draftPostId:options.expectedPostId,
      publicPostUrl:null,
      error:null,
      dryRun:false,
      updatedAt:at,
      history:[...record.history,{at,from:'DRAFT',to:'DRAFT',reason:'existing Blogger draft title and content updated after local editorial review'}]
    },
    verification
  };
}

async function refreshAccessToken(config:BloggerPublishingConfig,environment:(name:string)=>string|undefined,fetcher:FetchLike):Promise<string> {
  const refreshToken=requiredEnvironment(config.refreshTokenEnvironmentVariable,environment,'Blogger refresh token');
  const clientId=requiredEnvironment(config.clientIdEnvironmentVariable,environment,'Blogger client ID');
  const clientSecret=requiredEnvironment(config.clientSecretEnvironmentVariable,environment,'Blogger client secret');
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});
  if(!response.ok) throw new Error(`Blogger OAuth refresh failed (${response.status}): ${await safeApiError(response)}`);
  const token=await response.json() as OAuthToken;
  if(!token.access_token?.trim()) throw new Error('Blogger OAuth refresh response missing access token');
  return token.access_token.trim();
}

async function getPost(blogId:string,postId:string,accessToken:string,fetcher:FetchLike):Promise<BloggerPost> {
  const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}`);
  endpoint.searchParams.set('view','ADMIN');
  endpoint.searchParams.set('fetchBody','true');
  const response=await fetcher(endpoint,{headers:{authorization:`Bearer ${accessToken}`}});
  if(!response.ok) throw new Error(`Blogger posts.get failed (${response.status}): ${await safeApiError(response)}`);
  return await response.json() as BloggerPost;
}

async function patchPost(blogId:string,postId:string,title:string,content:string,accessToken:string,fetcher:FetchLike):Promise<void> {
  const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts/${encodeURIComponent(postId)}`);
  const response=await fetcher(endpoint,{method:'PATCH',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify({title,content})});
  if(!response.ok) throw new Error(`Blogger posts.patch failed (${response.status}): ${await safeApiError(response)}`);
}

async function listDrafts(blogId:string,accessToken:string,fetcher:FetchLike):Promise<BloggerPost[]> {
  const drafts:BloggerPost[]=[];
  let pageToken:string|undefined;
  for(let page=0;page<10;page++) {
    const endpoint=new URL(`https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogId)}/posts`);
    endpoint.searchParams.set('status','draft');
    endpoint.searchParams.set('view','ADMIN');
    endpoint.searchParams.set('fetchBodies','false');
    endpoint.searchParams.set('maxResults','50');
    if(pageToken) endpoint.searchParams.set('pageToken',pageToken);
    const response=await fetcher(endpoint,{headers:{authorization:`Bearer ${accessToken}`}});
    if(!response.ok) throw new Error(`Blogger posts.list failed (${response.status}): ${await safeApiError(response)}`);
    const list=await response.json() as BloggerPostList;
    drafts.push(...(list.items??[]));
    pageToken=list.nextPageToken;
    if(!pageToken) return drafts;
  }
  throw new Error('Blogger draft list exceeded safe pagination limit');
}

function verifyUpdatedDraft(post:BloggerPost,before:BloggerPost[],after:BloggerPost[],postId:string,title:string,expectedContent:string,expectedEditorialFocus:'AI_SEMICONDUCTOR'|undefined):BloggerDraftUpdateVerification {
  assertTargetDraft(post,postId);
  if(post.title!==title) throw new Error('updated Blogger draft title mismatch');
  const content=post.content??'';
  const h1Count=count(content,/<h1(?:\s|>)/gi);
  const marketDashboardCount=count(content,/class=["'][^"']*\bmarket-dashboard\b[^"']*["']/gi);
  const primarySourcesCount=count(content,/<h2>\s*주요 출처\s*<\/h2>/gi);
  const visibleRawUrlCount=count(stripTags(content),/https?:\/\/\S+/gi);
  const unpublishedRelatedLinksCount=count(content,/<section\b[^>]*class=["'][^"']*\brelated\b/gi);
  const duplicateDraftCount=after.filter(item=>item.id!==postId&&item.title===title).length;
  const marketDataUnchanged=normalizeHtml(extractMarketDashboard(content))===normalizeHtml(extractMarketDashboard(expectedContent));
  const internalTokenCount=count(content,/\b(?:CLAIM-|AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|DATA_NOT_CONNECTED|confidenceScore|verificationStatus|publicationVersion|draftPostId)\b/gi);
  const consumerCheckCount=count(content,/<h3>\s*미국 소비 체크\s*<\/h3>/gi);
  const aiMarkers=['전날 글로벌 시장을 흔든 AI 종목','10년물 국채금리가 5%','CAPEX가 실제 매출과 이익','한국 반도체'];
  const markerPositions=aiMarkers.map(marker=>content.indexOf(marker));
  const aiSemiconductorFocus=expectedEditorialFocus?markerPositions.every((position,index)=>position>=0&&(index===0||position>markerPositions[index-1]!)):null;
  const consumerIndex=content.indexOf('미국 소비 체크');
  const daveConsumerAuxiliary=expectedEditorialFocus?consumerCheckCount===1&&content.indexOf("Dave &amp; Buster's",consumerIndex)>consumerIndex:null;
  if(h1Count!==0) throw new Error(`updated Blogger draft contains ${h1Count} H1 elements`);
  if(marketDashboardCount!==1) throw new Error(`updated Blogger draft contains ${marketDashboardCount} market dashboards`);
  if(primarySourcesCount!==1) throw new Error(`updated Blogger draft contains ${primarySourcesCount} primary source sections`);
  if(visibleRawUrlCount!==0) throw new Error(`updated Blogger draft exposes ${visibleRawUrlCount} raw URLs`);
  if(unpublishedRelatedLinksCount!==0) throw new Error(`updated Blogger draft exposes ${unpublishedRelatedLinksCount} unpublished related sections`);
  if(before.length!==after.length) throw new Error(`draft count changed during patch (${before.length} -> ${after.length})`);
  if(duplicateDraftCount!==0) throw new Error(`duplicate Blogger drafts found: ${duplicateDraftCount}`);
  if(!marketDataUnchanged) throw new Error('updated Blogger draft changed market dashboard values');
  if(internalTokenCount!==0) throw new Error(`updated Blogger draft exposes ${internalTokenCount} internal tokens`);
  if(expectedEditorialFocus&&(!aiSemiconductorFocus||!daveConsumerAuxiliary)) throw new Error('updated Blogger draft editorial focus verification failed');
  assertSingleTarget(after,postId);
  return {postId,status:'DRAFT',title,h1Count,marketDashboardCount,primarySourcesCount,visibleRawUrlCount,unpublishedRelatedLinksCount,duplicateDraftCount,marketDataUnchanged,internalTokenCount,aiSemiconductorFocus,consumerCheckCount,daveConsumerAuxiliary,draftCountBefore:before.length,draftCountAfter:after.length,updatedAt:post.updated??null};
}

function assertTargetDraft(post:BloggerPost,postId:string):void {
  if(post.id!==postId) throw new Error('Blogger API returned a different post ID');
  if(post.status?.toUpperCase()!=='DRAFT') throw new Error(`Blogger post is not DRAFT (${post.status??'missing status'})`);
}
function assertSingleTarget(posts:BloggerPost[],postId:string):void {
  if(posts.filter(post=>post.id===postId).length!==1) throw new Error('target Blogger draft is missing or duplicated in draft list');
}
function requiredEnvironment(name:string|null|undefined,environment:(name:string)=>string|undefined,label:string):string {
  if(!name?.trim()) throw new Error(`missing ${label} environment variable name`);
  const value=environment(name)?.trim();
  if(!value) throw new Error(`missing ${label}`);
  return value;
}
function requiredConfigValue(environmentName:string|null|undefined,fallback:string|null|undefined,environment:(name:string)=>string|undefined,label:string):string {
  const value=(environmentName?.trim()?environment(environmentName):undefined)?.trim()||fallback?.trim();
  if(!value) throw new Error(`missing ${label}`);
  return value;
}
function readHtmlTitle(html:string):string {
  const title=html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/&amp;/g,'&').replace(/&quot;/g,'"').trim();
  if(!title) throw new Error('preview HTML is missing title');
  return title;
}
function extractBloggerArticle(html:string):string {
  const article=html.match(/<article\b[^>]*>[\s\S]*<\/article>/i)?.[0];
  if(!article) throw new Error('preview HTML is missing Blogger article content');
  return article;
}
function stripTags(html:string):string { return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '); }
function extractMarketDashboard(html:string):string { return html.match(/<div\b[^>]*class=["'][^"']*\bmarket-dashboard\b[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0]??''; }
function normalizeHtml(html:string):string { return html.replace(/\s+/g,' ').trim(); }
function count(value:string,pattern:RegExp):number { return [...value.matchAll(pattern)].length; }
async function safeApiError(response:Response):Promise<string> {
  try { const parsed=JSON.parse(await response.text()) as {error?:{status?:string;message?:string}}; return [parsed.error?.status,parsed.error?.message].filter(Boolean).join(' - ').slice(0,300)||'request failed'; }
  catch { return 'request failed'; }
}
