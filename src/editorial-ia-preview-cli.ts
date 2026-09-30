import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { buildGoldenIntelligenceRehearsal,GOLDEN_INTELLIGENCE_DATE } from './intelligence/golden-rehearsal.js';
import { renderAIIntelligenceDaily,renderKoreaMarketDaily,renderUSMarketDaily,splitNewsletterIntoDailyMasters } from './intelligence/daily-masters.js';

const output=`data/golden-intelligence/${GOLDEN_INTELLIGENCE_DATE}/editorial-ia`;
const productionPath=`data/blogger/${GOLDEN_INTELLIGENCE_DATE}/newsletter-motus-${GOLDEN_INTELLIGENCE_DATE}-publication.json`;
const production=JSON.parse(await readFile(productionPath,'utf8')) as {draftPostId:string;publicPostUrl:string;status:string};
const preview=buildGoldenIntelligenceRehearsal();
const masters=splitNewsletterIntoDailyMasters(preview.newsletter);
const rendered={ai:renderAIIntelligenceDaily(masters.ai),us:renderUSMarketDaily(masters.us),korea:renderKoreaMarketDaily(masters.korea)};
await mkdir(output,{recursive:true});
await Promise.all([
  writeFile(`${output}/ai-daily-preview.html`,rendered.ai.html,'utf8'),
  writeFile(`${output}/us-market-daily-preview.html`,rendered.us.html,'utf8'),
  writeFile(`${output}/korea-market-daily-preview.html`,rendered.korea.html,'utf8'),
  writeFile(`${output}/side-by-side-regression.json`,JSON.stringify({
    issueDate:GOLDEN_INTELLIGENCE_DATE,sourceNewsletterId:preview.newsletter.newsletterId,
    existingProduction:{postId:production.draftPostId,state:production.status,publicPostUrl:production.publicPostUrl,patched:false},
    previews:{ai:{label:rendered.ai.label,sections:rendered.ai.renderedSections},us:{label:rendered.us.label,sections:rendered.us.renderedSections,chartCount:(rendered.us.html.match(/<svg class="index-line-chart"/g)??[]).length},korea:{label:rendered.korea.label,sections:rendered.korea.renderedSections,flowVisualization:rendered.korea.html.includes('data-visualization="korea-investor-flow"')}},
    externalActions:{bloggerPatch:false,bloggerInsert:false,publish:false},commerce:{enabled:false,publicBlock:false}
  },null,2),'utf8')
]);
console.log(JSON.stringify({output,existingProductionPostId:production.draftPostId,patched:false,previews:Object.fromEntries(Object.entries(rendered).map(([key,value])=>[key,value.renderedSections]))},null,2));
