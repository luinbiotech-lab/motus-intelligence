import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
const pendingVisual = { titleHierarchy: 'PENDING', typography: 'PENDING', chartReadability: 'PENDING', spacing: 'PENDING', pageBalance: 'PENDING', sourceReadability: 'PENDING', footer: 'PENDING', colorConvention: 'PENDING', KoreanRendering: 'PENDING' };
const pendingContent = { headlineAccuracy: 'PENDING', dataAccuracy: 'PENDING', explanationSufficiency: 'PENDING', sourceCoverage: 'PENDING', noUnsupportedClaim: 'PENDING', articlePdfConsistency: 'PENDING' };
export function createPdfHumanReviewPackage(artifact, validation, contactSheetPath) { return { artifactId: artifact.artifactId, reportType: artifact.reportType, issueDate: artifact.issueDate, fileName: artifact.fileName, pageCount: artifact.pageCount, fileSizeBytes: artifact.fileSizeBytes, contentFingerprint: artifact.contentFingerprint, sourceFingerprint: artifact.sourceFingerprint, validationSummary: { status: validation.status, warnings: [...validation.warnings], errors: [...validation.errors] }, contactSheetPath, visualChecks: { ...pendingVisual }, contentChecks: { ...pendingContent }, reviewState: 'PENDING', reviewNotes: null, reviewedAt: null, reviewedBy: null }; }
export function approvePdfReview(review, reviewedBy, reviewedAt, notes) { const checks = [...Object.values(review.visualChecks), ...Object.values(review.contentChecks)]; if (review.validationSummary.status !== 'PASS' || checks.some(check => check !== 'PASS'))
    throw new Error('PDF_REVIEW_APPROVAL_BLOCKED'); if (!reviewedBy.trim() || !Number.isFinite(Date.parse(reviewedAt)))
    throw new Error('VALID_HUMAN_REVIEW_REQUIRED'); return { ...review, reviewState: 'APPROVED', reviewNotes: notes, reviewedAt, reviewedBy }; }
export function createReportManifest(artifact, version = 1) { return { artifactId: artifact.artifactId, publicationId: artifact.publicationId, reportType: artifact.reportType, issueDate: artifact.issueDate, period: { start: artifact.periodStart, end: artifact.periodEnd }, localFile: artifact.localPath, version, reviewState: artifact.reviewState, validationState: artifact.validationStatus === 'PASS' ? 'VALIDATED' : artifact.validationStatus === 'FAIL' ? 'FAILED' : 'GENERATED', storageState: artifact.state === 'UPLOADED' || artifact.state === 'PUBLIC_AVAILABLE' ? 'UPLOADED' : artifact.state === 'UPLOAD_READY' ? 'UPLOAD_READY' : 'LOCAL_ONLY', publicState: artifact.state === 'PUBLIC_AVAILABLE' ? 'PUBLIC_AVAILABLE' : 'PRIVATE' }; }
export function publicAvailabilityGate(input) { return input.manifest.validationState === 'VALIDATED' && input.manifest.reviewState === 'APPROVED' && input.manifest.storageState === 'UPLOADED' && input.manifest.publicState === 'PUBLIC_AVAILABLE' && input.shareLinkValidated && input.articleState === 'PUBLISHED'; }
export function publicReportEntries(entries) { return entries.filter(entry => entry.state === 'AVAILABLE' && Boolean(entry.downloadUrl)); }
export function duplicateDecision(existing, candidate) { const sameIdentity = existing.filter(item => item.reportType === candidate.reportType && item.issueDate === candidate.issueDate && item.periodStart === candidate.periodStart && item.periodEnd === candidate.periodEnd); if (sameIdentity.some(item => item.contentFingerprint === candidate.contentFingerprint))
    return { decision: 'UNCHANGED', nextVersion: Math.max(1, sameIdentity.length) }; return sameIdentity.length ? { decision: 'NEW_VERSION_REQUIRED', nextVersion: sameIdentity.length + 1 } : { decision: 'NEW_ARTIFACT', nextVersion: 1 }; }
export function enhancedArticlePdfConsistency(input) { return JSON.stringify(input.article) === JSON.stringify(input.pdf) ? { state: 'PASS', reason: null } : { state: 'HOLD', reason: 'CONTENT_MISMATCH' }; }
export function defaultDriveFolderRegistry() { return ['MOTUS Reports', 'MOTUS Reports/2026', 'MOTUS Reports/2026/Daily', 'MOTUS Reports/2026/Daily/AI Intelligence', 'MOTUS Reports/2026/Daily/U.S. Market', 'MOTUS Reports/2026/Daily/Korea Market', 'MOTUS Reports/2026/Weekly Intelligence', 'MOTUS Reports/2026/Monthly Intelligence'].map(logicalPath => ({ logicalPath, driveFolderId: null, verifiedAt: null, state: 'UNVERIFIED' })); }
export class GoogleDriveReadOnlyAdapter {
    provider = 'GOOGLE_DRIVE';
    state;
    writeEnabled = false;
    publicShareEnabled = false;
    credentialMaterial;
    constructor(env = process.env) { const file = env.MOTUS_DRIVE_CREDENTIAL_FILE?.trim(); const fileContent = file && existsSync(file) ? readFileSync(file, 'utf8') : ''; const parts = [env.GOOGLE_DRIVE_CLIENT_ID, env.GOOGLE_DRIVE_CLIENT_SECRET, env.GOOGLE_DRIVE_REFRESH_TOKEN].map(value => value?.trim() ?? ''); this.credentialMaterial = fileContent || parts.every(Boolean) ? fileContent || parts.join('|') : null; this.state = this.credentialMaterial ? 'READY' : 'NOT_CONFIGURED'; }
    isConfigured() { return this.state === 'READY'; }
    credentialFingerprint() { return this.credentialMaterial ? createHash('sha256').update(this.credentialMaterial).digest('hex').slice(0, 8) : null; }
    async validateCredentials() { return this.isConfigured() ? 'NOT_RUN' : 'NOT_CONFIGURED'; }
    async findRootFolder() { return null; }
    async ensureFolderHierarchy() { throw new Error('GOOGLE_DRIVE_WRITE_DISABLED'); }
    async findExistingArtifact(_key) { return null; }
    async uploadArtifact(_artifact) { throw new Error('GOOGLE_DRIVE_WRITE_DISABLED'); }
    async readArtifactMetadata(_objectId) { return null; }
    async createShareLink(_objectId) { throw new Error('GOOGLE_DRIVE_PUBLIC_SHARE_DISABLED'); }
    async validateShareLink(_url) { return false; }
    async getArtifact(_objectId) { return null; }
    async validatePublicUrl(_url) { return false; }
    async revokePublicUrl(_objectId) { throw new Error('GOOGLE_DRIVE_PUBLIC_SHARE_DISABLED'); }
    async status() { return { provider: 'GOOGLE_DRIVE', configured: this.isConfigured() ? 'YES' : 'NO', credentialFingerprint: this.credentialFingerprint(), scope: 'https://www.googleapis.com/auth/drive.metadata.readonly', credentialValidation: await this.validateCredentials(), rootFolder: 'UNKNOWN', writeEnabled: false, publicShareEnabled: false, uploadCount: 0, permissionChangeCount: 0 }; }
}
