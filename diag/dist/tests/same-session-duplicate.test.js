import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendPublishLedger, findPublishedSameSession, readPublishLedger } from '../src/production/publication-operation.js';
test('ledger guard finds a published operation covering the same session under another operation date', async () => {
    const root = await mkdtemp(join(tmpdir(), 'motus-ledger-'));
    try {
        const legacy = join(root, '2026-10-19', 'korea');
        await mkdir(legacy, { recursive: true });
        await writeFile(join(legacy, 'live-unit.json'), JSON.stringify({ observedDate: '2026-10-19', contentFingerprint: 'x' }), 'utf8');
        await appendPublishLedger(legacy, { identity: '2026-10-19|KOREA_MARKET', operationDate: '2026-10-19', category: 'KOREA_MARKET', at: '2026-10-19T14:01:51Z', event: 'PUBLISHED', postId: 'p1', publicPostUrl: 'https://motusnova.blogspot.com/2026/10/kbi.html', fingerprint: 'sha256:x', detail: 'legacy entry without sessionDate' });
        const legacyEntries = await readPublishLedger(legacy);
        assert.equal(legacyEntries[0]?.sessionDate, undefined);
        const hit = await findPublishedSameSession(root, 'korea', 'KOREA_MARKET', '2026-10-19');
        assert.deepEqual(hit, { operationDate: '2026-10-19', postId: 'p1', publicPostUrl: 'https://motusnova.blogspot.com/2026/10/kbi.html' });
        assert.equal(await findPublishedSameSession(root, 'korea', 'KOREA_MARKET', '2026-10-20'), null);
        assert.equal(await findPublishedSameSession(root, 'us', 'US_MARKET', '2026-10-19'), null);
        // A legacy directory whose live unit was re-collected by a later rerun (different content) is not trusted.
        const rerun = join(root, '2026-10-20', 'korea');
        await mkdir(rerun, { recursive: true });
        await appendPublishLedger(rerun, { identity: '2026-10-20|KOREA_MARKET', operationDate: '2026-10-20', category: 'KOREA_MARKET', at: '2026-10-20T00:00:00Z', event: 'PUBLISHED', postId: 'p9', publicPostUrl: 'https://motusnova.blogspot.com/2026/10/old.html', fingerprint: 'sha256:published-content', detail: 'legacy' });
        await writeFile(join(rerun, 'live-unit.json'), JSON.stringify({ observedDate: '2026-10-26', contentFingerprint: 'recollected-content' }), 'utf8');
        assert.equal(await findPublishedSameSession(root, 'korea', 'KOREA_MARKET', '2026-10-26'), null);
        // A rerun that overwrote live-unit.json with a newer session must still be caught through the recorded sessionDate.
        const modern = join(root, '2026-10-25', 'us');
        await mkdir(modern, { recursive: true });
        await appendPublishLedger(modern, { identity: '2026-10-25|US_MARKET', operationDate: '2026-10-25', sessionDate: '2026-10-23', category: 'US_MARKET', at: '2026-10-25T13:13:35Z', event: 'PUBLISHED', postId: 'p2', publicPostUrl: 'https://motusnova.blogspot.com/2026/10/dow-jones.html', fingerprint: 'sha256:y', detail: 'published' });
        await writeFile(join(modern, 'live-unit.json'), JSON.stringify({ observedDate: '2026-10-26' }), 'utf8');
        assert.equal((await findPublishedSameSession(root, 'us', 'US_MARKET', '2026-10-23'))?.postId, 'p2');
        assert.equal(await findPublishedSameSession(root, 'us', 'US_MARKET', '2026-10-26'), null);
        // Non-published attempts never count as a duplicate.
        const held = join(root, '2026-10-26', 'us');
        await mkdir(held, { recursive: true });
        await appendPublishLedger(held, { identity: '2026-10-26|US_MARKET', operationDate: '2026-10-26', sessionDate: '2026-10-26', category: 'US_MARKET', at: '2026-10-26T00:00:00Z', event: 'GATE_HOLD', postId: null, publicPostUrl: null, fingerprint: 'sha256:z', detail: 'hold' });
        assert.equal(await findPublishedSameSession(root, 'us', 'US_MARKET', '2026-10-26'), null);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('ledger guard tolerates a missing operations root', async () => {
    assert.equal(await findPublishedSameSession(join(tmpdir(), 'motus-missing-root-' + Date.now()), 'us', 'US_MARKET', '2026-10-23'), null);
});
