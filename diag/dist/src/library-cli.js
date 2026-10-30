import { buildCompanyProfile, buildInstitutionProfile, buildMarketProfile, buildThemeProfile, searchLibrary } from './library/content-library.js';
import { buildVerifiedProductionLibrary } from './library/production-library.js';
import { readLibrary, writeLibrary } from './library/storage.js';
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] ?? null : null; };
const generatedAt = '2026-10-02T09:00:00+09:00';
const built = buildVerifiedProductionLibrary(generatedAt);
const existing = await readLibrary();
const store = has('--ingest') ? built.store : existing ?? built.store;
const dryRun = has('--dry-run') || !has('--ingest');
if (has('--ingest') && !dryRun)
    await writeLibrary('data/library', store, built.operator);
let result = { mode: dryRun ? 'READ_ONLY_DRY_RUN' : 'INGEST', schemaVersion: store.schemaVersion, counts: built.operator.counts, externalActions: built.operator.externalActions, commerce: built.operator.commerce };
const search = value('--search');
const company = value('--company');
const theme = value('--theme');
const institution = value('--institution');
const market = value('--market');
const period = value('--period');
const date = value('--date');
if (search)
    result = searchLibrary(store, { text: search });
else if (company)
    result = buildCompanyProfile(store, company);
else if (theme)
    result = buildThemeProfile(store, theme);
else if (institution)
    result = buildInstitutionProfile(store, institution);
else if (market)
    result = buildMarketProfile(store, market);
else if (date)
    result = searchLibrary(store, { dateRange: { from: date, to: date } });
else if (period) {
    const [from, to] = period.split(':');
    result = searchLibrary(store, { dateRange: { from: from, to: to ?? from } });
}
else if (has('--evergreen'))
    result = store.evergreenCandidates;
else if (has('--audit'))
    result = { decisions: store.decisions, operator: built.operator };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
