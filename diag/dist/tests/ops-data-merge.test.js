import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeBundleIntoOpsData, mergeJsonl, mergeRegistry } from '../src/production/ops-data-merge.js';
test('ledger merge keeps every persisted line and appends only new ones', () => {
    assert.equal(mergeJsonl('{"a":1}\n{"b":2}\n', '{"b":2}\n{"c":3}\n'), '{"a":1}\n{"b":2}\n{"c":3}\n');
    assert.equal(mergeJsonl('{"a":1}\n', ''), '{"a":1}\n');
});
test('registry merge never drops existing records and lets incoming update the same key', () => {
    const existing = [{ idempotencyKey: 'library:a', publishedAt: '1' }, { idempotencyKey: 'library:b', publishedAt: '2' }];
    const stale = [{ idempotencyKey: 'library:a', publishedAt: '1' }];
    assert.deepEqual(mergeRegistry(existing, stale), existing);
    const updated = [{ idempotencyKey: 'library:b', publishedAt: '3' }, { idempotencyKey: 'library:c', publishedAt: '4' }];
    assert.deepEqual(mergeRegistry(existing, updated), [{ idempotencyKey: 'library:a', publishedAt: '1' }, { idempotencyKey: 'library:b', publishedAt: '3' }, { idempotencyKey: 'library:c', publishedAt: '4' }]);
    assert.deepEqual(mergeRegistry({ state: 'old' }, { state: 'new' }), { state: 'new' });
});
test('bundle merge protects ops-data against a stale runner bundle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'motus-merge-'));
    try {
        const ops = join(root, 'ops'), bundle = join(root, 'bundle');
        await mkdir(join(ops, 'library', 'publications'), { recursive: true });
        await mkdir(join(ops, 'operations', '2026-10-25', 'us'), { recursive: true });
        await writeFile(join(ops, 'library', 'publications', 'auto-publications.json'), JSON.stringify([{ idempotencyKey: 'library:1' }, { idempotencyKey: 'library:2' }, { idempotencyKey: 'library:3' }]), 'utf8');
        await writeFile(join(ops, 'operations', '2026-10-25', 'us', 'publish-ledger.jsonl'), '{"event":"PUBLISHED"}\n', 'utf8');
        await mkdir(join(bundle, 'library', 'publications'), { recursive: true });
        await mkdir(join(bundle, 'operations', '2026-10-25', 'us', '.publish-lock'), { recursive: true });
        await mkdir(join(bundle, 'operations', '2026-10-26', 'korea'), { recursive: true });
        await writeFile(join(bundle, 'library', 'publications', 'auto-publications.json'), JSON.stringify([{ idempotencyKey: 'library:1' }, { idempotencyKey: 'library:4' }]), 'utf8');
        await writeFile(join(bundle, 'operations', '2026-10-25', 'us', 'publish-ledger.jsonl'), '{"event":"LOCK_ACQUIRED"}\n', 'utf8');
        await writeFile(join(bundle, 'operations', '2026-10-25', 'us', '.publish-lock', 'owner'), 'x', 'utf8');
        await writeFile(join(bundle, 'operations', '2026-10-26', 'korea', 'auto-publish.json'), '{"state":"PUBLISHED"}', 'utf8');
        const summary = await mergeBundleIntoOpsData(bundle, ops);
        assert.equal(summary.mergedLedgers, 1);
        assert.equal(summary.mergedRegistries, 1);
        const library = JSON.parse(await readFile(join(ops, 'library', 'publications', 'auto-publications.json'), 'utf8'));
        assert.deepEqual(library.map(item => item.idempotencyKey), ['library:1', 'library:2', 'library:3', 'library:4']);
        assert.equal(await readFile(join(ops, 'operations', '2026-10-25', 'us', 'publish-ledger.jsonl'), 'utf8'), '{"event":"PUBLISHED"}\n{"event":"LOCK_ACQUIRED"}\n');
        assert.equal(await readFile(join(ops, 'operations', '2026-10-26', 'korea', 'auto-publish.json'), 'utf8'), '{"state":"PUBLISHED"}');
        await assert.rejects(readFile(join(ops, 'operations', '2026-10-25', 'us', '.publish-lock', 'owner'), 'utf8'));
        assert.equal((await mergeBundleIntoOpsData(bundle, ops)).written, 0);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
