import {createHash} from 'node:crypto';
import type {NextDailyUnit} from '../editorial/next-live-cycle.js';
import type {BloggerPostReadback} from '../services/blogger.js';
import {createSearchTrackingRegistration,type SearchTrackingRegistration} from '../search/measurement.js';

export interface NextDailyAdapter {
  findMatches(input:{title:string;label:string}):Promise<BloggerPostReadback[]>;
  readPost(postId:string):Promise<BloggerPostReadback>;
  insertDraft(input:{title:string;content:string;labels:string[]}):Promise<BloggerPostReadback>;
  publishDraft(postId:string):Promise<{postId:string;publicPostUrl:string;publishedAt:string}>;
  fetchPublic(url:string):Promise<{status:number;body:string}>;
}
export interface NextDailyValidation {postId:boolean;state:boolean;title:boolean;label:boolean;fingerprint:boolean;sourceAnchors:boolean;sourceDedupe:boolean;rawUrlSafe:boolean;internalSafe:boolean;fixtureSafe:boolean;commerceDisabled:boolean;mobile:boolean;colorRule:boolean;editorialFirst:boolean;chart:boolean;svgCount:number;pass:boolean}
export interface NextDailyOperationRecord {publicationId:string;category:NextDailyUnit['category'];issueDate:string;title:string;label:string;draftPostId:string|null;state:'DRAFT'|'PUBLISHED'|'HOLD'|'FAILED';publicPostUrl:string|null;publishedAt:string|null;humanReview:{state:'APPROVAL_REQUIRED'|'APPROVED';reviewer:'human'|null;reviewedAt:string|null;provenance:'USER_EXPLICIT_APPROVAL'|null};remoteDuplicateCount:number;insertCount:number;publishCount:number;validation:NextDailyValidation|null;publicHttpStatus:number|null;searchRegistration:SearchTrackingRegistration|null;contentFingerprint:string|null;audit:Array<{at:string;event:string;detail:string}>;error:string|null;commerce:{enabled:false}}

export async function publishApprovedNextDaily(input:{unit:NextDailyUnit;draftPostId:string;approvedAt:string;adapter:NextDailyAdapter}):Promise<NextDailyOperationRecord>{
  const {unit,draftPostId,approvedAt,adapter}=input;const audit=[{at:approvedAt,event:'HUMAN_REVIEW_APPROVED',detail:'User explicitly approved this exact Draft for production publication'}];const base=recordBase(unit,{state:'APPROVED',reviewer:'human',reviewedAt:approvedAt,provenance:'USER_EXPLICIT_APPROVAL'});
  let publishCount=0;
  try{
    const draft=await adapter.readPost(draftPostId);const preflight=validateNextDaily(unit,draft,draftPostId,'DRAFT');if(!preflight.pass)return {...base,draftPostId,state:'HOLD',validation:preflight,audit,error:'pre-publish validation failed'};
    const matches=await remoteMatches(unit,adapter);const others=matches.filter(post=>post.postId!==draftPostId);if(others.length)return {...base,draftPostId,state:'HOLD',remoteDuplicateCount:others.length,validation:preflight,audit,error:'remote duplicate exists besides approved Draft'};
    publishCount=1;let published:{postId:string;publicPostUrl:string;publishedAt:string};
    try{published=await adapter.publishDraft(draftPostId);}catch(error){const recovered=await adapter.readPost(draftPostId);if(recovered.status!=='PUBLISHED'||!recovered.url)throw error;published={postId:recovered.postId,publicPostUrl:recovered.url,publishedAt:new Date().toISOString()};audit.push({at:published.publishedAt,event:'PUBLISH_RESPONSE_RECOVERED',detail:'Remote PUBLISHED state confirmed; no publish retry'});}
    const stored=await adapter.readPost(draftPostId);const validation=validateNextDaily(unit,stored,draftPostId,'PUBLISHED');const page=await adapter.fetchPublic(published.publicPostUrl);const publicSafe=page.status===200&&page.body.includes(unit.title)&&!leaks(page.body);
    if(!validation.pass||stored.url!==published.publicPostUrl||!publicSafe)return {...base,draftPostId,state:'FAILED',publishCount,validation,publicHttpStatus:page.status,contentFingerprint:fingerprint(stored.content),audit,error:'post-publish validation failed'};
    audit.push({at:published.publishedAt,event:'PUBLISHED',detail:`Blogger post ${draftPostId} published exactly once and returned HTTP 200`});
    return {...base,draftPostId,state:'PUBLISHED',publicPostUrl:published.publicPostUrl,publishedAt:published.publishedAt,publishCount,validation,publicHttpStatus:page.status,searchRegistration:createSearchTrackingRegistration(unit.publicationId,published.publicPostUrl,published.publishedAt),contentFingerprint:fingerprint(stored.content),audit,error:null};
  }catch(error){return {...base,draftPostId,state:'FAILED',publishCount,validation:null,audit,error:error instanceof Error?error.message:String(error)};}
}

export async function createReviewDraft(input:{unit:NextDailyUnit;at:string;adapter:NextDailyAdapter}):Promise<NextDailyOperationRecord>{
  const {unit,at,adapter}=input;const base=recordBase(unit,{state:'APPROVAL_REQUIRED',reviewer:null,reviewedAt:null,provenance:null});
  try{
    const matches=await remoteMatches(unit,adapter);if(matches.length>1)return {...base,state:'HOLD',remoteDuplicateCount:matches.length,error:'multiple matching remote posts'};
    const post=matches[0]??await adapter.insertDraft({title:unit.title,content:unit.render.html,labels:[unit.label]});const insertCount=matches.length?0:1;const validation=validateNextDaily(unit,post,post.postId,'DRAFT');
    if(!validation.pass)return {...base,draftPostId:post.postId,state:'HOLD',remoteDuplicateCount:Math.max(0,matches.length-1),insertCount,validation,contentFingerprint:fingerprint(post.content),audit:[{at,event:'DRAFT_VALIDATION_FAILED',detail:'Blogger Draft did not pass stored-content validation'}],error:'draft validation failed'};
    return {...base,draftPostId:post.postId,state:'DRAFT',remoteDuplicateCount:0,insertCount,validation,contentFingerprint:fingerprint(post.content),audit:[{at,event:insertCount?'DRAFT_CREATED':'DRAFT_RECOVERED',detail:insertCount?'One review Draft created; no publish action':'Existing matching Draft reused; duplicate creation blocked'}],error:null};
  }catch(error){return {...base,state:'FAILED',audit:[{at,event:'DRAFT_OPERATION_FAILED',detail:'No published state was created'}],error:error instanceof Error?error.message:String(error)};}
}

export function validateNextDaily(unit:NextDailyUnit,post:BloggerPostReadback,postId:string,state:'DRAFT'|'PUBLISHED'):NextDailyValidation {
  const expected=article(unit.render.html);const html=post.content;const visible=html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi,'').replace(/<[^>]+>/g,' ');const links=anchors(html);const expectedLinks=anchors(expected);const lastSection=html.lastIndexOf('<section');const sourceLinks=anchors(lastSection>=0?html.slice(lastSection):html);const svgCount=(html.match(/<svg\b/gi)??[]).length;
  const checks={postId:post.postId===postId,state:post.status===state,title:post.title===unit.title,label:post.labels.includes(unit.label),fingerprint:canonical(expected)===canonical(html),sourceAnchors:expectedLinks.length>=unit.sourceCount&&expectedLinks.every(url=>links.includes(url)),sourceDedupe:sourceLinks.length>0&&new Set(sourceLinks).size===sourceLinks.length,rawUrlSafe:!/(?:https?:\/\/)[^\s<]+/i.test(visible),internalSafe:!leaks(html),fixtureSafe:!/(?:fixture|sample marker|SAMPLE · PREVIEW)/i.test(html),commerceDisabled:!/(?:affiliate|제휴|광고|commerce)/i.test(html),mobile:/overflow-x\s*:\s*hidden/i.test(html)&&/max-width\s*:\s*100%/i.test(html)&&/box-sizing\s*:\s*border-box/i.test(html),colorRule:unit.category==='AI_INTELLIGENCE'||(html.includes('#c62828')&&html.includes('#1565c0'))||/data-visualization=["']korea-investor-flow["']/i.test(html),editorialFirst:/data-layout=["']editorial-article-4q["']/i.test(html)&&!/(?:>왜 중요한가<|>무슨 일이 있었나<|>산업 연결<|>시장 연결<|>핵심 내용<)/i.test(html),chart:unit.category!=='US_MARKET'||(svgCount===4&&['S&P 500','Nasdaq','Dow Jones','Russell 2000','최근 5거래일 종가'].every(text=>decode(html).includes(text))),svgCount};
  return {...checks,pass:Object.entries(checks).filter(([key])=>key!=='svgCount').every(([,value])=>value===true)};
}

async function remoteMatches(unit:NextDailyUnit,adapter:NextDailyAdapter):Promise<BloggerPostReadback[]>{const found:BloggerPostReadback[]=[];for(const label of [unit.label,...unit.labelAliases])for(const post of await adapter.findMatches({title:unit.title,label}))if(post.title===unit.title&&!found.some(item=>item.postId===post.postId))found.push(post);return found;}
function recordBase(unit:NextDailyUnit,humanReview:NextDailyOperationRecord['humanReview']):NextDailyOperationRecord{return {publicationId:unit.publicationId,category:unit.category,issueDate:unit.issueDate,title:unit.title,label:unit.label,draftPostId:null,state:'HOLD',publicPostUrl:null,publishedAt:null,humanReview,remoteDuplicateCount:0,insertCount:0,publishCount:0,validation:null,publicHttpStatus:null,searchRegistration:null,contentFingerprint:null,audit:[],error:null,commerce:{enabled:false}};}
function article(html:string):string{const match=html.match(/<article\b[^>]*>[\s\S]*<\/article>/i);if(!match)throw new Error('expected article missing');return match[0];}
function anchors(html:string):string[]{return [...html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match=>decode(match[1]!));}
function canonical(html:string):string{return decode(html).replace(/>\s+</g,'><').replace(/\s+/g,' ').trim();}
function decode(value:string):string{return value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");}
function leaks(html:string):boolean{return /(?:eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore|claimId|reportId|BLOGGER_REFRESH_TOKEN)/i.test(html);}
function fingerprint(html:string):string{return `sha256:${createHash('sha256').update(canonical(html)).digest('hex')}`;}
