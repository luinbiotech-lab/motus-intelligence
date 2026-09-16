import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { EvidencePackage, ReportRecord } from '../domain/models.js';
import type { PublisherContentDocument } from '../content/publisher-schema.js';
import { renderMotusBloggerContent, type MotusPublisherConfig } from '../publishers/motus.js';
import { assertPublicBloggerHtmlSafe, type BloggerPublicationRecord } from './blogger.js';
import { renderDailyEditorial, type EditorialReviewContext } from './editorial.js';

export interface EditorialReviewSource { role:'MARKET_FLOW'|'CROSS_VERIFICATION'|'OFFICIAL_DATA'|'OFFICIAL_COMPANY'; label:string; url:string; finding:string }
export interface EditorialReviewPlan {
  version:'2E.2.0-AI-REVIEW.1';
  reportId:string;
  tradingDate:string;
  reviewStatus:'PENDING_HUMAN_APPROVAL';
  context:EditorialReviewContext;
  sources:EditorialReviewSource[];
}
export interface EditorialReviewResult {
  candidateHtml:string;
  candidateMarkdown:string;
  humanReview:Record<string,unknown>;
  publicationFingerprint:string;
}

export function buildEditorialReviewCandidate(report:ReportRecord,evidence:EvidencePackage,publication:BloggerPublicationRecord,plan:EditorialReviewPlan,publisher:MotusPublisherConfig):EditorialReviewResult {
  if(plan.reportId!==report.reportId||publication.reportId!==report.reportId) throw new Error('editorial review reportId mismatch');
  if(plan.tradingDate!==report.tradingDate||publication.tradingDate!==report.tradingDate) throw new Error('editorial review tradingDate mismatch');
  if(publication.status!=='DRAFT'||!publication.draftPostId||publication.publicPostUrl!==null) throw new Error('editorial review requires an unresolved Blogger draft');
  if(plan.reviewStatus!=='PENDING_HUMAN_APPROVAL') throw new Error('editorial review cannot auto-approve');
  const editorial=renderDailyEditorial(report,evidence,plan.context);
  const sources=uniqueSources([
    ...publication.sources,
    ...plan.sources.map(({label,url})=>({label,url}))
  ]);
  const metadata={...publication.metadata,categories:[...new Set([...publication.metadata.categories,'AI & Industry' as const])],sectors:[...new Set([...publication.metadata.sectors,'AI Semiconductors'])],themes:[...new Set([...publication.metadata.themes,'AI valuation','AI CAPEX'])]};
  const document:PublisherContentDocument={title:publication.title,seoTitle:publication.seoTitle,metaDescription:editorial.seo.description,slug:publication.slug,markdown:editorial.bloggerMarkdown,hashtags:editorial.seo.hashtags,glossary:editorial.terms,sources,metadata};
  const rendered=renderMotusBloggerContent(document,publisher);
  assertPublicBloggerHtmlSafe(rendered.html);
  const apIssue=evidence.validationResult.issues.find(item=>item.recordId==='AP-MARKET-CLOSE-2026-09-15');
  const humanReview={
    version:plan.version,
    reportId:report.reportId,
    tradingDate:report.tradingDate,
    reviewStatus:plan.reviewStatus,
    proposedAction:'승인 후 기존 draft의 title/content만 patch',
    publishAllowed:false,
    bloggerWriteAttempted:false,
    createNewDraft:false,
    preservedDraftPostId:publication.draftPostId,
    preservedPublicPostUrl:publication.publicPostUrl,
    unresolvedItem:{recordId:apIssue?.recordId??'AP-MARKET-CLOSE-2026-09-15',status:apIssue?.status??'LOW_CONFIDENCE',reason:apIssue?.message??'B-tier 단독 기사 근거는 Human Review 유지'},
    crossVerification:plan.sources.map(source=>({role:source.role,label:source.label,url:source.url,finding:source.finding})),
    editorialChecks:['AI 주가 흐름','금리 5% 부근','밸류에이션 부담','AI CAPEX/실적 확인 필요','한국 반도체 연결','미국 소비 체크'],
    approvalInstruction:'Reuters와 공식자료의 보강 근거를 사람이 확인한 뒤에만 기존 Blogger draft update를 별도 실행한다.'
  };
  return {candidateHtml:rendered.html,candidateMarkdown:editorial.bloggerMarkdown,humanReview,publicationFingerprint:fingerprint(publication)};
}

export async function writeEditorialReviewArtifacts(report:ReportRecord,evidence:EvidencePackage,publication:BloggerPublicationRecord,plan:EditorialReviewPlan,publisher:MotusPublisherConfig,outputDir:string):Promise<string[]> {
  const before=fingerprint(publication);
  const result=buildEditorialReviewCandidate(report,evidence,publication,plan,publisher);
  if(result.publicationFingerprint!==before) throw new Error('publication record changed while building review candidate');
  await mkdir(outputDir,{recursive:true});
  const base=`${outputDir}/${report.reportId}-ai-semiconductor`;
  const paths=[`${base}-review-preview.html`,`${base}-review-preview.md`,`${base}-human-review.json`];
  await Promise.all([
    writeFile(paths[0]!,result.candidateHtml),
    writeFile(paths[1]!,result.candidateMarkdown),
    writeFile(paths[2]!,JSON.stringify({...result.humanReview,publicationRecordSha256:before},null,2))
  ]);
  return paths;
}

function fingerprint(value:unknown):string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function uniqueSources(values:{label:string;url:string}[]):{label:string;url:string}[] { const seen=new Set<string>(); return values.filter(item=>!seen.has(item.url)&&seen.add(item.url)); }
