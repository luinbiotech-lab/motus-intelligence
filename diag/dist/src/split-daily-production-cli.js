import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFirstSplitDailyProductionRun } from './intelligence/split-daily-production.js';
const run = createFirstSplitDailyProductionRun();
const root = join(process.cwd(), 'data', 'split-daily', '2026-09-30');
await mkdir(root, { recursive: true });
for (const unit of run.units) {
    const key = unit.category.toLowerCase().replaceAll('_', '-');
    await writeFile(join(root, `${key}-preview.html`), unit.render.html, 'utf8');
}
await writeFile(join(root, 'review-package.json'), JSON.stringify({ generatedAt: run.generatedAt, selectedDates: run.selectedDates, units: run.units.map(unit => ({ publicationId: unit.publicationId, category: unit.category, observedDate: unit.observedDate, title: unit.title, label: unit.label, sourceCount: unit.sourceCount, itemCount: unit.itemCount, readiness: unit.readiness, readinessReasons: unit.readinessReasons, humanReview: unit.review, publicationState: unit.publicationState, draftPostId: unit.draftPostId, publicPostUrl: unit.publicPostUrl, duplicateCount: unit.duplicateCount, contentFingerprint: unit.contentFingerprint, renderValidation: { mobileSafe: /max-width:100%/.test(unit.render.html), clickableSources: /<a href="https?:\/\//.test(unit.render.html), internalTokenLeak: /\b(?:intelligenceId|researchId|factId|eventId|themeId|verificationStatus)\b/.test(unit.render.html), script: /<script\b/i.test(unit.render.html) } })), externalActions: run.externalActions }, null, 2), 'utf8');
console.log(JSON.stringify({ outputRoot: root, selectedDates: run.selectedDates, units: run.units.map(unit => ({ category: unit.category, readiness: unit.readiness, humanReview: unit.review.state, draftPostId: unit.draftPostId })) }, null, 2));
