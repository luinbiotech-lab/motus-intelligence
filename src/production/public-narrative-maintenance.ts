import {createHash} from 'node:crypto';
import type {LiveEditorialUnit} from '../editorial/live-cycle.js';
import type {BloggerPostReadback} from '../services/blogger.js';
import {contentFingerprint} from './live-editorial-publish.js';

export interface NarrativeMaintenanceAdapter {
  readPost(postId:string):Promise<BloggerPostReadback>;
  patchPost(postId:string,input:{title:string;content:string}):Promise<BloggerPostReadback>;
  fetchPublic(url:string):Promise<{status:number;body:string}>;
}
export interface NarrativeValidation {
  title:boolean;label:boolean;state:boolean;fingerprint:boolean;sourceSet:boolean;sourceLinks:boolean;sourceDedupe:boolean;
  mobile:boolean;rawUrlSafe:boolean;internalSafe:boolean;commerceDisabled:boolean;repeatedAnalyticalLabels:number;
  connectionExplanationCount:number;titleOnlyConnectionCount:number;internalWarningCount:number;pass:boolean;
}
export interface NarrativeMaintenanceResult {
  postId:string;state:'PUBLISHED'|'DRAFT'|'HOLD';patchCount:0|1;beforeFingerprint:string;afterFingerprint:string|null;
  oldRenderer:{bulletCount:number;analyticalLabelCount:number};newRenderer:{bulletCount:number;analyticalLabelCount:number};
  validation:NarrativeValidation|null;httpStatus:number|null;sourceValidation:boolean;mobileValidation:boolean;
  audit:{event:'PUBLIC_NARRATIVE_PATCH';detail:string}|null;error:string|null;
}

export async function patchPublicNarrative(input:{unit:LiveEditorialUnit;postId:string;expectedState:'PUBLISHED'|'DRAFT';expectedBeforeFingerprint:string;adapter:NarrativeMaintenanceAdapter}):Promise<NarrativeMaintenanceResult>{
  const expected=article(input.unit.render.html);const before=await input.adapter.readPost(input.postId);const beforeFingerprint=contentFingerprint(before.content);const base={postId:input.postId,beforeFingerprint,oldRenderer:metrics(before.content),newRenderer:metrics(expected)};
  if(before.postId!==input.postId||before.status!==input.expectedState||before.title!==input.unit.title||!before.labels.includes(input.unit.render.label))return hold('target identity mismatch');
  if(!sameSources(before.content,expected))return hold('source set changed');
  let patchCount:0|1=0;
  if(canonical(before.content)!==canonical(expected)){
    if(beforeFingerprint!==input.expectedBeforeFingerprint)return hold('pre-patch content fingerprint mismatch');
    await input.adapter.patchPost(input.postId,{title:input.unit.title,content:input.unit.render.html});patchCount=1;
  }
  const after=await input.adapter.readPost(input.postId);const validation=validateNarrative(input.unit,after,input.expectedState);if(!validation.pass)return {...base,state:'HOLD',patchCount,afterFingerprint:contentFingerprint(after.content),validation,httpStatus:null,sourceValidation:validation.sourceSet&&validation.sourceLinks&&validation.sourceDedupe,mobileValidation:validation.mobile,audit:null,error:'post-patch narrative validation failed'};
  let httpStatus:number|null=null;if(input.expectedState==='PUBLISHED'){if(!after.url)return {...base,state:'HOLD',patchCount,afterFingerprint:contentFingerprint(after.content),validation,httpStatus:null,sourceValidation:true,mobileValidation:true,audit:null,error:'public permalink missing'};const page=await input.adapter.fetchPublic(after.url);httpStatus=page.status;if(page.status!==200||!page.body.includes(input.unit.title))return {...base,state:'HOLD',patchCount,afterFingerprint:contentFingerprint(after.content),validation,httpStatus,sourceValidation:true,mobileValidation:true,audit:null,error:'public page verification failed'};}
  return {...base,state:input.expectedState,patchCount,afterFingerprint:contentFingerprint(after.content),validation,httpStatus,sourceValidation:true,mobileValidation:true,audit:{event:'PUBLIC_NARRATIVE_PATCH',detail:'Presentation changed from repeated analytical labels and bullet-heavy blocks to verified fact-context-meaning prose; title, label, source set and publication identity preserved'},error:null};
  function hold(error:string):NarrativeMaintenanceResult{return {...base,state:'HOLD',patchCount:0,afterFingerprint:null,validation:null,httpStatus:null,sourceValidation:false,mobileValidation:false,audit:null,error};}
}

export async function compareNarrativeCandidate(input:{unit:LiveEditorialUnit;postId:string;expectedState:'PUBLISHED'|'DRAFT';adapter:Pick<NarrativeMaintenanceAdapter,'readPost'>}):Promise<{postId:string;changed:boolean;beforeFingerprint:string;candidateFingerprint:string;sourceSetPreserved:boolean;titlePreserved:boolean;labelPreserved:boolean;oldRenderer:{bulletCount:number;analyticalLabelCount:number};newRenderer:{bulletCount:number;analyticalLabelCount:number};patchPerformed:false}>{const before=await input.adapter.readPost(input.postId);const expected=article(input.unit.render.html);if(before.postId!==input.postId||before.status!==input.expectedState)throw new Error('comparison target identity mismatch');return {postId:input.postId,changed:canonical(before.content)!==canonical(expected),beforeFingerprint:contentFingerprint(before.content),candidateFingerprint:contentFingerprint(expected),sourceSetPreserved:sameSources(before.content,expected),titlePreserved:before.title===input.unit.title,labelPreserved:before.labels.includes(input.unit.render.label),oldRenderer:metrics(before.content),newRenderer:metrics(expected),patchPerformed:false};}

export function validateNarrative(unit:LiveEditorialUnit,post:BloggerPostReadback,state:'PUBLISHED'|'DRAFT'):NarrativeValidation {const expected=article(unit.render.html);const visible=strip(post.content);const links=sourceUrls(post.content);const expectedLinks=sourceUrls(expected);const sourceBlock=post.content.slice(Math.max(0,post.content.lastIndexOf('주요 출처')));const sourceOnly=sourceUrls(sourceBlock);const repeatedAnalyticalLabels=count(visible,/(?:무슨 일이 있었나|왜 중요한가|핵심 내용|시장 연결)\s*:?/g);const connection=sectionHtml(post.content,'산업-기업-연결');const connectionExplanationCount=(connection.match(/<article\b/gi)??[]).filter((_,index)=>{const cards=[...connection.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)];return (cards[index]?.[1]?.match(/<p\b/gi)??[]).length>=1;}).length;const titleOnlyConnectionCount=Math.max(0,(connection.match(/<article\b/gi)??[]).length-connectionExplanationCount);const internalWarningCount=count(post.content,/BROKERAGE_RESEARCH_NOT_AVAILABLE/g);const result={title:post.title===unit.title,label:post.labels.includes(unit.render.label),state:post.status===state,fingerprint:canonical(post.content)===canonical(expected),sourceSet:sameSources(post.content,expected),sourceLinks:expectedLinks.length>0&&expectedLinks.every(url=>links.includes(url)),sourceDedupe:sourceOnly.length>0&&new Set(sourceOnly).size===sourceOnly.length,mobile:/max-width\s*:\s*100%/i.test(post.content)&&/box-sizing\s*:\s*border-box/i.test(post.content),rawUrlSafe:!/(?:https?:\/\/)[^\s<]+/i.test(post.content.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi,'').replace(/<[^>]+>/g,' ')),internalSafe:!/(?:whyItMatters|marketConnection|industryConnection|eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore|claimId|reportId)/i.test(post.content),commerceDisabled:!/(?:affiliate|제휴|광고|commerce)/i.test(post.content),repeatedAnalyticalLabels,connectionExplanationCount,titleOnlyConnectionCount,internalWarningCount,pass:false};result.pass=Object.entries(result).filter(([key])=>!['repeatedAnalyticalLabels','connectionExplanationCount','titleOnlyConnectionCount','internalWarningCount','pass'].includes(key)).every(([,value])=>value===true)&&repeatedAnalyticalLabels===0&&titleOnlyConnectionCount===0&&internalWarningCount===0&&(unit.category!=='AI_INTELLIGENCE'||connectionExplanationCount>0);return result;}

function metrics(html:string){return {bulletCount:(html.match(/<li\b/gi)??[]).length,analyticalLabelCount:count(strip(html),/(?:무슨 일이 있었나|왜 중요한가|핵심 내용|시장 연결)\s*:?/g)};}
function sameSources(left:string,right:string):boolean{return JSON.stringify([...new Set(sourceUrls(left))].sort())===JSON.stringify([...new Set(sourceUrls(right))].sort());}
function sourceUrls(html:string):string[]{return [...html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match=>decode(match[1]!));}
function article(html:string):string{const found=html.match(/<article\b[^>]*>[ -￿]*<\/article>/i);if(!found)throw new Error('article missing');return found[0];}
function sectionHtml(html:string,slug:string):string{return html.match(new RegExp(`<section\\b[^>]*data-section=["']${slug}["'][^>]*>[\\s\\S]*?<\\/section>`,'i'))?.[0]??'';}
function strip(html:string):string{return decode(html.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function canonical(html:string):string{return decode(html).replace(/>\s+</g,'><').replace(/\s+/g,' ').trim();}
function decode(value:string):string{return value.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");}
function count(value:string,pattern:RegExp):number{return (value.match(pattern)??[]).length;}
export function narrativeFingerprint(value:string):string{return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;}
