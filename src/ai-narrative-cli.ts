/**
 * Shadow narrative for the day's AI article: reads the article's live-unit.json, asks the Claude CLI for a narrative
 * over the verified fact bundle, validates it and renders a preview. Writes only narrative files next to the unit;
 * the article that is published is untouched. Always exits 0 (warnings only), so it can never stop publication.
 */
import {existsSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {AIIntelligenceDailyViewModel} from './intelligence/daily-masters.js';
import {buildAIFactBundle,generateNarrative,NARRATIVE_DISCLAIMER} from './narrative/ai-narrative.js';
import {claudeCliProvider} from './narrative/claude-cli-provider.js';
import {renderAINarrativeArticle} from './publishers/editorial-article.js';
import {evaluateEditorialQuality} from './production/editorial-quality.js';

const arg=(name:string)=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined};
const date=arg('--date');if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)){console.error('usage: ai-narrative-cli --date YYYY-MM-DD');process.exit(2)}
const dir=join(process.cwd(),'data','operations',date,'ai'),unitPath=join(dir,'live-unit.json');
const write=(name:string,value:unknown)=>writeFile(join(dir,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n','utf8');
const warn=(text:string)=>console.log(`::warning title=AI narrative (shadow)::${text}`);
try{
  if(!existsSync(unitPath)){warn('no live-unit.json; nothing to narrate');process.exit(0)}
  const unit=JSON.parse(await readFile(unitPath,'utf8')) as {category?:string;viewModel?:AIIntelligenceDailyViewModel};
  if(unit.category!=='AI_INTELLIGENCE'||!unit.viewModel){warn('unit has no AI view model (SKIP/HOLD run)');process.exit(0)}
  const bundle=buildAIFactBundle(unit.viewModel);await write('ai-fact-bundle.json',bundle);
  const {outcome,narrative,rejected}=await generateNarrative(bundle,claudeCliProvider({token:process.env.CLAUDE_CODE_OAUTH_TOKEN,...(process.env.MOTUS_NARRATIVE_MODEL?{model:process.env.MOTUS_NARRATIVE_MODEL}:{}),timeoutMs:240000}));
  let quality:{pass:boolean;reasons:string[]}|null=null;
  if(narrative){
    try{const render=renderAINarrativeArticle(unit.viewModel,narrative,NARRATIVE_DISCLAIMER),result=evaluateEditorialQuality(unit.viewModel.title,render.html);quality={pass:result.pass,reasons:result.reasons};await write('ai-narrative.json',narrative);await write('narrative-preview.html',render.html);if(!result.pass){outcome.status='REJECTED';outcome.reason=`NARRATIVE_INVALID:EDITORIAL_QUALITY`;outcome.errors=result.reasons}}
    catch(error){outcome.status='REJECTED';outcome.reason='NARRATIVE_INVALID:RENDER';outcome.errors=[String(error instanceof Error?error.message:error).slice(0,300)]}
  }
  if(rejected!==null)await write('ai-narrative-rejected.json',rejected);
  await write('narrative-outcome.json',{...outcome,editorialQuality:quality});
  console.log(JSON.stringify({date,status:outcome.status,reason:outcome.reason,attempts:outcome.attempts,errors:outcome.errors.slice(0,10)}));
  if(outcome.status!=='VALID')warn(`${outcome.status} ${outcome.reason??''}`);
}catch(error){warn(`unexpected: ${String(error instanceof Error?error.message:error).slice(0,200)}`)}
process.exit(0);
