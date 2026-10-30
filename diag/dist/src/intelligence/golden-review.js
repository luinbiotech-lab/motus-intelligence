import { buildGoldenIntelligenceRehearsal, GOLDEN_INTELLIGENCE_DATE } from './golden-rehearsal.js';
const internal = /claimId|researchId|eventId|themeId|companyId|confidenceScore|verificationStatus|MANUAL_VERIFIED|REVIEW_REQUIRED/i;
const rawUrl = /https?:\/\//i;
export function assessGoldenReview() {
    const { checks, notes } = evaluate();
    return { issueDate: GOLDEN_INTELLIGENCE_DATE, status: 'PENDING_HUMAN_APPROVAL', recommendation: checks.every(item => item.status === 'PASS') ? 'APPROVE' : 'MODIFY', checks, notes, modifications: ['Cross Intelligence를 공통 event exact-match 범위로 축소', 'VIX 표시 테마를 Market volatility로 분리', 'Blogger 본문 H1을 role heading으로 변경'] };
}
export function performGoldenHumanReview(reviewedAt, explicitDecision) {
    if (!Number.isFinite(Date.parse(reviewedAt)))
        throw new Error('valid reviewedAt required');
    if (explicitDecision !== 'APPROVED')
        throw new Error('explicit human APPROVED decision required');
    const { checks, notes } = evaluate();
    const decision = checks.every(item => item.status === 'PASS') ? 'APPROVED' : 'MODIFY';
    return { issueDate: GOLDEN_INTELLIGENCE_DATE, decision, reviewer: 'human', reviewedAt, modificationHistory: [
            { at: reviewedAt, from: 'PENDING', to: 'MODIFY', reason: '초기 검토에서 Cross Intelligence 전이 연결 과장과 VIX 테마 라벨 재사용을 확인' },
            { at: reviewedAt, from: 'MODIFY', to: decision, reason: decision === 'APPROVED' ? 'event exact-match 범위로 축소하고 VIX 테마 라벨 및 제목 중복을 보정한 뒤 전 항목 재검토' : '재검토 항목이 남아 승인 보류' }
        ], checks, notes };
}
function evaluate() {
    const preview = buildGoldenIntelligenceRehearsal();
    const model = preview.newsletter;
    const html = preview.blogger.html;
    const visible = html.replace(/<[^>]+>/g, ' ');
    const checks = [
        check('제목', model.title === '국채금리 5%대의 압박과 AI 에이전트 경쟁', model.title),
        check('Today at a Glance', Boolean(model.todayAtAGlance?.headline && model.todayAtAGlance.bullets.length === 3), 'headline·summary·3 bullets'),
        check('Market Snapshot', model.marketSnapshot?.metrics.length === 7, '미국 지수·VIX·10년물·Brent 7개'),
        check('미국 주요지수 2×2 차트', (html.match(/<svg class="index-line-chart"/g) ?? []).length === 4, '5거래일 line chart 4개'),
        check('AI Intelligence', model.aiIntelligence?.length === 3, '공식 발표 3건'), check('Wall Street', model.wallStreetIntelligence?.length === 3, '교차검증 3건'),
        check('Korea Market', model.koreaMarketFacts?.metrics.length === 15, '공개 허용 fact 15개; REVIEW_REQUIRED 3개 제외'), check('Korea Research', model.koreaResearch?.length === 5, '공개 리서치 5건'),
        check('Cross Intelligence', model.crossIntelligenceChains?.length === 1 && (model.crossIntelligenceChains[0]?.aiIndustry.length ?? 0) === 1 && (model.crossIntelligenceChains[0]?.koreaResearch.length ?? 0) === 1, '공통 event 근거 2개 항목만 연결'),
        check('Investment Map', Boolean(model.investmentMapV1 && model.investmentMapV1.koreaResearchFocus.length === 6 && model.investmentMapV1.mostDiscussedStocks.length === 3), '실제 deduped count만 사용'),
        check('What to Watch', model.whatToWatch?.length === 3, '금리·에이전트·외국인 수급'), check('출처 링크', (html.match(/<a href="https:\/\//g) ?? []).length >= model.sources.length, '출처명 anchor; raw URL 비노출'),
        check('기관 의견 / MOTUS AI 해석 분리', Boolean(model.aiIntelligence?.every(item => item.institutionView === null && item.aiInterpretation) && model.koreaResearch?.every(item => item.aiInterpretation === null)), 'AI 해석과 기관 원문 필드 분리'),
        check('모바일 overflow', /width:100%;max-width:100%;box-sizing:border-box/.test(html) && !/<iframe\b|<script\b|<style\b/i.test(html), 'inline style·responsive width'),
        check('public leakage', !internal.test(html) && !rawUrl.test(visible), '내부 토큰·화면 raw URL 없음'), check('제목 중복', !/<h1\b/i.test(html), 'Blogger post title과 본문 H1 중복 없음')
    ];
    return { checks, notes: ['REVIEW_REQUIRED Korea Market fact 3건은 공개 출력에서 제외', '확인되지 않은 analyst·target price·rating은 null 유지', 'Investment Map은 언급 집계이며 추천 또는 임의 순위가 아님'] };
}
function check(item, pass, detail) { return { item, status: pass ? 'PASS' : 'FAIL', detail }; }
export function createApprovedGoldenBloggerRecord(config, review) {
    if (review.decision !== 'APPROVED' || review.reviewer !== 'human')
        throw new Error('explicit human APPROVED review required');
    const preview = buildGoldenIntelligenceRehearsal();
    const model = preview.newsletter;
    const slug = `motus-daily-intelligence-${model.issueDate}`;
    const metadata = { schemaVersion: '1.0', brand: 'MOTUS', displayName: 'MOTUS | What Moves the World', primaryCategory: 'Daily Market', categories: ['Daily Market', 'AI & Industry', 'Market / Investment Insight'], companies: ['OpenAI', 'NVIDIA', 'Microsoft', 'Meta Platforms', 'Anthropic'], sectors: ['Technology', 'Semiconductors'], themes: ['Agentic AI', 'AI Agent Security', 'AI for Science'], countries: ['United States', 'South Korea'], regions: ['North America', 'Asia'] };
    return { publicationVersion: '4B.MOTUS-INTELLIGENCE.1.0', reportId: model.newsletterId, tradingDate: model.issueDate, status: 'APPROVED', title: model.title, seoTitle: model.title, metaDescription: model.editorialSummary, slug, labels: ['MOTUS Daily'], hashtags: ['#MOTUS', '#미국증시', '#한국증시', '#AI산업', '#인공지능', '#반도체', '#국채금리', '#시장분석'], metadata, previewUrl: `${config.previewBaseUrl.replace(/\/+$/, '')}/${slug}`, placeholderUrl: `${config.placeholderBaseUrl.replace(/\/+$/, '')}/${slug}`, draftPostId: null, publicPostUrl: null, html: preview.blogger.html, glossary: [], relatedLinks: [], sources: model.sources.map(source => ({ label: source.label, url: source.url })), dryRun: false, error: null, createdAt: review.reviewedAt, updatedAt: review.reviewedAt, history: [{ at: review.reviewedAt, from: null, to: 'PREVIEW_READY', reason: 'Golden Intelligence Blogger preview generated' }, { at: review.reviewedAt, from: 'PREVIEW_READY', to: 'APPROVED', reason: 'explicit human review approved Golden Intelligence draft creation' }] };
}
export function verifyGoldenBloggerReadback(input) {
    const visible = input.content.replace(/<[^>]+>/g, ' ');
    const checks = { postId: Boolean(input.postId), draftState: input.status === 'DRAFT', title: input.title === '국채금리 5%대의 압박과 AI 에이전트 경쟁', label: input.labels.includes('MOTUS Daily'), deepNavy: /background:\s*#03162e/i.test(input.content), titleTypography: /font-size:\s*32px/i.test(input.content), charts: (input.content.match(/<svg\b/gi) ?? []).length === 4, koreaMarket: /Korea Market Intelligence/.test(input.content), koreaResearch: /Korea Research/.test(input.content), crossIntelligence: /Cross Intelligence/.test(input.content), investmentMap: /Investment Map/.test(input.content), sourceLinks: (input.content.match(/<a\b[^>]*href="https:\/\//gi) ?? []).length >= 10, inlineStyles: (input.content.match(/style="/gi) ?? []).length >= 30, mobile: /width:\s*100%;\s*max-width:\s*100%;\s*box-sizing:\s*border-box/i.test(input.content) && !/min-width:\s*[4-9]\d{2}px/i.test(input.content), rawUrl: !rawUrl.test(visible), internalTokens: !internal.test(input.content), h1: (input.content.match(/<h1\b/gi) ?? []).length === 0, publicPostUrl: input.url === null };
    return { checks, pass: Object.values(checks).every(Boolean), svgCount: (input.content.match(/<svg\b/gi) ?? []).length, styleAttributeCount: (input.content.match(/style="/gi) ?? []).length, anchorCount: (input.content.match(/<a\b[^>]*href="https:\/\//gi) ?? []).length };
}
