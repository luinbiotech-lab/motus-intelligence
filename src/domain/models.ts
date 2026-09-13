export const statuses = ['OK','NO_DATA','DATA_NOT_CONNECTED','DELAYED','CONFLICT','LOW_CONFIDENCE','REVIEW_REQUIRED','SOURCE_UNAVAILABLE','INVALID_VALUE','HOLIDAY','EARLY_CLOSE','BLOCKED'] as const;
export type Status = typeof statuses[number];
export type Nature = 'CONFIRMED_FACT' | 'CALCULATED' | 'INFERENCE' | 'EXPECTATION' | 'OPINION';
export type Direction = 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'HOLD';
export type EvidenceLevel = 'A' | 'B' | 'C' | 'UNVERIFIED';
export type Horizon = 'INTRADAY' | 'SHORT_TERM' | 'MEDIUM_TERM';
export type CollectionMode = 'SAMPLE_FIXTURE' | 'MANUAL_VERIFIED' | 'API';
export const paths = ['INTEREST_RATE','FX','COMMODITY','DEMAND','SUPPLY_CHAIN','SEMICONDUCTOR_CYCLE','AI_CAPEX','ENERGY','POLICY','REGULATION','LIQUIDITY','RISK_SENTIMENT'] as const;
export type TransmissionPath = typeof paths[number];
export interface Provenance {
  id: string; sample: boolean; sourceId: string; sourceUrl: string;
  observedAt: string; collectedAt: string; unit: string; status: Status;
  missingReasons: Record<string, string>; collectionMode?: CollectionMode;
  verificationUrls?: string[];
}
export interface MarketSnapshot extends Provenance {
  market: 'US'; tradingDate: string; symbol: string; instrumentType: 'INDEX'|'EQUITY'|'FX'|'YIELD'|'COMMODITY';
  close: number|null; previousClose: number|null; change: number|null; changePct: number|null;
  volume: number|null; currency: string;
}
export interface MacroRelease extends Provenance {
  indicatorId: string; indicatorName: string; releaseTime: string; period: string;
  actual: number|null; consensus: number|null; previous: number|null; revisedPrevious: number|null;
  adjustmentType: 'SA'|'NSA'|'UNKNOWN';
}
export interface CompanyEvent extends Provenance {
  companyId: string; ticker: string; eventType: string; eventTime: string; title: string;
  summary: string; primarySourceUrl: string;
}
export interface FilingRecord extends Provenance {
  companyId: string; ticker: string; formType: string; accessionNumber: string; filedAt: string;
  period: string; extractedFacts: string[];
}
export interface NewsReference extends Provenance {
  title: string; publisher: string; publishedAt: string; url: string; relatedTickers: string[];
  relatedIndustries: string[]; verifiedFacts: string[]; sourceTier: 'A'|'B'|'C'; usedInReport: boolean;
}
export interface Signal {
  id: string; eventId: string; trigger: string; usIndustry: string; usCompany: string;
  macroConditions: string[]; evidenceIds: string[]; counterFactors: string[];
  driverStatement?: string;
}
export interface InputBundle {
  schemaVersion: '1.0'; sample: boolean; tradingDate: string; asOf: string;
  session: { status: 'OK'|'HOLIDAY'|'EARLY_CLOSE'; closeAt: string; sourceId: string; sourceUrl: string };
  market: MarketSnapshot[]; macro: MacroRelease[]; companyEvents: CompanyEvent[];
  filings: FilingRecord[]; news: NewsReference[]; signals: Signal[];
  koreaContext: { calendar: string[]; counterFactors: string[] };
}
export interface Source {
  sourceId: string; name: string; category: string; official: boolean; priority: number;
  authenticationType: string; rateLimit: string; latency: string;
  redistributionStatus: 'UNKNOWN'; commercialUseStatus: 'UNKNOWN'; enabled: boolean;
  notes: string; homepage: string; maxAgeMinutes: number; connectionStatus: Status;
}
export interface Rule {
  ruleId: string; ruleVersion: string; trigger: string; usIndustry: string; usCompany: string[];
  macroCondition: string[]; transmissionPath: TransmissionPath; koreaIndustry: string;
  koreaCompanyCandidate: string[]; direction: Direction; baseStrength: number;
  evidenceRequirements: { minimumSources: number; primaryRequired: boolean };
  counterFactors: string[]; validityHorizon: Horizon;
}
export interface KoreaImpactCandidate {
  id: string; usEventId: string; ruleId: string; ruleVersion: string; transmissionPath: TransmissionPath;
  koreaSector: string; koreaCompanyId: string|null; koreaTicker: string|null; rationale: string;
  impactDirection: Direction; impactStrength: number; evidenceLevel: EvidenceLevel;
  confidenceScore: number; counterFactors: string[]; validityHorizon: Horizon; status: Status;
  nature: 'INFERENCE'; evidenceIds: string[]; scoreCalculation: string;
}
export interface Issue { recordId: string; field: string; status: Status; message: string }
export interface ValidationResult { status: Status; issues: Issue[]; excludedIds: string[] }
export interface Section { id: string; title: string; items: { text: string; nature: Nature; evidenceIds: string[] }[] }
export interface ReportRecord {
  reportId: string; tradingDate: string; generatedAt: string; publishedAt: string|null;
  templateVersion: string; analysisRuleVersion: string; status: Status; sample: boolean;
  sections: Section[]; seoTitle: string; threeLineSummary: string[];
}
export interface EvidenceRecord {
  evidenceId: string; reportId: string; sourceType: string; sourceId: string; sourceUrl: string;
  observedAt: string; collectedAt: string; originalValue: unknown; unit: string;
  calculation: unknown; ruleVersion: string; usedInSections: string[]; verificationStatus: Status;
}
export interface EvidencePackage {
  reportId: string; reportMetadata: ReportRecord; sourceMetadata: Source[]; records: EvidenceRecord[];
  originalInput: unknown; inputSha256: string; redactedFields: string[]; analysisRules: Rule[]; impactJudgments: KoreaImpactCandidate[];
  aiGeneratedText: { used: false; text: null; reason: string }; validationResult: ValidationResult;
  manualReviewStatus: 'PENDING'; publishStatus: 'BLOCKED'; stages: StageResult[];
  reviewMetrics: ReviewMetrics;
}
export type ReviewCategory = 'NUMERIC_ERROR'|'SOURCE_ERROR'|'CAUSE_INTERPRETATION'|'KOREA_LINK'|'WORDING'|'SEO'|'LINK'|'OTHER';
export interface ReviewMetrics {
  automaticGeneratedAt: string; humanReviewStartedAt: string|null; humanReviewCompletedAt: string|null;
  durationMinutes: number|null; measurementStatus: 'NOT_MEASURED'|'MEASURED';
  edits: Record<ReviewCategory,string[]>;
}
export interface StageResult { stage: string; status: Status; detail: string }
export interface Outcome {
  operationalStatus: 'PASS'|'REVIEW_REQUIRED'|'FAILED'|'BLOCKED'; report: ReportRecord;
  evidence: EvidencePackage; markdown: string; stages: StageResult[];
}
export interface RetrospectiveRecord {
  reportId: string; candidateId: string; observedAt: string; domesticOutcomeEvidenceIds: string[];
  expectedTransmissionPath: TransmissionPath; explanatoryPower: 'SUPPORTED'|'PARTIAL'|'UNSUPPORTED'|'UNDETERMINED';
  counterFactors: string[]; ruleImprovementNeeded: boolean; reviewNotes: string;
}
