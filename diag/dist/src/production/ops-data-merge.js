import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
/**
 * Merges a run's persistence bundle into the durable ops-data tree without ever losing
 * previously persisted state. Ledgers (*.jsonl) are unioned line by line, registries
 * (JSON arrays of records) are unioned by a stable record key, and everything else is
 * replaced by the incoming file. A stale or partially hydrated runner therefore cannot
 * shrink the publish ledger or the Library/Search registrations.
 */
export function mergeJsonl(existing, incoming) {
    const seen = new Set(), lines = [];
    for (const line of [...existing.split(/\r?\n/), ...incoming.split(/\r?\n/)]) {
        const value = line.trim();
        if (!value || seen.has(value))
            continue;
        seen.add(value);
        lines.push(value);
    }
    return lines.length ? lines.join('\n') + '\n' : '';
}
export function recordKey(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value;
        for (const field of ['idempotencyKey', 'publicationId', 'canonicalId'])
            if (typeof record[field] === 'string' && record[field])
                return field + ':' + String(record[field]);
    }
    return 'json:' + JSON.stringify(value);
}
export function mergeRegistry(existing, incoming) {
    if (!Array.isArray(existing) || !Array.isArray(incoming))
        return incoming;
    const merged = new Map();
    for (const item of existing)
        merged.set(recordKey(item), item);
    for (const item of incoming)
        merged.set(recordKey(item), item);
    return [...merged.values()];
}
export async function mergeBundleIntoOpsData(bundleRoot, opsDataRoot) {
    const summary = { written: 0, mergedLedgers: 0, mergedRegistries: 0, unchanged: 0 };
    for (const file of await listFiles(bundleRoot)) {
        const rel = relative(bundleRoot, file);
        if (rel.split(/[\\/]/).includes('.publish-lock'))
            continue;
        const target = join(opsDataRoot, rel), incoming = await readFile(file, 'utf8'), existing = await readOptional(target);
        let output = incoming;
        if (existing !== null && file.endsWith('.jsonl')) {
            output = mergeJsonl(existing, incoming);
            summary.mergedLedgers++;
        }
        else if (existing !== null && file.endsWith('.json')) {
            const before = parseJson(existing), after = parseJson(incoming);
            if (Array.isArray(before) && Array.isArray(after)) {
                output = JSON.stringify(mergeRegistry(before, after), null, 2) + '\n';
                summary.mergedRegistries++;
            }
        }
        if (existing === output) {
            summary.unchanged++;
            continue;
        }
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, output, 'utf8');
        summary.written++;
    }
    return summary;
}
async function listFiles(root) {
    const out = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory())
            out.push(...await listFiles(path));
        else if (entry.isFile())
            out.push(path);
    }
    return out.sort();
}
async function readOptional(path) { try {
    return await readFile(path, 'utf8');
}
catch {
    return null;
} }
function parseJson(text) { try {
    return JSON.parse(text);
}
catch {
    return undefined;
} }
