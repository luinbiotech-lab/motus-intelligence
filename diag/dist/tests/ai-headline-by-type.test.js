import test from 'node:test';
import assert from 'node:assert/strict';
import { aiHeadline } from '../src/operations/ai-editorial-synthesis.js';
import { titlePolicyViolations, titleContainsCalendarDate } from '../src/production/editorial-quality.js';
const base = { topicId: 't', publisher: 'NVIDIA', company: '엔비디아', topic: '베라 루빈 AI 인프라 상용화', headline: '', facts: ['x'], interpretation: '', watch: '', link: 'https://example.com', publishedAt: '2026-10-29T00:00:00Z' };
const types = ['launch', 'infrastructure', 'partnership', 'adoption', 'investment', 'research', 'security', 'policy', 'education'];
test('AI headlines follow the event type and every shape passes the headline policy', () => {
    const titles = types.map(eventType => aiHeadline({ ...base, eventType }));
    assert.equal(new Set(titles).size, types.length, 'each event type reads differently');
    for (const title of titles) {
        assert.deepEqual(titlePolicyViolations(title), [], title);
        assert.equal(titleContainsCalendarDate(title), false);
        assert.ok(title.startsWith('엔비디아'));
    }
    assert.equal(aiHeadline({ ...base, eventType: 'launch' }), '엔비디아가 공개한 베라 루빈 AI 인프라 상용화, 실제 도입으로 이어질까');
});
test('events without a known type keep the previous headline and correct particles', () => {
    assert.equal(aiHeadline({ ...base, company: '메타', topic: '신규 AI 제품·기능' }), '메타가 공개한 신규 AI 제품·기능, 실제 산업 변화로 이어질까');
    assert.equal(aiHeadline({ ...base, company: '구글', topic: '새 모델', eventType: 'unknown' }), '구글이 공개한 새 모델, 실제 산업 변화로 이어질까');
});
