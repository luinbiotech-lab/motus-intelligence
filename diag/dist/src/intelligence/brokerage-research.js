import { createCommonIntelligenceId } from './schema.js';
export const brokerageResearchTypes = ['MORNING_BRIEF', 'MARKET_STRATEGY', 'INDUSTRY_REPORT', 'COMPANY_REPORT', 'INVESTMENT_STRATEGY', 'TARGET_PRICE_CHANGE', 'RATING_CHANGE'];
export const brokerageSourceKinds = ['OFFICIAL_RESEARCH_PAGE', 'OFFICIAL_PDF', 'OFFICIAL_DISTRIBUTION', 'VERIFIED_MIRROR'];
export const brokerageRatings = ['BUY', 'HOLD', 'SELL', 'OUTPERFORM', 'NEUTRAL', 'UNDERPERFORM', 'OTHER'];
export const targetPriceChanges = ['UP', 'DOWN', 'UNCHANGED', 'UNKNOWN'];
export const ratingChanges = ['UPGRADE', 'DOWNGRADE', 'UNCHANGED', 'INITIATED', 'WITHDRAWN', 'UNKNOWN'];
export const koreaBrokerageInstitutions = [
    { institutionId: 'mirae-asset-securities', name: '미래에셋증권', aliases: ['미래에셋', 'Mirae Asset Securities'] },
    { institutionId: 'nh-investment-securities', name: 'NH투자증권', aliases: ['NH투자', 'NH Investment & Securities'] },
    { institutionId: 'samsung-securities', name: '삼성증권', aliases: ['Samsung Securities'] },
    { institutionId: 'shinhan-securities', name: '신한투자증권', aliases: ['신한금융투자', 'Shinhan Securities'] },
    { institutionId: 'hana-securities', name: '하나증권', aliases: ['하나금융투자', 'Hana Securities'] },
    { institutionId: 'kiwoom-securities', name: '키움증권', aliases: ['Kiwoom Securities'] },
    { institutionId: 'daishin-securities', name: '대신증권', aliases: ['Daishin Securities'] },
    { institutionId: 'yuanta-securities-korea', name: '유안타증권', aliases: ['유안타증권코리아', 'Yuanta Securities Korea'] },
    { institutionId: 'ls-securities', name: 'LS증권', aliases: ['이베스트투자증권', 'LS Securities'] },
    { institutionId: 'db-financial-investment', name: 'DB금융투자', aliases: ['DB Financial Investment'] }
];
export class BrokerageInstitutionRegistry {
    institutions;
    aliases = new Map();
    constructor(institutions) {
        this.institutions = institutions;
        for (const institution of institutions) {
            if (!asciiKey(institution.institutionId) || !nonEmpty(institution.name))
                throw new Error('invalid brokerage institution registry entry');
            for (const value of [institution.institutionId, institution.name, ...institution.aliases]) {
                const key = lookupKey(value);
                const existing = this.aliases.get(key);
                if (existing && existing.institutionId !== institution.institutionId)
                    throw new Error(`duplicate brokerage alias: ${value}`);
                this.aliases.set(key, structuredClone(institution));
            }
        }
    }
    resolve(value) { return structuredClone(this.aliases.get(lookupKey(value)) ?? null); }
}
export const defaultBrokerageInstitutionRegistry = new BrokerageInstitutionRegistry(koreaBrokerageInstitutions);
export class FixtureBrokerageResearchAdapter {
    records;
    adapterId = 'fixture-manual-korea-brokerage-research';
    constructor(records) {
        this.records = records;
    }
    async collect() { return [...structuredClone(this.records)]; }
}
function nonEmpty(value) { return typeof value === 'string' && value.trim().length > 0; }
const nullableText = (value) => value === null || nonEmpty(value);
function asciiKey(value) { return nonEmpty(value) && /^[a-z0-9][a-z0-9-]*$/.test(value); }
function lookupKey(value) { return value.normalize('NFKC').trim().toLowerCase().replace(/[\s._&-]+/g, ''); }
const isoTime = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const httpUrl = (value) => { if (!nonEmpty(value))
    return false; try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
}
catch {
    return false;
} };
const unique = (values) => [...new Set(values)];
const verificationStatuses = ['VERIFIED', 'PARTIALLY_VERIFIED', 'CONFLICT', 'UNVERIFIED', 'INSUFFICIENT_SOURCES', 'PRIMARY_SOURCE_ONLY', 'REVIEW_REQUIRED', 'REJECTED'];
const sourcePriority = { OFFICIAL_RESEARCH_PAGE: 1, OFFICIAL_PDF: 2, OFFICIAL_DISTRIBUTION: 3, VERIFIED_MIRROR: 4 };
export function runBrokerageResearchIntake(records, registry = defaultBrokerageInstitutionRegistry) {
    const items = [];
    const duplicates = [];
    const rejected = [];
    const byUrl = new Map();
    const byIdentity = new Map();
    for (const raw of records) {
        const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const sourceRecordId = nonEmpty(object.sourceRecordId) ? object.sourceRecordId : '(missing)';
        const errors = validateRaw(object, registry);
        if (errors.length) {
            rejected.push({ sourceRecordId, errors });
            continue;
        }
        const record = object;
        const institution = registry.resolve(record.publisher);
        const url = canonicalUrl(record.sourceUrl);
        const urlKey = `${institution.institutionId}\u0000${url}`;
        const identity = reportIdentity(record, institution.institutionId);
        const existing = byUrl.get(urlKey) ?? byIdentity.get(identity);
        if (existing) {
            mergeSource(existing, record, url);
            duplicates.push({ duplicateSourceRecordId: record.sourceRecordId, retainedResearchId: existing.researchId, reason: byUrl.has(urlKey) ? 'SAME_CANONICAL_URL' : 'SAME_REPORT_IDENTITY' });
            byUrl.set(urlKey, existing);
            byIdentity.set(identity, existing);
            continue;
        }
        const item = normalizeResearch(record, institution, url);
        items.push(item);
        byUrl.set(urlKey, item);
        byIdentity.set(identity, item);
    }
    return { items, duplicates, rejected };
}
export async function collectBrokerageResearch(adapter, registry) { return runBrokerageResearchIntake(await adapter.collect(), registry); }
function validateRaw(record, registry) {
    const errors = [];
    if (Object.hasOwn(record, 'factType') || Object.hasOwn(record, 'marketId') || Object.hasOwn(record, 'investorType'))
        errors.push('Korea Market Fact fields are prohibited in Brokerage Research');
    for (const key of ['researchId', 'sourceRecordId', 'publisher', 'headline', 'summary', 'institutionView'])
        if (!nonEmpty(record[key]))
            errors.push(`${key}: required`);
    if (nonEmpty(record.publisher) && !registry.resolve(record.publisher))
        errors.push('publisher: not found in institution registry');
    if (!isoTime(record.publishedAt))
        errors.push('publishedAt: timezone-aware source timestamp required; no fallback is generated');
    if (!isoTime(record.collectedAt))
        errors.push('collectedAt: timezone-aware collection timestamp required');
    if (!httpUrl(record.sourceUrl))
        errors.push('sourceUrl: valid HTTP(S) URL required; no fallback is generated');
    if (!brokerageResearchTypes.includes(record.researchType))
        errors.push('researchType: unsupported');
    if (!brokerageSourceKinds.includes(record.sourceKind))
        errors.push('sourceKind: unsupported');
    if (!['HTML', 'PDF', 'DISTRIBUTION', 'MIRROR'].includes(record.sourceFormat))
        errors.push('sourceFormat: unsupported');
    if (!verificationStatuses.includes(record.verificationStatus))
        errors.push('verificationStatus: unsupported');
    for (const key of ['analyst', 'market', 'sector', 'industry', 'companyKey', 'company', 'ticker', 'themeKey', 'eventKey', 'sourcePage', 'sourceSection', 'aiInterpretation'])
        if (!nullableText(record[key]))
            errors.push(`${key}: string or null required`);
    for (const key of ['investmentStrategy', 'riskFactors', 'extractedFields'])
        if (!stringArray(record[key]))
            errors.push(`${key}: unique string array required`);
    if (!Array.isArray(record.evidence) || record.evidence.length === 0)
        errors.push('evidence: non-empty array required');
    else
        record.evidence.forEach((value, index) => {
            if (!value || typeof value !== 'object' || Array.isArray(value) || !nonEmpty(value.evidenceId) || !nonEmpty(value.text))
                errors.push(`evidence[${index}]: evidenceId and text required`);
        });
    validateMoney(record.targetPrice, 'targetPrice', errors);
    validateMoney(record.previousTargetPrice, 'previousTargetPrice', errors);
    if (!targetPriceChanges.includes(record.targetPriceChange))
        errors.push('targetPriceChange: unsupported');
    if (record.rating !== null && !brokerageRatings.includes(record.rating))
        errors.push('rating: unsupported');
    if (record.previousRating !== null && !brokerageRatings.includes(record.previousRating))
        errors.push('previousRating: unsupported');
    if (!ratingChanges.includes(record.ratingChange))
        errors.push('ratingChange: unsupported');
    if (record.targetPriceChange !== 'UNKNOWN' && record.targetPrice === null)
        errors.push('targetPrice: required for a stated target price change');
    if (['UP', 'DOWN', 'UNCHANGED'].includes(record.targetPriceChange) && record.previousTargetPrice === null)
        errors.push('previousTargetPrice: required to structure target price comparison');
    if (record.targetPrice && record.previousTargetPrice && record.targetPrice.currency !== record.previousTargetPrice.currency)
        errors.push('targetPrice currency: current and previous must match');
    if (!['UNKNOWN', 'WITHDRAWN'].includes(record.ratingChange) && record.rating === null)
        errors.push('rating: required for a stated rating change');
    if (['UPGRADE', 'DOWNGRADE', 'UNCHANGED'].includes(record.ratingChange) && record.previousRating === null)
        errors.push('previousRating: required to structure rating comparison');
    if (record.ratingChange === 'WITHDRAWN' && record.previousRating === null)
        errors.push('previousRating: required when a rating is withdrawn');
    if (nonEmpty(record.aiInterpretation) && nonEmpty(record.institutionView) && record.aiInterpretation.trim() === record.institutionView.trim())
        errors.push('aiInterpretation: must remain distinct from institutionView');
    if (isMoney(record.targetPrice) && isMoney(record.previousTargetPrice) && record.targetPriceChange !== 'UNKNOWN') {
        const actual = record.targetPrice.value > record.previousTargetPrice.value ? 'UP' : record.targetPrice.value < record.previousTargetPrice.value ? 'DOWN' : 'UNCHANGED';
        if (record.targetPriceChange !== actual)
            errors.push(`targetPriceChange: conflicts with structured values (${actual})`);
    }
    return errors;
}
function isMoney(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof value.value === 'number' && typeof value.currency === 'string'; }
function validateMoney(value, path, errors) {
    if (value === null)
        return;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path}: money object or null required`);
        return;
    }
    const record = value;
    if (typeof record.value !== 'number' || !Number.isFinite(record.value) || record.value < 0)
        errors.push(`${path}.value: non-negative finite number required`);
    if (!nonEmpty(record.currency) || !/^[A-Z]{3}$/.test(record.currency))
        errors.push(`${path}.currency: ISO-style currency code required`);
}
function stringArray(value) { return Array.isArray(value) && value.every(nonEmpty) && new Set(value).size === value.length; }
function canonicalUrl(value) { try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol))
        return null;
    for (const key of [...url.searchParams.keys()])
        if (key.toLowerCase().startsWith('utm_'))
            url.searchParams.delete(key);
    url.hash = '';
    if (url.pathname.length > 1)
        url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
}
catch {
    return null;
} }
function fingerprint(value) { return value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim().replace(/\s+/g, ' '); }
function reportIdentity(record, institutionId) {
    return [institutionId, fingerprint(record.headline), record.publishedAt, record.companyKey ?? '', record.themeKey ?? ''].join('\u0000');
}
function normalizeResearch(record, institution, url) {
    const companyId = record.companyKey ? createCommonIntelligenceId('company', record.companyKey) : null;
    const themeId = record.themeKey ? createCommonIntelligenceId('theme', record.themeKey) : null;
    const eventId = record.eventKey ? createCommonIntelligenceId('event', record.eventKey) : null;
    return {
        researchId: record.researchId, institutionId: institution.institutionId, publisher: institution.name, analyst: record.analyst, publishedAt: record.publishedAt, collectedAt: record.collectedAt,
        researchType: record.researchType, headline: record.headline, summary: record.summary, market: record.market, sector: record.sector, industry: record.industry,
        companyId, company: record.company, ticker: record.ticker, themeId, eventId, institutionView: record.institutionView,
        evidence: record.evidence.map(value => ({ ...value, sourceRecordId: record.sourceRecordId, sourceUrl: url, page: record.sourcePage, section: record.sourceSection })),
        targetPrice: structuredClone(record.targetPrice), previousTargetPrice: structuredClone(record.previousTargetPrice), targetPriceChange: record.targetPriceChange,
        rating: record.rating, previousRating: record.previousRating, ratingChange: record.ratingChange, investmentStrategy: [...record.investmentStrategy], riskFactors: [...record.riskFactors],
        aiInterpretation: record.aiInterpretation, sourceUrl: url, verificationStatus: record.verificationStatus, provenance: [sourceProvenance(record, url)]
    };
}
function sourceProvenance(record, url) {
    return { sourceRecordId: record.sourceRecordId, sourceKind: record.sourceKind, sourceFormat: record.sourceFormat, sourceUrl: url, publishedAt: record.publishedAt, collectedAt: record.collectedAt, page: record.sourcePage, section: record.sourceSection, extractedFields: [...record.extractedFields] };
}
function mergeSource(item, record, url) {
    const currentPriority = Math.min(...item.provenance.map(source => sourcePriority[source.sourceKind]));
    if (sourcePriority[record.sourceKind] < currentPriority)
        item.sourceUrl = url;
    if (!item.provenance.some(source => source.sourceUrl === url && source.sourceRecordId === record.sourceRecordId))
        item.provenance.push(sourceProvenance(record, url));
    for (const evidence of record.evidence) {
        if (!item.evidence.some(value => value.evidenceId === evidence.evidenceId && value.sourceRecordId === record.sourceRecordId))
            item.evidence.push({ ...evidence, sourceRecordId: record.sourceRecordId, sourceUrl: url, page: record.sourcePage, section: record.sourceSection });
    }
}
export function buildKoreaResearchNewsletterEntries(items) {
    return items.filter(item => ['VERIFIED', 'PARTIALLY_VERIFIED', 'PRIMARY_SOURCE_ONLY'].includes(item.verificationStatus)).map(item => ({
        researchId: item.researchId, publisher: item.publisher, analyst: item.analyst, headline: item.headline, summary: item.summary, institutionView: item.institutionView,
        evidence: unique(item.evidence.map(value => value.text)), interests: unique([item.sector, item.industry, item.company, item.ticker].filter((value) => nonEmpty(value))),
        investmentStrategy: [...item.investmentStrategy], riskFactors: [...item.riskFactors],
        targetPriceLabel: priceLabel(item), ratingLabel: ratingLabel(item), aiInterpretation: item.aiInterpretation,
        sources: unique(item.provenance.map(source => `${source.sourceUrl}\u0000${source.sourceFormat}`)).map(value => { const [url, format] = value.split('\u0000'); return { label: `${item.publisher} ${format} 원문`, url: url, publisher: item.publisher }; })
    }));
}
function priceLabel(item) {
    if (!item.targetPrice)
        return null;
    const current = `${item.targetPrice.value.toLocaleString('ko-KR')} ${item.targetPrice.currency}`;
    const previous = item.previousTargetPrice ? `${item.previousTargetPrice.value.toLocaleString('ko-KR')} ${item.previousTargetPrice.currency}` : null;
    return `목표주가 ${current}${previous ? ` (이전 ${previous})` : ''} · ${item.targetPriceChange}`;
}
function ratingLabel(item) {
    if (!item.rating)
        return null;
    return `투자의견 ${item.rating}${item.previousRating ? ` (이전 ${item.previousRating})` : ''} · ${item.ratingChange}`;
}
