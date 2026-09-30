import { mkdir,writeFile } from 'node:fs/promises';
import { buildGoldenIntelligenceRehearsal,goldenRehearsalAudit,GOLDEN_INTELLIGENCE_DATE } from './intelligence/golden-rehearsal.js';

const output=`data/golden-intelligence/${GOLDEN_INTELLIGENCE_DATE}`;
const preview=buildGoldenIntelligenceRehearsal();
await mkdir(output,{recursive:true});
await Promise.all([
  writeFile(`${output}/blogger-preview.html`,preview.blogger.html,'utf8'),writeFile(`${output}/email-preview.html`,preview.email.html,'utf8'),writeFile(`${output}/a4-preview.html`,preview.a4.html,'utf8'),
  writeFile(`${output}/review-package.json`,JSON.stringify({audit:goldenRehearsalAudit(preview),newsletter:preview.newsletter,contentFingerprint:preview.contentFingerprint},null,2),'utf8')
]);
console.log(JSON.stringify(goldenRehearsalAudit(preview),null,2));
