import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateEditorialQuality, titleParticleMismatch, titlePolicyViolations } from '../src/production/editorial-quality.js';
import { buildKoreaEditorialTitle, movePhrase } from '../src/operations/internal-live-daily.js';
import { appendPublishLedger, findPublishedTitle, outcomeFileFor } from '../src/production/publication-operation.js';
import { collectGoldmanBrokerResearch } from '../src/operations/market-research-feeds.js';
test('titles that actually reached the blog in October are now refused', () => {
    // 10/28 Korea: leveraged single-stock futures ETF as headline, wrong particle after 레버리지.
    const korea = titlePolicyViolations('국내증시 마감: 1Q SK하이닉스선물단일종목레버리지과 다음 거래일 체크포인트');
    assert.ok(korea.some(reason => /product name/.test(reason)));
    assert.ok(korea.some(reason => /particle/.test(reason)));
    // 10/27 and 10/28 U.S.: English index name.
    assert.ok(titlePolicyViolations('Nasdaq 상승, 미국 주요 지수 동반 상승').some(reason => /English market index/.test(reason)));
    assert.ok(titlePolicyViolations('Dow Jones 하락, 미국 주요 지수 동반 하락').some(reason => /English market index/.test(reason)));
});
test('the gate itself holds a policy-violating headline', () => {
    const body = '<article style="max-width:100%;word-break:keep-all">' + Array.from({ length: 8 }, (_, index) => `<p>나스닥과 S&P 500의 움직임을 금리와 함께 살펴본 ${index + 1}번째 문단이며 시장 흐름과 다음 거래일 확인 지점을 정리한다. 실제 수치와 출처를 함께 제시한다.</p>`).join('') + '<p>추가 설명 문단으로 본문 길이와 구성 요건을 충족하도록 작성했다. 투자 판단은 독자의 몫이다. 시장 데이터는 공개 자료를 기준으로 했다.</p></article>';
    assert.ok(evaluateEditorialQuality('나스닥 1.20% 상승, 미국 3대 지수 동반 상승', body).pass);
    const held = evaluateEditorialQuality('Nasdaq 상승, 미국 주요 지수 동반 상승', body);
    assert.equal(held.pass, false);
    assert.ok(held.reasons.some(reason => /English market index/.test(reason)));
});
test('particle check judges only clear 과/와 and 을/를 pairs and keeps known nouns', () => {
    assert.equal(titleParticleMismatch('레버리지과 다음 거래일'), true);
    assert.equal(titleParticleMismatch('코스피와 코스닥'), false);
    assert.equal(titleParticleMismatch('금리 상승과 달러 약세'), false);
    assert.equal(titleParticleMismatch('반도체을 사들인 외국인'), true);
    assert.equal(titleParticleMismatch('관세 효과 확대와 수출'), false);
    assert.equal(titleParticleMismatch('엔비디아가 공개한 RTX Spark'), false);
});
test('Korea headline carries the verified move, Korean particles and no fixed template', () => {
    const morning = buildKoreaEditorialTitle(1.234, -0.5, false), close = buildKoreaEditorialTitle(-0.8, -1.1, true);
    assert.equal(morning, '코스피 1.23% 상승, 코스닥은 0.50% 하락, 전일 국내증시와 오늘의 확인사항');
    assert.equal(close, '코스피 0.80% 하락·코스닥 1.10% 하락으로 마감한 국내증시');
    for (const title of [morning, close])
        assert.deepEqual(titlePolicyViolations(title), []);
    assert.equal(movePhrase(0.001), '보합');
});
test('a headline already used by an earlier published article of the same category is found', async () => {
    const root = await mkdtemp(join(tmpdir(), 'motus-title-'));
    try {
        const prior = join(root, '2026-10-27', 'us');
        await mkdir(prior, { recursive: true });
        await writeFile(join(prior, 'live-unit.json'), JSON.stringify({ title: 'Nasdaq 상승, 미국 주요 지수 동반 상승' }));
        await appendPublishLedger(prior, { identity: '2026-10-27|US_MARKET', operationDate: '2026-10-27', category: 'US_MARKET', at: '2026-10-27T00:00:00Z', event: 'PUBLISHED', postId: '1', publicPostUrl: 'https://motusnova.blogspot.com/2026/10/nasdaq.html', fingerprint: 'sha256:x', detail: 'AUTO_POLICY_APPROVAL' });
        const held = join(root, '2026-10-26', 'us');
        await mkdir(held, { recursive: true });
        await writeFile(join(held, 'live-unit.json'), JSON.stringify({ title: '나스닥 0.40% 상승, 미국 3대 지수 혼조' }));
        assert.deepEqual(await findPublishedTitle(root, 'us', '2026-10-28', 'Nasdaq 상승,  미국 주요 지수 동반 상승'), { operationDate: '2026-10-27', publicPostUrl: 'https://motusnova.blogspot.com/2026/10/nasdaq.html' });
        assert.equal(await findPublishedTitle(root, 'us', '2026-10-28', '나스닥 0.40% 상승, 미국 3대 지수 혼조'), null, 'an unpublished (HOLD) title never blocks');
        assert.equal(await findPublishedTitle(root, 'us', '2026-10-27', 'Nasdaq 상승, 미국 주요 지수 동반 상승'), null, 'the same operation date is a re-run, handled by the ledger');
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('Goldman insight dates do not depend on the runner time zone', async () => {
    const html = '<a href="/insights/articles/bond-market-outlook"><div>Markets</div><h3>Bond market outlook for investors</h3><div>Oct 6, 2026</div></a>';
    const previous = process.env.TZ;
    try {
        for (const zone of ['UTC', 'Asia/Seoul', 'America/New_York']) {
            process.env.TZ = zone;
            const result = await collectGoldmanBrokerResearch('2026-10-28T14:00:00Z', (async () => new Response(html)));
            assert.equal(result.entries[0]?.publishedAt, '2026-10-06T00:00:00.000Z', zone);
        }
    }
    finally {
        if (previous === undefined)
            delete process.env.TZ;
        else
            process.env.TZ = previous;
    }
});
test('a later simulation never overwrites a recorded publication outcome (10/29 U.S. case)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'motus-outcome-'));
    try {
        assert.equal(await outcomeFileFor(root, 'HOLD'), 'auto-publish.json', 'no publication yet: normal outcome file');
        await appendPublishLedger(root, { identity: '2026-10-29|US_MARKET', operationDate: '2026-10-29', category: 'US_MARKET', at: '2026-10-29T11:01:00Z', event: 'PUBLISHED', postId: '1', publicPostUrl: 'https://motusnova.blogspot.com/2026/10/s-500.html', fingerprint: 'sha256:x', detail: 'AUTO_POLICY_APPROVAL' });
        assert.equal(await outcomeFileFor(root, 'HOLD'), 'auto-publish-latest-run.json');
        assert.equal(await outcomeFileFor(root, 'AUTO_PUBLISH_READY'), 'auto-publish-latest-run.json');
        assert.equal(await outcomeFileFor(root, 'PUBLISHED'), 'auto-publish.json');
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
