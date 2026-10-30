import { createHash } from 'node:crypto';
import { buildKoreaResearchNewsletterEntries } from './brokerage-research.js';
import { buildCrossIntelligenceNewsletterEntries } from './cross-intelligence.js';
import { buildInvestmentMapA4CompactView, buildInvestmentMapNewsletterView } from './investment-map.js';
import { buildKoreaMarketNewsletterView } from './korea-market.js';
import { createNewsletterViewModel, newsletterEntryFromIntelligence } from './newsletter.js';
import { assertNewsletterPublicHtmlSafe, renderMotusDailyNewsletter } from '../publishers/motus-newsletter.js';
export const dailyReviewStatuses = ['PENDING', 'APPROVED', 'MODIFY', 'REJECT', 'HOLD'];
const verified = new Set(['VERIFIED', 'PARTIALLY_VERIFIED', 'PRIMARY_SOURCE_ONLY']);
const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const unique = (items) => [...new Set(items)];
export function assembleDailyIntelligence(input) {
    const ai = input.aiIntelligence.filter(item => verified.has(item.verificationStatus)).map(item => toNewsletterEntry(item, input.sourceFactsByIntelligenceId));
    const wall = input.wallStreetIntelligence.filter(item => verified.has(item.verificationStatus)).map(item => toNewsletterEntry(item, input.sourceFactsByIntelligenceId));
    const koreaMarketFacts = buildKoreaMarketNewsletterView(input.koreaMarketFacts);
    const koreaResearch = buildKoreaResearchNewsletterEntries(input.koreaBrokerageResearch);
    const crossIntelligenceChains = buildCrossIntelligenceNewsletterEntries(input.crossIntelligence);
    const sources = dedupeSources([
        ...ai.flatMap(item => item.sources), ...wall.flatMap(item => item.sources), ...(koreaMarketFacts?.sources.map(source => ({ ...source, publisher: source.label })) ?? []),
        ...koreaResearch.flatMap(item => item.sources), ...crossIntelligenceChains.flatMap(item => item.sources)
    ]);
    const newsletter = createNewsletterViewModel({
        ...input.newsletter, assets: input.newsletter.assets ?? [], sources,
        aiIntelligence: ai, wallStreetIntelligence: wall, ...(koreaMarketFacts ? { koreaMarketFacts } : {}), koreaResearch,
        crossIntelligenceChains, investmentMapV1: buildInvestmentMapNewsletterView(input.investmentMap),
        ...(input.newsletter.whatToWatch ? { whatToWatch: input.newsletter.whatToWatch } : {})
    });
    return { newsletter, investmentMap: structuredClone(input.investmentMap), contentFingerprint: fingerprintNewsletter(newsletter) };
}
function toNewsletterEntry(item, facts) {
    return newsletterEntryFromIntelligence(item, {
        sourceFacts: facts?.[item.intelligenceId] ?? [],
        sources: dedupeSources(item.provenance.sources.map(source => ({ label: item.publisher ?? item.source, url: source.sourceUrl, publisher: item.publisher })))
    });
}
export function createPendingDailyReview() { return { status: 'PENDING', reviewer: null, reviewedAt: null, history: [] }; }
export function createNotGeneratedChannelState() { return { blogger: { artifactState: 'NOT_GENERATED', publicationState: 'DRAFT', error: null }, email: { artifactState: 'NOT_GENERATED', error: null }, a4: { artifactState: 'NOT_GENERATED', distributionState: 'PRIVATE_PREVIEW', error: null } }; }
export function recordDailyReview(review, to, reviewer, note, at) {
    if (!reviewer.trim() || !note.trim() || !Number.isFinite(Date.parse(at)))
        throw new Error('reviewer, note and valid reviewedAt are required');
    return { status: to, reviewer, reviewedAt: at, history: [...review.history, { at, from: review.status, to, reviewer, note }] };
}
export function renderDailyIntelligencePreviews(assembled, review, bloggerUrl = null) {
    const blogger = renderMotusDailyNewsletter(assembled.newsletter);
    const email = renderEmailNewsletter(assembled.newsletter, assembled.contentFingerprint, bloggerUrl, assembled.investmentMap);
    const a4 = renderA4DailyIntelligence(assembled.newsletter, assembled.investmentMap, assembled.contentFingerprint, bloggerUrl);
    const state = review.status === 'APPROVED' ? 'APPROVED' : 'PREVIEW_READY';
    return { newsletter: assembled.newsletter, blogger, email, a4, states: { blogger: { artifactState: state, publicationState: 'DRAFT', error: null }, email: { artifactState: state, error: null }, a4: { artifactState: state, distributionState: 'PRIVATE_PREVIEW', error: null } }, review: structuredClone(review), contentFingerprint: assembled.contentFingerprint };
}
export function markBloggerPublished(preview) { requireApproved(preview.review, 'Blogger publish'); return { ...structuredClone(preview.states), blogger: { artifactState: 'PUBLISHED', publicationState: 'PUBLISHED', error: null } }; }
export function markEmailSent(preview) { requireApproved(preview.review, 'Email send'); return { ...structuredClone(preview.states), email: { artifactState: 'SENT', error: null } }; }
export function markA4Released(preview) { requireApproved(preview.review, 'A4 release'); return { ...structuredClone(preview.states), a4: { artifactState: 'RELEASED', distributionState: 'RELEASED', error: null } }; }
function requireApproved(review, action) { if (review.status !== 'APPROVED')
    throw new Error(`${action} blocked: Human Review APPROVED required`); }
export async function prepareMorningIntelligenceRun(input) {
    const collected = await input.collector.collect(input.issueDate);
    const assembled = assembleDailyIntelligence({ ...collected, newsletter: input.newsletter });
    return renderDailyIntelligencePreviews(assembled, input.review ?? createPendingDailyReview(), input.bloggerUrl ?? null);
}
export function renderEmailNewsletter(model, contentFingerprint, bloggerUrl, map) {
    const sourceUrls = model.sources.map(source => source.url);
    const blocks = [];
    const text = [model.title, model.issueDate, model.editorialSummary];
    const add = (title, items) => { if (!items.length)
        return; blocks.push(`<h2 style="color:#03162e;font-size:18px;margin:20px 0 8px">${esc(title)}</h2><ul style="padding-left:20px;margin:0">${items.map(item => `<li style="margin:0 0 7px">${esc(item)}</li>`).join('')}</ul>`); text.push(title, ...items); };
    if (model.todayAtAGlance)
        add('Today at a Glance', [model.todayAtAGlance.headline, ...model.todayAtAGlance.bullets]);
    if (model.marketSnapshot)
        add('Market Snapshot', model.marketSnapshot.metrics.map(item => `${item.label} ${item.value}${item.change ? ` (${item.change})` : ''}`));
    add('AI 핵심', (model.aiIntelligence ?? []).map(item => `${item.headline} — ${item.summary}`));
    add('Wall Street 핵심', (model.wallStreetIntelligence ?? []).map(item => `${item.headline} — ${item.institutionView ?? item.summary}`));
    add('Korea 핵심', [...(model.koreaMarketFacts?.metrics.map(item => `${item.label} ${item.displayValue}`) ?? []), ...(model.koreaResearch ?? []).map(item => `${item.publisher}: ${item.institutionView}`)]);
    add('Cross Intelligence', (model.crossIntelligenceChains ?? []).map(item => `${item.themeEvent} — ${item.connectionSummary}`));
    if (map) {
        const compact = buildInvestmentMapA4CompactView(map);
        add('Investment Map 요약', [...compactLines(compact), ...investmentChangeLines(model)]);
    }
    add('What to Watch', (model.whatToWatch ?? []).map(item => `${item.headline} — ${item.watchFor}`));
    const sources = model.sources.length ? `<h2 style="color:#03162e;font-size:18px;margin:20px 0 8px">Sources</h2><ul style="padding-left:20px">${model.sources.map(source => `<li><a href="${esc(source.url)}" style="color:#0759a6">${esc(source.label)}</a></li>`).join('')}</ul>` : '';
    const cta = bloggerUrl ? `<p style="margin:22px 0 0"><a href="${esc(bloggerUrl)}" style="background:#03162e;color:#fff;padding:11px 16px;text-decoration:none;font-weight:700">전체 분석은 MOTUS에서 확인하세요</a></p>` : '';
    const html = `<!doctype html><html lang="ko"><body><main data-channel="email" style="font-family:Arial,sans-serif;color:#172033;line-height:1.55;width:100%;max-width:680px;margin:0 auto;box-sizing:border-box"><header style="background:#03162e;color:#fff;padding:22px"><strong>MOTUS | What Moves the World</strong><h1 style="font-size:25px;margin:8px 0">${esc(model.title)}</h1><span>${esc(model.issueDate)}</span></header><p>${esc(model.editorialSummary)}</p>${blocks.join('')}${sources}${cta}</main></body></html>`;
    assertNewsletterPublicHtmlSafe(html);
    return { subject: `${model.title} · ${model.issueDate}`, html, text: text.join('\n'), sourceUrls, contentFingerprint };
}
export function renderA4DailyIntelligence(model, map, contentFingerprint, bloggerUrl) {
    const compact = buildInvestmentMapA4CompactView(map);
    const view = { issueDate: model.issueDate, title: model.title, ...(model.marketSnapshot ? { marketSnapshot: model.marketSnapshot } : {}), aiIndustry: (model.aiIntelligence ?? []).map(item => item.headline), wallStreet: (model.wallStreetIntelligence ?? []).map(item => item.institutionView ?? item.headline), koreaResearch: (model.koreaResearch ?? []).map(item => `${item.publisher}: ${item.institutionView}`), crossIntelligence: (model.crossIntelligenceChains ?? []).map(item => item.connectionSummary), investmentMap: compact, targetPriceRatingChanges: investmentChangeLines(model), risksAndWatch: [...compact.majorRisks.map(item => item.label), ...(model.whatToWatch ?? []).map(item => item.watchFor)], sources: model.sources, qrUrl: bloggerUrl };
    const sections = [['Market Snapshot', view.marketSnapshot?.metrics.map(item => `${item.label} ${item.value}${item.change ? ` (${item.change})` : ''}`) ?? []], ['AI & Industry', view.aiIndustry], ['Wall Street', view.wallStreet], ['Korea Research', view.koreaResearch], ['Cross Intelligence', view.crossIntelligence], ['Investment Map', [...compactLines(compact), ...view.targetPriceRatingChanges]], ['Risk / What to Watch', view.risksAndWatch]];
    const html = `<!doctype html><html lang="ko"><body><main data-channel="a4" data-one-page="true" style="font-family:Arial,sans-serif;width:794px;height:1123px;box-sizing:border-box;overflow:hidden;padding:34px;color:#172033"><header style="background:#03162e;color:#fff;padding:18px"><strong>MOTUS Daily Intelligence</strong><h1 style="font-size:25px;margin:6px 0">${esc(model.title)}</h1><span>${esc(model.issueDate)}</span></header>${sections.filter(([, items]) => items.length).map(([title, items]) => `<section><h2 style="font-size:16px;color:#03162e;margin:13px 0 4px">${esc(title)}</h2><p style="font-size:12px;margin:0">${items.map(esc).join(' · ')}</p></section>`).join('')}<footer style="font-size:10px;margin-top:14px">${view.sources.map(source => `<a href="${esc(source.url)}">${esc(source.label)}</a>`).join(' · ')}${bloggerUrl ? `<p>QR: <a href="${esc(bloggerUrl)}">MOTUS 상세 분석</a></p>` : ''}</footer></main></body></html>`;
    const sourceLineUnits = Math.max(view.sources.length ? 1 : 0, Math.ceil(view.sources.reduce((sum, source) => sum + source.label.length + 3, 0) / 90));
    const contentUnits = sections.reduce((sum, [, items]) => sum + items.length, 0) + sourceLineUnits;
    const overflow = contentUnits > 42;
    assertNewsletterPublicHtmlSafe(html);
    return { html, viewModel: view, onePage: !overflow, overflow, contentFingerprint };
}
function compactLines(view) {
    const output = [...view.institutionalFocus.map(item => `Institutional Focus: ${item.label} (${item.mentionCount})`), ...view.koreaResearchFocus.map(item => `Korea Research Focus: ${item.label} (${item.mentionCount})`), ...view.crossMarketThemes.map(item => `Cross-Market: ${item.label} (${item.mentionCount})`), ...view.mostDiscussedStocks.map(item => `종목 언급: ${item.label} (${item.mentionCount})`), ...view.majorRisks.map(item => `리스크: ${item.label} (${item.mentionCount})`)];
    for (const [key, count] of Object.entries(view.tiedBoundaryCounts))
        if (count > 0)
            output.push(`${tieLabel(key)} 외 동일 관심도 ${count}개`);
    return output;
}
function investmentChangeLines(model) { return model.investmentMapV1?.changes.map(item => `${item.label}: ${item.detail}`) ?? []; }
function tieLabel(key) { return key === 'institutionalFocus' ? 'Institutional Focus' : key === 'koreaResearchFocus' ? 'Korea Research Focus' : key === 'crossMarketThemes' ? 'Cross-Market Themes' : key === 'mostDiscussedStocks' ? 'Most Discussed Stocks' : 'Major Risks'; }
function dedupeSources(values) { const map = new Map(); for (const source of values)
    if (!map.has(source.url))
        map.set(source.url, source); return [...map.values()]; }
function fingerprintNewsletter(model) { return createHash('sha256').update(JSON.stringify(model)).digest('hex'); }
