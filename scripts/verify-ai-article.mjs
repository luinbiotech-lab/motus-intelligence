// Temporary runner check: builds today's AI unit (no publication) and prints each item's stated facts next to
// the official text they were read from, so accuracy can be audited by a reviewer.
import {RepositoryInternalDailyBuilder} from '../dist/src/operations/internal-live-daily.js';
import {pageBodyText} from '../dist/src/operations/ai-sources.js';
import {evaluateEditorialQuality} from '../dist/src/production/editorial-quality.js';
const at=new Date().toISOString(),result=await new RepositoryInternalDailyBuilder(fetch,{},undefined,undefined,undefined,'/tmp/no-ops').build('AI_INTELLIGENCE',at);
console.log(`::notice title=state::${result.state} ${result.reason??''}`);
if(result.payload){const unit=result.payload.unit,quality=evaluateEditorialQuality(unit.title,unit.render.html);
 console.log(`::notice title=article::${unit.title} | len=${quality.visibleText.length} blocks=${quality.proseBlockCount} pass=${quality.pass} ${quality.reasons.join(';')}`);
 for(const issue of unit.viewModel.issues){const url=issue.evidenceRefs[0];let excerpt='';
  try{const html=await (await fetch(url,{headers:{'user-agent':'MOTUS-Internal-Collector/1.0'}})).text();const meta=html.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["']/i)?.[1]??'';excerpt=`${meta} || ${pageBodyText(html)}`.slice(0,1500)}catch(e){excerpt='FETCH '+e.message}
  console.log(`::notice title=${issue.headline.replace(/[:,]/g,' ')}::URL ${url} || FACTS ${issue.whatHappened.join(' ')} || ANALYSIS ${issue.whyItMatters} || SOURCE ${excerpt.replace(/\s+/g,' ')}`);}
}
for(const entry of result.audit.filter(e=>e.status==='FAILED'||e.sourceId.startsWith('ai:rss'))) console.log(`audit ${entry.sourceId} ${entry.status} ${entry.error??''} ${entry.url}`);
