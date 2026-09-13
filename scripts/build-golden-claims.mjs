import { readFile, writeFile } from 'node:fs/promises';
import { runPipeline } from '../dist/src/services/pipeline.js';
import sources from '../config/sources.json' with { type: 'json' };
import rules from '../config/us-korea-rules.v1.json' with { type: 'json' };

const tradingDate = '2026-09-11';
const generatedAt = '2026-09-13T08:30:11Z';
const input = JSON.parse(await readFile(`data/manual/${tradingDate}/input-api.json`, 'utf8'));
const result = runPipeline(input, sources, rules, generatedAt);
if (result.operationalStatus !== 'PASS') throw new Error(`Golden claim run failed: ${result.operationalStatus}`);
await writeFile(`data/golden/${tradingDate}/claims.json`, `${JSON.stringify({
  tradingDate,
  reportId: result.report.reportId,
  approvalStatus: result.evidence.approvalStatus,
  claims: result.evidence.claims,
  conflicts: result.evidence.conflicts,
  reviewQueue: result.evidence.reviewQueue
}, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', claims: result.evidence.claims?.length ?? 0, conflicts: result.evidence.conflicts?.length ?? 0, approvalStatus: result.evidence.approvalStatus }, null, 2));
