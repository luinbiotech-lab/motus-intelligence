import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function readLibrary(root = 'data/library') { try {
    return JSON.parse(await readFile(join(root, 'library.json'), 'utf8'));
}
catch (error) {
    if (error.code === 'ENOENT')
        return null;
    throw error;
} }
export async function writeLibrary(root, store, operator) {
    const groups = { companies: store.records.filter(r => r.recordType === 'COMPANY'), themes: store.records.filter(r => r.recordType === 'THEME'), sectors: store.records.filter(r => r.recordType === 'SECTOR'), institutions: store.records.filter(r => r.recordType === 'INSTITUTION'), markets: store.records.filter(r => r.recordType === 'MARKET') };
    const files = { 'library.json': store, 'schema.json': { schemaVersion: store.schemaVersion, storage: 'LOCAL_JSON', migrationTarget: 'database-compatible normalized records and edges' }, 'operator-package.json': operator, 'registry/companies.json': groups.companies, 'registry/themes.json': groups.themes, 'registry/sectors.json': groups.sectors, 'registry/institutions.json': groups.institutions, 'registry/markets.json': groups.markets, 'events/events.json': store.records.filter(r => r.recordType === 'EVENT'), 'research/research.json': store.records.filter(r => r.recordType === 'RESEARCH'), 'relationships/edges.json': store.edges, 'history/themes.json': store.themeHistory, 'history/companies.json': store.companyHistory, 'evergreen/candidates.json': store.evergreenCandidates, 'publications/publications.json': store.records.filter(r => r.recordType === 'PUBLICATION'), 'sources/sources.json': store.records.filter(r => r.recordType === 'SOURCE'), 'artifacts/pdf-relations.json': store.pdfArtifacts, 'audit/decisions.json': store.decisions, 'audience/signals.json': store.audienceSignals };
    const written = [];
    for (const [relative, value] of Object.entries(files)) {
        const path = join(root, relative);
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        written.push(path);
    }
    return written;
}
