import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRecordConsistency, renderConsistencyReport } from '../src/production/record-consistency.js';
import { appendPublishLedger } from '../src/production/publication-operation.js';
const url = (name) => `https://motusnova.blogspot.com/2026/10/${name}.html`;
async function publish(data, date, dir, category, post, session) {
    const root = join(data, 'operations', date, dir);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'live-unit.json'), JSON.stringify({ observedDate: session }));
    await appendPublishLedger(root, { identity: `${date}|${category}`, operationDate: date, category, at: date + 'T00:00:00Z', event: 'PUBLISHED', postId: post, publicPostUrl: url(post), fingerprint: 'sha256:' + post, detail: 'AUTO_POLICY_APPROVAL' });
}
test('a publication missing from Library, Weekly and Search is reported; registered ones are clean', async () => {
    const data = await mkdtemp(join(tmpdir(), 'motus-consistency-'));
    try {
        await publish(data, '2026-10-27', 'ai', 'AI_INTELLIGENCE', 'ok', '2026-10-27');
        await publish(data, '2026-10-28', 'ai', 'AI_INTELLIGENCE', 'gap', '2026-10-28');
        await mkdir(join(data, 'library', 'publications'), { recursive: true });
        await writeFile(join(data, 'library', 'publications', 'auto-publications.json'), JSON.stringify([{ publicPostUrl: url('ok') }]));
        await writeFile(join(data, 'operations', '2026-10-27', 'weekly-monthly-feed-auto.json'), JSON.stringify([{ publicPostUrl: url('ok') }]));
        await mkdir(join(data, 'search', '2026-10-27'), { recursive: true });
        await writeFile(join(data, 'search', '2026-10-27', 'auto-registrations.json'), JSON.stringify([{ publicPostUrl: url('ok') }]));
        const report = await checkRecordConsistency(data, '2026-10-30T00:00:00Z');
        assert.equal(report.publications, 2);
        assert.deepEqual(report.issues.map(issue => issue.kind).sort(), ['MISSING_LIBRARY', 'MISSING_SEARCH', 'MISSING_WEEKLY']);
        assert.ok(report.issues.every(issue => issue.urls[0] === url('gap')));
        assert.match(renderConsistencyReport(report), /문제 3건/);
    }
    finally {
        await rm(data, { recursive: true, force: true });
    }
});
test('the same market session published twice is reported, an AI day is not compared by session', async () => {
    const data = await mkdtemp(join(tmpdir(), 'motus-consistency-'));
    try {
        await publish(data, '2026-10-28', 'korea', 'KOREA_MARKET', 'k1', '2026-10-28');
        await publish(data, '2026-10-29', 'korea', 'KOREA_MARKET', 'k2', '2026-10-28');
        await publish(data, '2026-10-28', 'ai', 'AI_INTELLIGENCE', 'a1', '2026-10-28');
        await publish(data, '2026-10-29', 'ai', 'AI_INTELLIGENCE', 'a2', '2026-10-28');
        const kinds = (await checkRecordConsistency(data)).issues.filter(issue => !issue.kind.startsWith('MISSING_'));
        assert.deepEqual(kinds.map(issue => issue.kind), ['SESSION_PUBLISHED_TWICE']);
        assert.deepEqual(kinds[0].urls, [url('k1'), url('k2')]);
    }
    finally {
        await rm(data, { recursive: true, force: true });
    }
});
test('an empty tree reports nothing and never throws', async () => {
    const data = await mkdtemp(join(tmpdir(), 'motus-consistency-'));
    try {
        const report = await checkRecordConsistency(data);
        assert.equal(report.publications, 0);
        assert.match(renderConsistencyReport(report), /불일치 없음/);
    }
    finally {
        await rm(data, { recursive: true, force: true });
    }
});
