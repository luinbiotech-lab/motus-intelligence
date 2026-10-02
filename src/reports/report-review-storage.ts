import { createHash } from 'node:crypto';
import { existsSync,readFileSync } from 'node:fs';
import type { PublicReportEntry } from '../intelligence/daily-masters.js';
import type { PdfArtifact,PdfReportType,PdfReviewState,PdfValidationResult,ReportStorageAdapter,StorageResult } from './pdf-production.js';

export type ReviewCheckState='PENDING'|'PASS'|'FAIL';
export interface PdfHumanReviewPackage {
  artifactId:string;reportType:PdfReportType;issueDate:string;fileName:string;pageCount:number;fileSizeBytes:number;contentFingerprint:string;sourceFingerprint:string;
  validationSummary:{status:'PASS'|'FAIL';warnings:string[];errors:string[]};contactSheetPath:string;
  visualChecks:{titleHierarchy:ReviewCheckState;typography:ReviewCheckState;chartReadability:ReviewCheckState;spacing:ReviewCheckState;pageBalance:ReviewCheckState;sourceReadability:ReviewCheckState;footer:ReviewCheckState;colorConvention:ReviewCheckState;KoreanRendering:ReviewCheckState};
  contentChecks:{headlineAccuracy:ReviewCheckState;dataAccuracy:ReviewCheckState;explanationSufficiency:ReviewCheckState;sourceCoverage:ReviewCheckState;noUnsupportedClaim:ReviewCheckState;articlePdfConsistency:ReviewCheckState};
  reviewState:PdfReviewState;reviewNotes:string|null;reviewedAt:string|null;reviewedBy:string|null;
}
export interface ReportManifestEntry {artifactId:string;publicationId:string;reportType:PdfReportType;issueDate:string;period:{start:string;end:string};localFile:string;version:number;reviewState:PdfReviewState;validationState:'GENERATED'|'VALIDATED'|'FAILED';storageState:'LOCAL_ONLY'|'UPLOAD_READY'|'UPLOADED';publicState:'PRIVATE'|'PUBLIC_AVAILABLE'}
export interface DriveFolderRegistryEntry {logicalPath:string;driveFolderId:string|null;verifiedAt:string|null;state:'UNVERIFIED'|'VERIFIED'|'MISSING'}
export interface DriveProviderStatus {provider:'GOOGLE_DRIVE';configured:'YES'|'NO';credentialFingerprint:string|null;scope:'https://www.googleapis.com/auth/drive.metadata.readonly';credentialValidation:'NOT_CONFIGURED'|'NOT_RUN'|'PASS'|'FAIL';rootFolder:'UNKNOWN'|string;writeEnabled:false;publicShareEnabled:false;uploadCount:0;permissionChangeCount:0}
export type DuplicateDecision='UNCHANGED'|'NEW_VERSION_REQUIRED'|'NEW_ARTIFACT';

const pendingVisual:PdfHumanReviewPackage['visualChecks']={titleHierarchy:'PENDING',typography:'PENDING',chartReadability:'PENDING',spacing:'PENDING',pageBalance:'PENDING',sourceReadability:'PENDING',footer:'PENDING',colorConvention:'PENDING',KoreanRendering:'PENDING'};
const pendingContent:PdfHumanReviewPackage['contentChecks']={headlineAccuracy:'PENDING',dataAccuracy:'PENDING',explanationSufficiency:'PENDING',sourceCoverage:'PENDING',noUnsupportedClaim:'PENDING',articlePdfConsistency:'PENDING'};

export function createPdfHumanReviewPackage(artifact:PdfArtifact,validation:PdfValidationResult,contactSheetPath:string):PdfHumanReviewPackage{return {artifactId:artifact.artifactId,reportType:artifact.reportType,issueDate:artifact.issueDate,fileName:artifact.fileName,pageCount:artifact.pageCount,fileSizeBytes:artifact.fileSizeBytes,contentFingerprint:artifact.contentFingerprint,sourceFingerprint:artifact.sourceFingerprint,validationSummary:{status:validation.status,warnings:[...validation.warnings],errors:[...validation.errors]},contactSheetPath,visualChecks:{...pendingVisual},contentChecks:{...pendingContent},reviewState:'PENDING',reviewNotes:null,reviewedAt:null,reviewedBy:null};}
export function approvePdfReview(review:PdfHumanReviewPackage,reviewedBy:string,reviewedAt:string,notes:string|null):PdfHumanReviewPackage {const checks=[...Object.values(review.visualChecks),...Object.values(review.contentChecks)];if(review.validationSummary.status!=='PASS'||checks.some(check=>check!=='PASS'))throw new Error('PDF_REVIEW_APPROVAL_BLOCKED');if(!reviewedBy.trim()||!Number.isFinite(Date.parse(reviewedAt)))throw new Error('VALID_HUMAN_REVIEW_REQUIRED');return {...review,reviewState:'APPROVED',reviewNotes:notes,reviewedAt,reviewedBy};}
export function createReportManifest(artifact:PdfArtifact,version=1):ReportManifestEntry{return {artifactId:artifact.artifactId,publicationId:artifact.publicationId,reportType:artifact.reportType,issueDate:artifact.issueDate,period:{start:artifact.periodStart,end:artifact.periodEnd},localFile:artifact.localPath,version,reviewState:artifact.reviewState,validationState:artifact.validationStatus==='PASS'?'VALIDATED':artifact.validationStatus==='FAIL'?'FAILED':'GENERATED',storageState:artifact.state==='UPLOADED'||artifact.state==='PUBLIC_AVAILABLE'?'UPLOADED':artifact.state==='UPLOAD_READY'?'UPLOAD_READY':'LOCAL_ONLY',publicState:artifact.state==='PUBLIC_AVAILABLE'?'PUBLIC_AVAILABLE':'PRIVATE'};}
export function publicAvailabilityGate(input:{manifest:ReportManifestEntry;articleState:string;shareLinkValidated:boolean}):boolean{return input.manifest.validationState==='VALIDATED'&&input.manifest.reviewState==='APPROVED'&&input.manifest.storageState==='UPLOADED'&&input.manifest.publicState==='PUBLIC_AVAILABLE'&&input.shareLinkValidated&&input.articleState==='PUBLISHED';}
export function publicReportEntries(entries:PublicReportEntry[]):PublicReportEntry[]{return entries.filter(entry=>entry.state==='AVAILABLE'&&Boolean(entry.downloadUrl));}
export function duplicateDecision(existing:PdfArtifact[],candidate:PdfArtifact):{decision:DuplicateDecision;nextVersion:number}{const sameIdentity=existing.filter(item=>item.reportType===candidate.reportType&&item.issueDate===candidate.issueDate&&item.periodStart===candidate.periodStart&&item.periodEnd===candidate.periodEnd);if(sameIdentity.some(item=>item.contentFingerprint===candidate.contentFingerprint))return {decision:'UNCHANGED',nextVersion:Math.max(1,sameIdentity.length)};return sameIdentity.length?{decision:'NEW_VERSION_REQUIRED',nextVersion:sameIdentity.length+1}:{decision:'NEW_ARTIFACT',nextVersion:1};}
export function enhancedArticlePdfConsistency(input:{article:{issueDate:string;category:string;headlineFingerprint:string;marketValuesFingerprint:string;sourceFingerprint:string;chartSeriesFingerprint:string};pdf:{issueDate:string;category:string;headlineFingerprint:string;marketValuesFingerprint:string;sourceFingerprint:string;chartSeriesFingerprint:string}}):{state:'PASS'|'HOLD';reason:string|null}{return JSON.stringify(input.article)===JSON.stringify(input.pdf)?{state:'PASS',reason:null}:{state:'HOLD',reason:'CONTENT_MISMATCH'};}
export function defaultDriveFolderRegistry():DriveFolderRegistryEntry[]{return ['MOTUS Reports','MOTUS Reports/2026','MOTUS Reports/2026/Daily','MOTUS Reports/2026/Daily/AI Intelligence','MOTUS Reports/2026/Daily/U.S. Market','MOTUS Reports/2026/Daily/Korea Market','MOTUS Reports/2026/Weekly Intelligence','MOTUS Reports/2026/Monthly Intelligence'].map(logicalPath=>({logicalPath,driveFolderId:null,verifiedAt:null,state:'UNVERIFIED'}));}

export class GoogleDriveReadOnlyAdapter implements ReportStorageAdapter {
  readonly provider='GOOGLE_DRIVE' as const;readonly state:'READY'|'NOT_CONFIGURED';readonly writeEnabled=false;readonly publicShareEnabled=false;private readonly credentialMaterial:string|null;
  constructor(env:NodeJS.ProcessEnv=process.env){const file=env.MOTUS_DRIVE_CREDENTIAL_FILE?.trim();const fileContent=file&&existsSync(file)?readFileSync(file,'utf8'):'';const parts=[env.GOOGLE_DRIVE_CLIENT_ID,env.GOOGLE_DRIVE_CLIENT_SECRET,env.GOOGLE_DRIVE_REFRESH_TOKEN].map(value=>value?.trim()??'');this.credentialMaterial=fileContent||parts.every(Boolean)?fileContent||parts.join('|'):null;this.state=this.credentialMaterial?'READY':'NOT_CONFIGURED';}
  isConfigured():boolean{return this.state==='READY';}
  credentialFingerprint():string|null{return this.credentialMaterial?createHash('sha256').update(this.credentialMaterial).digest('hex').slice(0,8):null;}
  async validateCredentials():Promise<'NOT_CONFIGURED'|'NOT_RUN'>{return this.isConfigured()?'NOT_RUN':'NOT_CONFIGURED';}
  async findRootFolder():Promise<null>{return null;}
  async ensureFolderHierarchy():Promise<never>{throw new Error('GOOGLE_DRIVE_WRITE_DISABLED');}
  async findExistingArtifact(_key:string):Promise<null>{return null;}
  async uploadArtifact(_artifact:PdfArtifact):Promise<StorageResult>{throw new Error('GOOGLE_DRIVE_WRITE_DISABLED');}
  async readArtifactMetadata(_objectId:string):Promise<null>{return null;}
  async createShareLink(_objectId:string):Promise<never>{throw new Error('GOOGLE_DRIVE_PUBLIC_SHARE_DISABLED');}
  async validateShareLink(_url:string):Promise<boolean>{return false;}
  async getArtifact(_objectId:string):Promise<null>{return null;}
  async validatePublicUrl(_url:string):Promise<boolean>{return false;}
  async revokePublicUrl(_objectId:string):Promise<void>{throw new Error('GOOGLE_DRIVE_PUBLIC_SHARE_DISABLED');}
  async status():Promise<DriveProviderStatus>{return {provider:'GOOGLE_DRIVE',configured:this.isConfigured()?'YES':'NO',credentialFingerprint:this.credentialFingerprint(),scope:'https://www.googleapis.com/auth/drive.metadata.readonly',credentialValidation:await this.validateCredentials(),rootFolder:'UNKNOWN',writeEnabled:false,publicShareEnabled:false,uploadCount:0,permissionChangeCount:0};}
}
