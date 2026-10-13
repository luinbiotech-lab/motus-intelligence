import {createHash} from 'node:crypto';
import type {SplitPublicationUnit} from '../intelligence/split-daily-production.js';
import type {DailyCategory} from '../operations/daily-orchestrator.js';
import type {InternalSourceAuditEntry} from '../operations/internal-live-daily.js';
import {validateLiveDailyPayload,type LiveDailyPayload} from '../operations/live-daily.js';

export type LiveSourceMode='internal'|'http'|'snapshot';
export interface ProductionVerificationArtifact {
 schemaVersion:'1.0';category:DailyCategory;observedDate:string;sourceMode:LiveSourceMode;
 verification:'VERIFIED'|'REVIEW_REQUIRED'|'FAILED';unresolvedConflicts:string[];
 provenancePass:boolean;sourceDiversityPass:boolean;sourceLinksPass:boolean;mobilePass:boolean;editorialQualityPass:boolean;leakagePass:boolean;
 duplicateCheck:'PENDING_REMOTE';duplicateUncertainty:boolean;articleFingerprint:string;
 commerceEnabled:false;verifiedAt:string;sourceAuditIds:string[];
}
export function buildProductionVerification(payload:LiveDailyPayload,sourceMode:LiveSourceMode,audit:InternalSourceAuditEntry[],verifiedAt:string):ProductionVerificationArtifact {
 const unit=payload.unit,reasons=validateLiveDailyPayload(unit.category,payload,verifiedAt),urls=unit.viewModel.sources.map(source=>source.url),passed=new Set(audit.filter(item=>item.status==='PASS').map(item=>canonical(item.url))),html=unit.render.html,text=html.replace(/<[^>]+>/g,' ');
 const sourceDomains=new Set(urls.map(providerDomain)),sourceDiversityPass=sourceDomains.size>=2;
 const provenancePass=sourceMode!=='snapshot'&&urls.length>0&&urls.every(url=>passed.has(canonical(url)))&&sourceDiversityPass;
 const sourceLinksPass=urls.length>0&&urls.every(url=>html.includes(url.replaceAll('&','&amp;'))||html.includes(url));
 const mobilePass=/max-width\s*:\s*100%/i.test(html)&&/(overflow-x\s*:\s*hidden|word-break\s*:\s*keep-all)/i.test(html);
 const editorialQualityPass=unit.title.length>=12&&text.replace(/\s+/g,' ').trim().length>=500&&!/(무슨 일이 있었나|왜 중요한가|핵심 내용|산업 연결|시장 연결)\s*:?/i.test(text);
 const leakagePass=!/(eventId|themeId|companyId|publicationId|verificationStatus|confidenceScore|claimId|reportId|fixture|placeholder)/i.test(html);
 if(!sourceDiversityPass)reasons.push('independent source diversity failed');if(!provenancePass)reasons.push('production provenance audit failed');if(!sourceLinksPass)reasons.push('public source links failed');if(!mobilePass)reasons.push('mobile validation failed');if(!editorialQualityPass)reasons.push('editorial quality failed');if(!leakagePass)reasons.push('public leakage validation failed');
 const unresolvedConflicts=[...new Set(reasons)],verification=unresolvedConflicts.length?'REVIEW_REQUIRED':'VERIFIED';
 return {schemaVersion:'1.0',category:unit.category,observedDate:unit.observedDate,sourceMode,verification,unresolvedConflicts,provenancePass,sourceDiversityPass,sourceLinksPass,mobilePass,editorialQualityPass,leakagePass,duplicateCheck:'PENDING_REMOTE',duplicateUncertainty:true,articleFingerprint:'sha256:'+createHash('sha256').update(html).digest('hex'),commerceEnabled:false,verifiedAt,sourceAuditIds:audit.filter(item=>item.status==='PASS').map(item=>item.sourceId)};
}
export function candidateFromVerification(unit:SplitPublicationUnit,artifact:ProductionVerificationArtifact){const mismatch=artifact.category!==unit.category||artifact.observedDate!==unit.observedDate||artifact.articleFingerprint!=='sha256:'+unit.contentFingerprint;return {unit,verification:mismatch?'FAILED' as const:artifact.verification,unresolvedConflicts:mismatch?[...artifact.unresolvedConflicts,'verification artifact context or fingerprint mismatch']:artifact.unresolvedConflicts,duplicateUncertainty:artifact.duplicateUncertainty||artifact.duplicateCheck==='PENDING_REMOTE',provenancePass:artifact.provenancePass,sourceLinksPass:artifact.sourceLinksPass,publicationFingerprint:artifact.articleFingerprint,commerceEnabled:false as const}}
function providerDomain(value:string){try{const parts=new URL(value).hostname.toLowerCase().split('.');return parts.slice(-2).join('.')}catch{return ''}}
function canonical(value:string){try{const url=new URL(value);url.hash='';return url.toString()}catch{return value}}

/** Rebuild the gate from source audit; never trust persisted VERIFIED/boolean flags alone. */
export function revalidateProductionEvidence(
 unit:SplitPublicationUnit,
 artifact:ProductionVerificationArtifact,
 audit:{schemaVersion:string;sourceMode:string;category:string;entries:InternalSourceAuditEntry[]},
 checkedAt:string,
):{valid:boolean;reasons:string[];candidate:ReturnType<typeof candidateFromVerification>}{
 const reasons:string[]=[];
 if(artifact.schemaVersion!=='1.0'||audit.schemaVersion!=='1.0')reasons.push('unsupported evidence schema');
 if(artifact.sourceMode!=='internal'||audit.sourceMode!=='internal')reasons.push('non-internal source mode');
 if(artifact.category!==unit.category||audit.category!==unit.category)reasons.push('category mismatch');
 if(!Array.isArray(audit.entries)||!Array.isArray(artifact.unresolvedConflicts)||!Array.isArray(artifact.sourceAuditIds))reasons.push('malformed evidence');
 if(!Number.isFinite(Date.parse(artifact.verifiedAt))||!Number.isFinite(Date.parse(checkedAt)))reasons.push('invalid verification timestamp');
 if(Date.parse(artifact.verifiedAt)>Date.parse(checkedAt)+60_000)reasons.push('future verification timestamp');
 if(!reasons.length){
  try {
   const payload:LiveDailyPayload={schemaVersion:'1.0',session:{state:'COMPLETED',observedDate:unit.observedDate,completedAt:artifact.verifiedAt},unit};
   const rebuilt=buildProductionVerification(payload,'internal',audit.entries,artifact.verifiedAt);
   if(JSON.stringify(rebuilt)!==JSON.stringify(artifact))reasons.push('artifact and recomputed evidence differ');
   if(buildProductionVerification(payload,'internal',audit.entries,checkedAt).verification!=='VERIFIED')reasons.push('evidence failed current verification');
  }catch{reasons.push('source evidence recomputation failed')}
 }
 if(artifact.verification!=='VERIFIED')reasons.push('evidence not VERIFIED');
 const candidate=candidateFromVerification(unit,artifact);
 if(reasons.length)candidate.verification='FAILED';
 candidate.unresolvedConflicts=[...new Set([...candidate.unresolvedConflicts,...reasons])];
 return {valid:reasons.length===0,reasons,candidate};
}
