import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNaverDataLab } from '../src/search/intelligence.js';
const topic = (topicId, label) => ({ topicId, label, aliases: [], category: 'US_MARKET', claimRefs: ['claim:' + topicId], sourceRefs: ['https://example.org/' + topicId], verificationStatus: 'VERIFIED' });
const topics = [topic('us:index:nasdaq', '나스닥'), topic('us:10y', '미국 10년물 국채금리')];
const base = { startDate: '2026-10-23', endDate: '2026-10-29', timeUnit: 'date' };
test('a keyword group with too little volume (empty series) yields no signal but keeps the others (10/30 RESPONSE_INVALID)', () => {
    const signals = normalizeNaverDataLab({ response: { ...base, results: [{ title: '나스닥', keywords: ['나스닥'], data: [{ period: '2026-10-28', ratio: 62 }, { period: '2026-10-29', ratio: 100 }] }, { title: '미국 10년물 국채금리', keywords: ['미국 10년물 국채금리'], data: [] }] }, topics, collectedAt: '2026-10-29T23:28:00Z' });
    assert.deepEqual(signals.map(item => item.topicId), ['us:index:nasdaq']);
    assert.deepEqual(signals[0].metrics.relativeRatios, [62, 100]);
});
test('malformed series still fail the provider (non-blocking upstream)', () => {
    assert.throws(() => normalizeNaverDataLab({ response: { ...base, results: [{ title: '나스닥', keywords: ['나스닥'], data: [{ period: '2026-10-29', ratio: 140 }] }] }, topics, collectedAt: '2026-10-29T23:28:00Z' }), /NAVER_DATALAB_RESPONSE_INVALID/);
    assert.throws(() => normalizeNaverDataLab({ response: { ...base, results: [{ title: '나스닥', keywords: ['나스닥'], data: [{ period: 'yesterday', ratio: 10 }] }] }, topics, collectedAt: '2026-10-29T23:28:00Z' }), /NAVER_DATALAB_RESPONSE_INVALID/);
    assert.throws(() => normalizeNaverDataLab({ response: { ...base, results: [{ title: '나스닥', keywords: ['나스닥'], data: null }] }, topics, collectedAt: '2026-10-29T23:28:00Z' }), /NAVER_DATALAB_RESPONSE_INVALID/);
});
