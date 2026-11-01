import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstSplitDailyProductionRun } from '../src/intelligence/split-daily-production.js';
import { renderUSEditorialArticle } from '../src/publishers/editorial-article.js';
function coreView() {
    const unit = createFirstSplitDailyProductionRun().units.find(item => item.category === 'US_MARKET');
    const view = structuredClone(unit.viewModel);
    view.marketHistory.series = view.marketHistory.series.slice(0, 3);
    return view;
}
test('verified three-core-index history renders when optional Russell is unavailable', () => {
    const view = coreView();
    const html = renderUSEditorialArticle(view).html;
    assert.equal((html.match(/<svg\b/g) ?? []).length, 3);
    for (const series of view.marketHistory.series) {
        assert.ok(html.includes({ 'Nasdaq': '나스닥', 'Dow Jones': '다우존스', 'Russell 2000': '러셀 2000' }[series.label] ?? series.label.replaceAll('&', '&amp;')));
        assert.ok(html.includes(String(series.latestClose)));
        assert.ok(html.includes(series.sourceUrl.replaceAll('&', '&amp;')));
    }
    assert.doesNotMatch(html, /data-chart-status="fallback"|data-index="russell-2000"/);
});
test('missing core index and invalid series still fail closed in renderer', () => {
    const missing = coreView();
    missing.marketHistory.series.pop();
    assert.match(renderUSEditorialArticle(missing).html, /data-chart-status="fallback"/);
    const invalid = coreView();
    invalid.marketHistory.series[0].closes.pop();
    assert.match(renderUSEditorialArticle(invalid).html, /data-chart-status="fallback"/);
});
