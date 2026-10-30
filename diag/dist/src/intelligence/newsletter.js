export const newsletterAssetLayers = ['DAILY', 'TOPIC', 'WEEKLY', 'EVERGREEN'];
export const legacyAINewsSourceKinds = ['GOOGLE_ALERTS', 'GMAIL', 'RSS', 'OFFICIAL_SOURCES', 'EXISTING_DAILY_COLLECTION', 'CONTENT_LIBRARY'];
export class StaticLegacyAINewsAssetAdapter {
    adapterId;
    sourceKind;
    assets;
    constructor(adapterId, sourceKind, assets) {
        this.adapterId = adapterId;
        this.sourceKind = sourceKind;
        this.assets = assets;
    }
    async collect() { return [...structuredClone(this.assets)]; }
}
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const url = (value) => { if (!nonEmpty(value))
    return false; try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
}
catch {
    return false;
} };
const uniqueStrings = (values) => [...new Set(values.map(value => value.trim()).filter(Boolean))];
export function newsletterEntryFromIntelligence(item, input) {
    return {
        intelligenceId: item.intelligenceId, headline: item.headline, summary: item.summary, company: item.company, companyId: item.companyId,
        primaryThemeId: item.themeId, relatedThemeIds: [...(item.relatedThemeIds ?? [])], eventId: item.eventId,
        institutionView: item.institutionView, aiInterpretation: item.aiInterpretation,
        sourceFacts: uniqueStrings(input.sourceFacts), sources: structuredClone(input.sources), assetIds: uniqueStrings(input.assetIds ?? [])
    };
}
const optionalArray = (value) => value?.length ? structuredClone(value) : undefined;
export function createNewsletterViewModel(input) {
    const model = {
        newsletterId: input.newsletterId, issueDate: input.issueDate, issueNumber: input.issueNumber, title: input.title, subtitle: input.subtitle,
        editorialSummary: input.editorialSummary, sources: structuredClone(input.sources), assets: structuredClone(input.assets),
        ...(input.todayAtAGlance ? { todayAtAGlance: structuredClone(input.todayAtAGlance) } : {}),
        ...(input.marketSnapshot ? { marketSnapshot: structuredClone(input.marketSnapshot) } : {}),
        ...(optionalArray(input.aiIntelligence) ? { aiIntelligence: optionalArray(input.aiIntelligence) } : {}),
        ...(optionalArray(input.wallStreetIntelligence) ? { wallStreetIntelligence: optionalArray(input.wallStreetIntelligence) } : {}),
        ...(input.koreaMarketFacts?.metrics.length ? { koreaMarketFacts: structuredClone(input.koreaMarketFacts) } : {}),
        ...(optionalArray(input.koreaResearch) ? { koreaResearch: optionalArray(input.koreaResearch) } : {}),
        ...(optionalArray(input.koreaMarketIntelligence) ? { koreaMarketIntelligence: optionalArray(input.koreaMarketIntelligence) } : {}),
        ...(optionalArray(input.crossIntelligenceChains) ? { crossIntelligenceChains: optionalArray(input.crossIntelligenceChains) } : {}),
        ...(optionalArray(input.crossIntelligence) ? { crossIntelligence: optionalArray(input.crossIntelligence) } : {}),
        ...(hasInvestmentMapContent(input.investmentMapV1) ? { investmentMapV1: structuredClone(input.investmentMapV1) } : {}),
        ...(optionalArray(input.investmentMap) ? { investmentMap: optionalArray(input.investmentMap) } : {}),
        ...(optionalArray(input.whatToWatch) ? { whatToWatch: optionalArray(input.whatToWatch) } : {})
    };
    const errors = validateNewsletterViewModel(model);
    if (errors.length)
        throw new Error(`invalid NewsletterViewModel: ${errors.join('; ')}`);
    return model;
}
export function validateNewsletterViewModel(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return ['$: object required'];
    const model = value;
    const errors = [];
    for (const key of ['newsletterId', 'title', 'subtitle', 'editorialSummary'])
        if (!nonEmpty(model[key]))
            errors.push(`${key}: required`);
    if (!nonEmpty(model.issueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(model.issueDate) || !Number.isFinite(Date.parse(model.issueDate)) || new Date(model.issueDate).toISOString().slice(0, 10) !== model.issueDate)
        errors.push('issueDate: valid date required');
    if (typeof model.issueNumber !== 'number' || !Number.isInteger(model.issueNumber) || model.issueNumber < 1)
        errors.push('issueNumber: positive integer required');
    for (const section of ['aiIntelligence', 'wallStreetIntelligence', 'koreaResearch', 'koreaMarketIntelligence', 'crossIntelligenceChains', 'crossIntelligence', 'investmentMap', 'whatToWatch'])
        if (model[section] !== undefined && (!Array.isArray(model[section]) || model[section].length === 0))
            errors.push(`${section}: omit empty sections`);
    for (const section of ['aiIntelligence', 'wallStreetIntelligence', 'koreaMarketIntelligence'])
        if (Array.isArray(model[section]))
            model[section].forEach((entry, index) => errors.push(...validateEntry(entry, `${section}[${index}]`)));
    if (model.todayAtAGlance !== undefined) {
        if (!model.todayAtAGlance || typeof model.todayAtAGlance !== 'object' || Array.isArray(model.todayAtAGlance))
            errors.push('todayAtAGlance: object required');
        else {
            const section = model.todayAtAGlance;
            if (!nonEmpty(section.headline) || !nonEmpty(section.summary) || !stringArray(section.bullets))
                errors.push('todayAtAGlance: headline, summary and bullets required');
        }
    }
    if (model.marketSnapshot !== undefined) {
        if (!model.marketSnapshot || typeof model.marketSnapshot !== 'object' || Array.isArray(model.marketSnapshot))
            errors.push('marketSnapshot: object required');
        else {
            const section = model.marketSnapshot;
            if (!nonEmpty(section.summary) || !Array.isArray(section.metrics))
                errors.push('marketSnapshot: summary and metrics required');
            else
                section.metrics.forEach((metric, index) => {
                    if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
                        errors.push(`marketSnapshot.metrics[${index}]: object required`);
                        return;
                    }
                    const record = metric;
                    if (!nonEmpty(record.label) || !nonEmpty(record.value) || record.change !== null && !nonEmpty(record.change) || !['UP', 'DOWN', 'FLAT'].includes(record.direction))
                        errors.push(`marketSnapshot.metrics[${index}]: invalid metric`);
                });
        }
    }
    if (model.koreaMarketFacts !== undefined) {
        if (!model.koreaMarketFacts || typeof model.koreaMarketFacts !== 'object' || Array.isArray(model.koreaMarketFacts))
            errors.push('koreaMarketFacts: object required');
        else {
            const section = model.koreaMarketFacts;
            if (!isoTime(section.asOf) || !Array.isArray(section.metrics) || section.metrics.length === 0 || !Array.isArray(section.sources))
                errors.push('koreaMarketFacts: asOf, metrics and sources required; omit empty section');
            if (Array.isArray(section.metrics))
                section.metrics.forEach((metric, index) => {
                    if (!metric || typeof metric !== 'object' || Array.isArray(metric)) {
                        errors.push(`koreaMarketFacts.metrics[${index}]: object required`);
                        return;
                    }
                    const record = metric;
                    if (!nonEmpty(record.factId) || !['INDEX', 'FX', 'FLOW', 'VALUE', 'PROGRAM', 'SECTOR', 'MOVER', 'BREADTH'].includes(record.group) || !nonEmpty(record.label) || !nonEmpty(record.displayValue) || !['UP', 'DOWN', 'FLAT'].includes(record.direction))
                        errors.push(`koreaMarketFacts.metrics[${index}]: invalid fact metric`);
                    if (!record.source || typeof record.source !== 'object' || Array.isArray(record.source))
                        errors.push(`koreaMarketFacts.metrics[${index}].source: object required`);
                    else
                        errors.push(...validateSource({ ...record.source, publisher: null }, `koreaMarketFacts.metrics[${index}].source`));
                });
            if (Array.isArray(section.sources))
                section.sources.forEach((source, index) => errors.push(...validateSource({ ...source, publisher: null }, `koreaMarketFacts.sources[${index}]`)));
        }
    }
    if (Array.isArray(model.koreaResearch))
        model.koreaResearch.forEach((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                errors.push(`koreaResearch[${index}]: object required`);
                return;
            }
            const record = item;
            const path = `koreaResearch[${index}]`;
            for (const key of ['researchId', 'publisher', 'headline', 'summary', 'institutionView'])
                if (!nonEmpty(record[key]))
                    errors.push(`${path}.${key}: required`);
            if (record.analyst !== null && !nonEmpty(record.analyst))
                errors.push(`${path}.analyst: string or null required`);
            for (const key of ['evidence', 'interests', 'investmentStrategy', 'riskFactors'])
                if (!stringArray(record[key]))
                    errors.push(`${path}.${key}: unique string array required`);
            for (const key of ['targetPriceLabel', 'ratingLabel', 'aiInterpretation'])
                if (record[key] !== null && !nonEmpty(record[key]))
                    errors.push(`${path}.${key}: string or null required`);
            if (nonEmpty(record.aiInterpretation) && record.aiInterpretation.trim() === String(record.institutionView).trim())
                errors.push(`${path}: institutionView and aiInterpretation must remain separate`);
            if (!Array.isArray(record.sources) || record.sources.length === 0)
                errors.push(`${path}.sources: non-empty array required`);
            else
                record.sources.forEach((source, sourceIndex) => errors.push(...validateSource(source, `${path}.sources[${sourceIndex}]`)));
        });
    if (Array.isArray(model.crossIntelligence))
        model.crossIntelligence.forEach((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                errors.push(`crossIntelligence[${index}]: object required`);
                return;
            }
            const record = item;
            if (!nonEmpty(record.headline) || !nonEmpty(record.summary) || !stringArray(record.linkedIntelligenceIds) || !stringArray(record.sourceIds))
                errors.push(`crossIntelligence[${index}]: invalid cross-intelligence item`);
        });
    if (Array.isArray(model.crossIntelligenceChains))
        model.crossIntelligenceChains.forEach((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                errors.push(`crossIntelligenceChains[${index}]: object required`);
                return;
            }
            const record = item;
            const path = `crossIntelligenceChains[${index}]`;
            if (!nonEmpty(record.themeEvent) || !nonEmpty(record.connectionSummary))
                errors.push(`${path}: themeEvent and connectionSummary required`);
            for (const key of ['aiIndustry', 'wallStreet', 'koreaResearch', 'koreaMarketReaction', 'sharedSignals', 'divergentSignals', 'changedSignals'])
                if (!stringArray(record[key]))
                    errors.push(`${path}.${key}: unique string array required`);
            if (record.aiSummary !== null) {
                if (!record.aiSummary || typeof record.aiSummary !== 'object' || Array.isArray(record.aiSummary))
                    errors.push(`${path}.aiSummary: object or null required`);
                else {
                    const summary = record.aiSummary;
                    if (!nonEmpty(summary.summary) || !stringArray(summary.followUpChecks))
                        errors.push(`${path}.aiSummary: summary and followUpChecks required`);
                }
            }
            if (!Array.isArray(record.sources))
                errors.push(`${path}.sources: array required`);
            else
                record.sources.forEach((source, sourceIndex) => errors.push(...validateSource(source, `${path}.sources[${sourceIndex}]`)));
        });
    if (Array.isArray(model.investmentMap))
        model.investmentMap.forEach((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                errors.push(`investmentMap[${index}]: object required`);
                return;
            }
            const record = item;
            if (!nonEmpty(record.theme) || !stringArray(record.upstream) || !stringArray(record.beneficiaries) || !stringArray(record.risks))
                errors.push(`investmentMap[${index}]: invalid investment map item`);
        });
    if (model.investmentMapV1 !== undefined) {
        if (!model.investmentMapV1 || typeof model.investmentMapV1 !== 'object' || Array.isArray(model.investmentMapV1))
            errors.push('investmentMapV1: object required');
        else {
            const view = model.investmentMapV1;
            const sections = ['institutionalFocus', 'koreaResearchFocus', 'crossMarketThemes', 'mostDiscussedStocks', 'changes', 'majorRisks'];
            for (const key of sections)
                if (!Array.isArray(view[key]))
                    errors.push(`investmentMapV1.${key}: array required`);
            if (sections.every(key => Array.isArray(view[key]) && view[key].length === 0))
                errors.push('investmentMapV1: omit empty section');
        }
    }
    if (Array.isArray(model.whatToWatch))
        model.whatToWatch.forEach((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) {
                errors.push(`whatToWatch[${index}]: object required`);
                return;
            }
            const record = item;
            if (!nonEmpty(record.headline) || !nonEmpty(record.watchFor) || !nonEmpty(record.validityHorizon))
                errors.push(`whatToWatch[${index}]: invalid watch item`);
        });
    if (!Array.isArray(model.sources))
        errors.push('sources: array required');
    else
        model.sources.forEach((source, index) => errors.push(...validateSource(source, `sources[${index}]`)));
    if (!Array.isArray(model.assets))
        errors.push('assets: array required');
    else
        model.assets.forEach((asset, index) => {
            if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
                errors.push(`assets[${index}]: object required`);
                return;
            }
            const record = asset;
            if (!nonEmpty(record.assetId) || !nonEmpty(record.title) || !newsletterAssetLayers.includes(record.layer))
                errors.push(`assets[${index}]: valid asset metadata required`);
            for (const key of ['companyIds', 'themeIds', 'eventIds', 'intelligenceIds', 'parentAssetIds'])
                if (!stringArray(record[key]))
                    errors.push(`assets[${index}].${key}: unique string array required`);
        });
    return errors;
}
function stringArray(value) { return Array.isArray(value) && value.every(nonEmpty) && new Set(value).size === value.length; }
function isoTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function hasInvestmentMapContent(value) { return Boolean(value) && Object.values(value).some(section => section.length > 0); }
function validateEntry(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [`${path}: object required`];
    const entry = value;
    const errors = [];
    for (const key of ['intelligenceId', 'headline', 'summary'])
        if (!nonEmpty(entry[key]))
            errors.push(`${path}.${key}: required`);
    for (const key of ['institutionView', 'aiInterpretation'])
        if (entry[key] !== null && !nonEmpty(entry[key]))
            errors.push(`${path}.${key}: string or null required`);
    if (nonEmpty(entry.institutionView) && nonEmpty(entry.aiInterpretation) && entry.institutionView.trim() === entry.aiInterpretation.trim())
        errors.push(`${path}: institutionView and aiInterpretation must remain separate`);
    if (!Array.isArray(entry.sourceFacts) || entry.sourceFacts.some(fact => !nonEmpty(fact)))
        errors.push(`${path}.sourceFacts: string array required`);
    if (!Array.isArray(entry.sources))
        errors.push(`${path}.sources: array required`);
    else
        entry.sources.forEach((source, index) => errors.push(...validateSource(source, `${path}.sources[${index}]`)));
    return errors;
}
function validateSource(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return [`${path}: object required`];
    const source = value;
    return [...(!nonEmpty(source.label) ? [`${path}.label: required`] : []), ...(!url(source.url) ? [`${path}.url: HTTP(S) required`] : []), ...(source.publisher !== null && !nonEmpty(source.publisher) ? [`${path}.publisher: string or null required`] : [])];
}
