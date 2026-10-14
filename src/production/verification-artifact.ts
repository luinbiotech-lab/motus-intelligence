import {createHash} from 'node:crypto';
import type {SplitPublicationUnit} from '../intelligence/split-daily-production.js';
import type {DailyCategory} from '../operations/daily-orchestrator.js';
import type {InternalSourceAuditEntry} from '../operations/internal-live-daily.js';
import type {KoreaCrossVerificationArtifact} from '../operations/korea-official.js';
import {validateLiveDailyPayload,type LiveDailyPayload} from '../operations/live-daily.js';
import {evaluateEditorialQuality} from './editorial-quality.js';

export type LiveSourceMode='internal'|'http'|'snapshot';
export interface ProductionVerificationArtifact {
 schemaVersion:'1.1';category:DailyCategory;operationDate:string;observedDate:string;sourceMode:LiveSourceMode;
 verification:'VERIFIED'|'REVIEW_REQUIRED'|'FAILED';unresolvedConflicts:string[];
 provenancePass:boolean;sourceDiversityPass:boolean;sourceLinksPass:boolean;mobilePass:boolean;editorialQualityPass:boolean;leakagePass:boolean;
 duplicateCheck:'PENDING_REMOTE';duplicateUncertainty:boolean;articleFingerprint:string;
 commerceEnabled:false;verifiedAt:string;expiresAt:string;sourceAuditIds:string[];sourceAuditFingerprint:string;crossVerificationFingerprint:string|null;crossVerification:KoreaCrossVerificationArtifact|null;
}
export function buildProductionVerification(payload:LiveDailyPayload,sourceMode:LiveSourceMode,audit:InternalSourceAuditEntry[],verifiedAt:string,crossVerification:KoreaCrossVerificationArtifact|null=null,operationDate=payload.unit.observedDate):ProductionVerificationArtifact {
 const unit=payload.unit,reasons=validateLiveDailyPayload(unit.category,payload,verifiedAt),urls=unit.viewModel.sources.map(source=>source.url),passed=new Set(audit.filter(item=>item.status==='PASS').map(item=>canonical(item.url))),html=unit.render.html;
 const sourceDomains=new Set(urls.map(providerDomain)),sourceDiversityPass=sourceDomains.size>=2;
 const provenancePass=sourceMode!=='snapshot'&&urls.length>0&&urls.every(url=>passed.has(canonical(url)))&&sourceDiversityPass;
 const renderedLinks=new Set([...html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(match=>canonical(decode(match[1]!)))),sourceLinksPass=urls.length>0&&urls.every(url=>renderedLinks.has(canonical(url)));
 const mobilePass=/max-width\s*:\s*100%/i.test(html)&&/(overflow-x\s*:\s*hidden|word-break\s*:\s*keep-all)/i.test(html);
 const quality=evaluateEditorialQuality(unit.title,html),editorialQualityPass=quality.pass;
 const leakagePass=!/(eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore|claimId|reportId|fixture|placeholder)/i.test(html);
 if(unit.category==='KOREA_MARKET'&&crossVerification?.verification!=='VERIFIED')reasons.push('Korea official cross-verification failed');if(!sourceDiversityPass)reasons.push('independent source diversity failed');if(!provenancePass)reasons.push('production provenance audit failed');if(!sourceLinksPass)reasons.push('public source links failed');if(!mobilePass)reasons.push('mobile validation failed');if(!editorialQualityPass)reasons.push(...quality.reasons.map(reason=>'editorial quality: '+reason));if(!leakagePass)reasons.push('public leakage validation failed');
 const unresolvedConflicts=[...new Set(reasons)],verification=unresolvedConflicts.length?'REVIEW_REQUIRED':'VERIFIED';
 const sourceAuditIds=audit.filter(item=>item.status==='PASS').map(item=>item.sourceId).sort();
 return {schemaVersion:'1.1',category:unit.category,operationDate,observedDate:unit.observedDate,sourceMode,verification,unresolvedConflicts,provenancePass,sourceDiversityPass,sourceLinksPass,mobilePass,editorialQualityPass,leakagePass,duplicateCheck:'PENDING_REMOTE',duplicateUncertainty:true,articleFingerprint:'sha256:'+createHash('sha256').update(html).digest('hex'),commerceEnabled:false,verifiedAt,expiresAt:new Date(Date.parse(verifiedAt)+90*60*1000).toISOString(),sourceAuditIds,sourceAuditFingerprint:fingerprint(audit),crossVerificationFingerprint:crossVerification?fingerprint(crossVerification):null,crossVerification};
}
export function candidateFromVerification(unit:SplitPublicationUnit,artifact:ProductionVerificationArtifact,at=artifact.verifiedAt){const mismatch=artifact.schemaVersion!=='1.1'||artifact.sourceMode!=='internal'||artifact.category!==unit.category||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(artifact.operationDate)||artifact.observedDate!==unit.observedDate||artifact.articleFingerprint!=='sha256:'+unit.contentFingerprint||!artifact.sourceAuditFingerprint||Date.parse(at)>Date.parse(artifact.expiresAt);return {unit,operationDate:artifact.operationDate,verification:mismatch?'FAILED' as const:artifact.verification,unresolvedConflicts:mismatch?[...artifact.unresolvedConflicts,'verification artifact is stale, non-internal, or context/fingerprint mismatched']:artifact.unresolvedConflicts,duplicateUncertainty:artifact.duplicateUncertainty||artifact.duplicateCheck==='PENDING_REMOTE',provenancePass:artifact.provenancePass,sourceLinksPass:artifact.sourceLinksPass,publicationFingerprint:artifact.articleFingerprint,commerceEnabled:false as const}}
function providerDomain(value:string){try{const parts=new URL(value).hostname.toLowerCase().split('.');return parts.slice(-2).join('.')}catch{return ''}}
function canonical(value:string){try{const url=new URL(value);url.hash='';if(url.pathname.length>1)url.pathname=url.pathname.replace(/\/+$/,'');return url.toString()}catch{return value}}
function decode(value:string){return value.replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"')}
function fingerprint(value:unknown){return 'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex')}
