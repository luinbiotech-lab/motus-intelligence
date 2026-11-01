import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGoldenIntelligenceRehearsal } from '../src/intelligence/golden-rehearsal.js';
import { motusMarketColors, periodicIntelligenceBoundaries, renderAIIntelligenceDaily, renderKoreaMarketDaily, renderReportsArchive, renderUSMarketDaily, splitNewsletterIntoDailyMasters } from '../src/intelligence/daily-masters.js';
import { MOTUS_PUBLIC_CATEGORY_MASTER } from '../src/content/publisher-schema.js';
const model = () => buildGoldenIntelligenceRehearsal().newsletter;
const split = () => splitNewsletterIntoDailyMasters(model());
test('Sprint 4D maps canonical Blogger labels separately from bilingual display labels', () => {
    assert.deepEqual(MOTUS_PUBLIC_CATEGORY_MASTER.US_MARKET, { canonicalLabel: 'U.S. Market', displayLabel: '미국증시 (U.S. Market)' });
    assert.deepEqual(MOTUS_PUBLIC_CATEGORY_MASTER.AI_INTELLIGENCE, { canonicalLabel: 'AI Intelligence', displayLabel: 'AI 인텔리전스 (AI Intelligence)' });
    assert.deepEqual(MOTUS_PUBLIC_CATEGORY_MASTER.KOREA_MARKET, { canonicalLabel: 'Korea Market', displayLabel: '국내증시 (Korea Market)' });
    assert.equal(Object.values(MOTUS_PUBLIC_CATEGORY_MASTER).map(item => String(item.canonicalLabel)).includes('Wall Street'), false);
});
test('Sprint 4D builds three independent Daily ViewModels without changing the shared NewsletterViewModel', () => {
    const original = model();
    const before = JSON.stringify(original);
    const masters = splitNewsletterIntoDailyMasters(original);
    assert.equal(JSON.stringify(original), before);
    assert.equal(masters.ai.category, 'AI_INTELLIGENCE');
    assert.equal(masters.us.category, 'US_MARKET');
    assert.equal(masters.korea.category, 'KOREA_MARKET');
    assert.equal(masters.ai.issues.length, 3);
    assert.equal(masters.us.marketHistory.series.length, 4);
    assert.equal(masters.korea.indexMetrics.length, 2);
    assert.equal(masters.korea.research.length, 5);
});
test('Sprint 4D AI Daily renders explanatory article hierarchy instead of a summary-only article', () => {
    const rendered = renderAIIntelligenceDaily(split().ai);
    const html = rendered.html;
    assert.deepEqual(rendered.renderedSections, ['masthead', 'today-core', 'key-ai-issues', 'industry-connections', 'what-to-watch', 'sources']);
    for (const heading of ['오늘의 핵심', 'AI·산업 인텔리전스', '산업·기업 연결', '연결 대상', '다음 확인사항', '주요 출처'])
        assert.match(html, new RegExp(heading));
    assert.doesNotMatch(html, /무슨 일이 있었나|핵심 내용|왜 중요한가|시장 연결|data-render-field="source-fact"|data-render-field="ai-interpretation"/);
    assert.doesNotMatch(html, /intelligenceId|eventId|themeId|companyId/);
    assert.ok(split().ai.issues.every(item => item.whyItMatters));
});
test('Sprint 4D US Daily renders four actual charts and no duplicate index number cards', () => {
    const master = split().us;
    const rendered = renderUSMarketDaily(master);
    const html = rendered.html;
    assert.equal((html.match(/<svg class="index-line-chart"/g) ?? []).length, 4);
    assert.equal((html.match(/data-index="(?:sp500|nasdaq|dow-jones|russell-2000)"/g) ?? []).length, 8);
    assert.deepEqual(master.supportingMetrics.map(metric => metric.label), ['VIX', '미국 10년물', 'Brent']);
    for (const date of ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29'])
        assert.match(html, new RegExp(date));
    assert.match(html, /주요지수 추이 \(Major Index Trends\)/);
    assert.equal((html.match(/Associated Press market closes<\/a>/g) ?? []).length, 1);
});
test('Sprint 4D Korea Daily uses directional flow visualization and never fabricates history', () => {
    const master = split().korea;
    assert.equal(Object.hasOwn(master, 'marketHistory'), false);
    const rendered = renderKoreaMarketDaily(master);
    const html = rendered.html;
    assert.match(html, /data-visualization="korea-investor-flow"/);
    assert.match(html, new RegExp(`background:${motusMarketColors.positive}`));
    assert.match(html, new RegExp(`background:${motusMarketColors.negative}`));
    assert.doesNotMatch(html, /<svg class="index-line-chart"/);
    assert.match(html, /국내 증권사 리서치/);
    assert.match(html, /data-render-field="institution-view"/);
});
test('Sprint 4D applies Korea market color convention to every new market renderer', () => {
    assert.equal(motusMarketColors.positive, '#c62828');
    assert.equal(motusMarketColors.negative, '#1565c0');
    assert.equal(motusMarketColors.unchanged, '#59697d');
    const us = renderUSMarketDaily(split().us).html;
    const korea = renderKoreaMarketDaily(split().korea).html;
    assert.match(us, /#1565c0/);
    assert.match(korea, /#c62828/);
    assert.match(korea, /#1565c0/);
});
test('Sprint 4D dedupes canonical source URL plus publisher in public HTML', () => {
    const newsletter = model();
    newsletter.sources.push({ ...newsletter.sources[3], url: `${newsletter.sources[3].url}?utm_source=duplicate` });
    const masters = splitNewsletterIntoDailyMasters(newsletter);
    const html = renderUSMarketDaily(masters.us).html;
    assert.equal((html.match(/Associated Press market closes<\/a>/g) ?? []).length, 1);
    assert.doesNotMatch(html, /utm_source/);
    assert.doesNotMatch(html, />\s*https?:\/\//);
});
test('Sprint 4D omits glossary unless it has explanatory value and uses dictionary form when supplied', () => {
    const without = renderUSMarketDaily(split().us).html;
    assert.doesNotMatch(without, /용어해설/);
    const masters = splitNewsletterIntoDailyMasters(model(), { glossaries: { us: [{ term: 'VIX', fullSpelling: 'Cboe Volatility Index', definition: '미국 증시의 예상 변동성 지수' }] } });
    const withGlossary = renderUSMarketDaily(masters.us).html;
    assert.match(withGlossary, /VIX[\s\S]*Cboe Volatility Index[\s\S]*미국 증시의 예상 변동성 지수/);
    assert.doesNotMatch(withGlossary, /입니다|합니다/);
});
test('Sprint 4D hides PDF CTA without a verified available download URL and exposes Reports metadata safely', () => {
    const invalid = { title: 'US Market Daily PDF', issueDate: '2026-09-29', category: 'US_MARKET', reportType: 'US_MARKET_DAILY', downloadUrl: 'https://example.com/report.pdf', generatedAt: '2026-09-30T00:00:00Z', state: 'AVAILABLE' };
    const valid = { ...invalid, downloadUrl: 'https://motusnova.blogspot.com/reports/2026-09-29-us-market.pdf' };
    const hidden = renderUSMarketDaily(splitNewsletterIntoDailyMasters(model(), { reports: { us: invalid } }).us).html;
    assert.doesNotMatch(hidden, /PDF 리포트 다운로드/);
    const visible = renderUSMarketDaily(splitNewsletterIntoDailyMasters(model(), { reports: { us: valid } }).us).html;
    assert.match(visible, /PDF 리포트 다운로드/);
    const archive = renderReportsArchive({ title: '리포트 (Reports)', entries: [invalid, valid] });
    assert.equal((archive.match(/PDF 리포트 다운로드/g) ?? []).length, 1);
    assert.match(archive, /미국증시 \(U\.S\. Market\)/);
});
test('Sprint 4D keeps inline Blogger safety, mobile width and Commerce disabled by absence', () => {
    const rendered = [renderAIIntelligenceDaily(split().ai), renderUSMarketDaily(split().us), renderKoreaMarketDaily(split().korea)];
    for (const result of rendered) {
        assert.match(result.html, /width:100%;max-width:100%;box-sizing:border-box/);
        assert.doesNotMatch(result.html, /<script\b|<iframe\b|<style\b|javascript:|commerce|affiliate/i);
    }
    assert.deepEqual(periodicIntelligenceBoundaries.map(item => item.cadence), ['WEEKLY', 'MONTHLY']);
    assert.ok(periodicIntelligenceBoundaries.every(item => item.crossIntelligence && item.consensusDivergence && item.investmentMap && item.themeChanges && item.institutionChanges && item.eventToMarketReview));
});
test('Sprint 4D preserves the first published article and publication history', () => {
    const record = JSON.parse(readFileSync('data/blogger/2026-09-29/newsletter-motus-2026-09-29-publication.json', 'utf8'));
    assert.equal(record.status, 'PUBLISHED');
    assert.equal(record.draftPostId, '9009523239057574527');
    assert.equal(record.publicPostUrl, 'https://motusnova.blogspot.com/2026/09/5-ai.html');
    assert.ok(record.history.length > 0);
});
