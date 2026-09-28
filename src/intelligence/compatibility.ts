import type { ClaimRecord, ClaimVerificationStatus, EvidencePackage, InputBundle, ReportRecord } from '../domain/models.js';
import { createCommonIntelligenceId, INTELLIGENCE_SCHEMA_VERSION, type ResearchIntelligenceItem } from './schema.js';

export const DAILY_INTELLIGENCE_ADAPTER_VERSION='3A.DAILY.1.0' as const;
const unique=(values:string[])=>[...new Set(values.filter(Boolean))];

function statusFromClaims(claims:ClaimRecord[]):ClaimVerificationStatus {
  if(!claims.length) return 'UNVERIFIED';
  if(claims.some(claim=>claim.verificationStatus==='REJECTED')) return 'REJECTED';
  if(claims.some(claim=>claim.verificationStatus==='CONFLICT')) return 'CONFLICT';
  if(claims.some(claim=>claim.verificationStatus==='REVIEW_REQUIRED')) return 'REVIEW_REQUIRED';
  if(claims.every(claim=>claim.verificationStatus==='VERIFIED')) return 'VERIFIED';
  if(claims.some(claim=>claim.verificationStatus==='UNVERIFIED'||claim.verificationStatus==='INSUFFICIENT_SOURCES')) return 'UNVERIFIED';
  return 'PARTIALLY_VERIFIED';
}

/** Pure compatibility adapter. Existing production artifacts are read but never mutated. */
export function adaptDailyReportToIntelligence(report:ReportRecord,evidence:EvidencePackage):ResearchIntelligenceItem {
  if(report.reportId!==evidence.reportId) throw new Error('report/evidence reportId mismatch');
  const input=evidence.originalInput as Partial<InputBundle>|null;
  const claims=evidence.claims??[];
  const relatedCompanies=unique([...(input?.companyEvents??[]).map(item=>item.companyId),...(input?.filings??[]).map(item=>item.companyId)]).map(value=>createCommonIntelligenceId('company',value));
  const relatedSectors=unique([...(input?.news??[]).flatMap(item=>item.relatedIndustries),...evidence.impactJudgments.map(item=>item.koreaSector)]);
  const relatedMarkets=unique(['US',...(evidence.impactJudgments.length?['KR']:[])]);
  const sources=evidence.records.map(record=>({
    evidenceId:record.evidenceId,sourceType:record.sourceType,sourceId:record.sourceId,sourceUrl:record.sourceUrl,
    observedAt:record.observedAt,collectedAt:record.collectedAt,verificationStatus:record.verificationStatus,
    fieldProvenance:structuredClone(record.fieldProvenance??{})
  }));
  const collectedAt=sources.map(source=>source.collectedAt).filter(value=>Number.isFinite(Date.parse(value))).sort().at(-1)??report.generatedAt;
  const primarySource=sources.find(source=>source.sourceUrl.startsWith('https://'))??sources[0];
  if(!primarySource) throw new Error('daily intelligence compatibility requires at least one evidence source');
  const confidence=claims.length?Number((claims.reduce((sum,claim)=>sum+claim.confidenceScore,0)/claims.length).toFixed(2)):0;
  return {
    schemaVersion:INTELLIGENCE_SCHEMA_VERSION,
    intelligenceId:`intel:us-market-daily:${report.tradingDate}:${report.reportId}`,
    contentType:'US_MARKET_DAILY',sourceType:'AGGREGATED_VERIFIED_SOURCES',
    source:'US Market Daily Report Platform compatibility adapter',publisher:'MOTUS Intelligence',analyst:null,
    publishedAt:report.publishedAt,collectedAt,market:'US',country:'US',region:'North America',
    companyId:null,company:null,ticker:null,sector:null,industry:null,
    themeId:createCommonIntelligenceId('theme','daily-market'),theme:'Daily Market',eventId:createCommonIntelligenceId('event',`us-market-close-${report.tradingDate}`),parentEventId:null,
    relatedCompanies,relatedSectors,relatedMarkets,headline:report.seoTitle,summary:report.threeLineSummary.join(' '),
    claimIds:unique(claims.map(claim=>claim.claimId)),evidenceIds:unique(evidence.records.map(record=>record.evidenceId)),
    stance:'MIXED',targetPrice:null,rating:null,ratingChange:null,targetPriceChange:null,
    institutionView:null,aiInterpretation:null,
    sourceUrl:primarySource.sourceUrl,
    verificationStatus:statusFromClaims(claims),confidence,validityHorizon:'INTRADAY',
    provenance:{legacyReportId:report.reportId,inputSha256:evidence.inputSha256,adapterVersion:DAILY_INTELLIGENCE_ADAPTER_VERSION,sources}
  };
}
