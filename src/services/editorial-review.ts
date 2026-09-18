import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { EvidencePackage, ReportRecord } from '../domain/models.js';
import type { MajorIndexHistory, PublisherContentDocument } from '../content/publisher-schema.js';
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
  marketHistory?:MajorIndexHistory;
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
  const document:PublisherContentDocument={title:publication.title,seoTitle:publication.seoTitle,metaDescription:editorial.seo.description,slug:publication.slug,markdown:editorial.bloggerMarkdown,hashtags:editorial.seo.hashtags,glossary:editorial.terms,sources,metadata,...(plan.marketHistory?{marketHistory:plan.marketHistory}:{})};
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

export async function writeEditorialLayoutComparison(report:ReportRecord,evidence:EvidencePackage,publication:BloggerPublicationRecord,plan:EditorialReviewPlan,publisher:MotusPublisherConfig,beforePath:string,outputDir:string):Promise<{files:string[];comparison:Record<string,unknown>}> {
  const before=await readFile(beforePath,'utf8');
  if(fingerprint(before)!==fingerprint(publication.html)) throw new Error('before preview does not match preserved publication HTML');
  const publicationBefore=fingerprint(publication);
  const candidate=buildEditorialReviewCandidate(report,evidence,publication,plan,publisher);
  if(candidate.publicationFingerprint!==publicationBefore||fingerprint(publication)!==publicationBefore) throw new Error('publication record changed during layout preview');
  const after=candidate.candidateHtml;
  const expectedSections=['Opening Summary','시장 한눈에 보기','시장을 움직인 핵심 요인','AI·반도체 / 주요 산업','한국시장 연결 포인트','오늘 체크리스트','용어해설','주요 출처'];
  const actualSections=[...after.matchAll(/<h2>([^<]+)<\/h2>/g)].map(match=>decodeHtml(match[1]!));
  if(JSON.stringify(actualSections)!==JSON.stringify(expectedSections)) throw new Error(`category block section order mismatch: ${actualSections.join(' > ')}`);
  const beforeMarket=marketDashboardText(before),afterMarket=marketDashboardText(after);
  if(!beforeMarket||beforeMarket!==afterMarket) throw new Error('category block preview changed market dashboard values');
  assertPublicBloggerHtmlSafe(after);
  const comparison={
    reportId:report.reportId,
    tradingDate:report.tradingDate,
    bloggerApiCalled:false,
    publicationRecordChanged:false,
    titleUnchanged:htmlTitle(before)===htmlTitle(after),
    marketDataUnchanged:beforeMarket===afterMarket,
    sectionOrder:actualSections,
    sectionBlockCount:count(after,/class="editorial-block\b/g),
    glossaryCardCount:count(after,/class="glossary-card"/g),
    sourceGroups:[...after.matchAll(/<div class="source-group"><h3>([^<]+)<\/h3>/g)].map(match=>decodeHtml(match[1]!)),
    koreaHighlightBox:after.includes('block-korea-market'),
    internalTokenCount:count(after,/\b(?:CLAIM-|AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|DATA_NOT_CONNECTED|confidenceScore|verificationStatus|publicationVersion|draftPostId)\b/gi),
    beforeSha256:fingerprint(before),
    afterSha256:fingerprint(after),
    publicationRecordSha256:publicationBefore
  };
  const base=`${outputDir}/${report.reportId}-category-block`;
  const files=[`${base}-before.html`,`${base}-after.html`,`${base}-comparison.json`];
  await mkdir(outputDir,{recursive:true});
  await Promise.all([writeFile(files[0]!,before),writeFile(files[1]!,after),writeFile(files[2]!,JSON.stringify(comparison,null,2))]);
  return {files,comparison};
}

export async function writeFinancialResearchLayoutComparison(report:ReportRecord,evidence:EvidencePackage,publication:BloggerPublicationRecord,plan:EditorialReviewPlan,publisher:MotusPublisherConfig,beforePath:string,outputDir:string):Promise<{files:string[];comparison:Record<string,unknown>}> {
  const before=await readFile(beforePath,'utf8');
  if(fingerprint(before)!==fingerprint(publication.html)) throw new Error('before preview does not match preserved publication HTML');
  const publicationBefore=fingerprint(publication);
  const candidate=buildEditorialReviewCandidate(report,evidence,publication,plan,publisher);
  if(candidate.publicationFingerprint!==publicationBefore||fingerprint(publication)!==publicationBefore) throw new Error('publication record changed during research layout preview');
  const after=candidate.candidateHtml;
  const expectedSections=['핵심 요약','시장 한눈에 보기','미국 주요 증시 추이','시장을 움직인 핵심 요인','AI·반도체 / 주요 산업','한국시장 연결 포인트','오늘 체크리스트','용어설명','주요 출처'];
  const actualSections=[...after.matchAll(/<h2\b[^>]*>([^<]+)<\/h2>/g)].map(match=>decodeHtml(match[1]!));
  if(JSON.stringify(actualSections)!==JSON.stringify(expectedSections)) throw new Error(`financial research section order mismatch: ${actualSections.join(' > ')}`);
  const beforeRows=marketDashboardRows(before),afterRows=marketDashboardRows(after);
  if(!beforeRows.length||JSON.stringify(beforeRows)!==JSON.stringify(afterRows)) throw new Error('financial research preview changed market values');
  assertPublicBloggerHtmlSafe(after);
  const titleBarInlineStyleCount=count(after,/<h2\b[^>]*style="[^"]*background:[^"]*color:[^"]*padding:[^"]*font-size:[^"]*font-weight:[^"]*margin:[^"]*"/g);
  const contentBoxInlineStyleCount=count(after,/<div\b[^>]*class="[^"]*editorial-content[^"]*"[^>]*style="[^"]*border:[^"]*padding:[^"]*background:[^"]*margin:[^"]*width:100%[^"]*max-width:100%[^"]*box-sizing:border-box[^"]*"/g);
  const styleTagCount=count(after,/<style\b/gi);
  if(titleBarInlineStyleCount!==9||contentBoxInlineStyleCount!==9||styleTagCount!==0) throw new Error('financial research preview is not Blogger-safe inline layout');
  const comparison={
    reportId:report.reportId,tradingDate:report.tradingDate,bloggerApiCalled:false,publicationRecordChanged:false,
    titleUnchanged:htmlTitle(before)===htmlTitle(after),marketDataUnchanged:true,marketRows:afterRows,
    sectionOrder:actualSections,sectionBlockCount:count(after,/class="editorial-block\b/g),
    titleBarCount:count(after,/<section\b[^>]*class="[^"]*editorial-block[^"]*"[^>]*><h2\b/g),
    titleBarInlineStyleCount,contentBoxInlineStyleCount,styleTagCount,
    glossaryReferenceCount:count(after,/class="glossary-row"/g),
    sourceGroups:[...after.matchAll(/<div class="source-group"[^>]*><h3[^>]*>([^<]+)<\/h3>/g)].map(match=>decodeHtml(match[1]!)),
    koreaHighlightBox:after.includes('block-korea-market'),mobileHorizontalOverflowDisabled:after.includes('width:100%')&&after.includes('max-width:100%')&&after.includes('box-sizing:border-box')&&!after.includes('overflow-x:auto'),
    internalTokenCount:count(after,/\b(?:CLAIM-|AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|DATA_NOT_CONNECTED|confidenceScore|verificationStatus|publicationVersion|draftPostId)\b/gi),
    beforeSha256:fingerprint(before),afterSha256:fingerprint(after),publicationRecordSha256:publicationBefore
  };
  const base=`${outputDir}/${report.reportId}-financial-research-block`;
  const files=[`${base}-before.html`,`${base}-after.html`,`${base}-comparison.json`];
  await mkdir(outputDir,{recursive:true});
  await Promise.all([writeFile(files[0]!,before),writeFile(files[1]!,after),writeFile(files[2]!,JSON.stringify(comparison,null,2))]);
  return {files,comparison};
}

function fingerprint(value:unknown):string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function uniqueSources(values:{label:string;url:string}[]):{label:string;url:string}[] { const seen=new Set<string>(); return values.filter(item=>!seen.has(item.url)&&seen.add(item.url)); }
function htmlTitle(html:string):string { return decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]??''); }
function marketDashboardText(html:string):string { const block=html.match(/<div\b[^>]*class="[^"]*\bmarket-dashboard\b[^"]*"[^>]*>[\s\S]*?<\/div>/i)?.[0]??''; return decodeHtml(block.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim(); }
function marketDashboardRows(html:string):string[][] {
  const block=html.match(/<div\b[^>]*class="[^"]*\bmarket-dashboard\b[^"]*"[^>]*>[\s\S]*?<\/div>/i)?.[0]??'';
  return [...block.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map(match=>[...match[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell=>decodeHtml(cell[1]!.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim())).filter(cells=>cells.length>=3).map(cells=>cells.length>=4?cells.slice(-3):cells);
}
function decodeHtml(value:string):string { return value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'); }
function count(value:string,pattern:RegExp):number { return [...value.matchAll(pattern)].length; }
