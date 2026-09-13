import type { ClaimRecord, ClaimVerificationStatus, ConflictRecord, ReportApprovalStatus, ReviewQueueItem } from '../domain/models.js';

const rank: Record<ClaimVerificationStatus, number> = {
  CONFLICT: 10,
  UNVERIFIED: 8,
  REVIEW_REQUIRED: 7,
  PARTIALLY_VERIFIED: 6,
  INSUFFICIENT_SOURCES: 5,
  PRIMARY_SOURCE_ONLY: 2,
  VERIFIED: 1,
  REJECTED: 9
};

export function buildReviewQueue(claims:ClaimRecord[],conflicts:ConflictRecord[]):ReviewQueueItem[] {
  const conflictMap=new Map<string,ConflictRecord[]>();
  for(const conflict of conflicts) conflictMap.set(conflict.claimId,[...(conflictMap.get(conflict.claimId)??[]),conflict]);
  return claims
    .map(claim=>{
      const claimConflicts=conflictMap.get(claim.claimId)??[];
      const highConflict=claimConflicts.some(item=>item.materiality==='CRITICAL'||item.materiality==='HIGH');
      const priority=highConflict?10:rank[claim.verificationStatus];
      return {itemId:`REVIEW-${claim.claimId}`,claimId:claim.claimId,priority,reason:reasonFor(claim,claimConflicts),verificationStatus:claim.verificationStatus,conflictIds:claimConflicts.map(item=>item.conflictId)};
    })
    .filter(item=>item.priority>1)
    .sort((a,b)=>b.priority-a.priority||a.claimId.localeCompare(b.claimId));
}

export function initialApprovalStatus(hasBlockingValidation:boolean,claims:ClaimRecord[],conflicts:ConflictRecord[]):ReportApprovalStatus {
  if(hasBlockingValidation) return 'BLOCKED';
  if(conflicts.some(item=>item.materiality==='HIGH'||item.materiality==='CRITICAL')) return 'REVIEW_REQUIRED';
  if(claims.some(claim=>claim.manualReviewRequired&&claim.verificationStatus!=='PARTIALLY_VERIFIED')) return 'REVIEW_REQUIRED';
  return 'AUTO_VALIDATED';
}

export function transitionApprovalStatus(current:ReportApprovalStatus,action:'approve'|'publish'|'block'):ReportApprovalStatus {
  if(action==='block') return 'BLOCKED';
  if(action==='approve') return current==='AUTO_VALIDATED'||current==='REVIEW_REQUIRED'||current==='DRAFT'?'APPROVED':current;
  if(action==='publish') return current==='APPROVED'?'PUBLISHED':'BLOCKED';
  return current;
}

function reasonFor(claim:ClaimRecord,conflicts:ConflictRecord[]) {
  const severe=conflicts.find(item=>item.materiality==='CRITICAL'||item.materiality==='HIGH');
  if(severe) return `${severe.materiality} conflict`;
  if(claim.verificationStatus==='VERIFIED') return '정상 검증 claim';
  return claim.verificationStatus;
}
