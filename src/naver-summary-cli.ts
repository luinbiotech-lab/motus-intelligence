/**
 * Writes the day's Naver blog summary next to the daily report (data/daily-report/<date>/naver-summary.md) and the
 * fixed latest copy (data/daily-report/naver-latest.md). Reads only the hydrated published units; no blog call.
 */
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {buildNaverSummary,extractArticleFacts,type NaverSummaryPart} from './reports/naver-summary.js';

const args=process.argv.slice(2),date=args[args.indexOf('--date')+1]??'';
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('--date YYYY-MM-DD required');
const parts:NaverSummaryPart[]=[];
for(const category of ['korea','us','ai'] as const){
  const dir=join('data','operations',date,category),unitPath=join(dir,'published-unit.json'),publishPath=join(dir,'auto-publish.json');
  if(!existsSync(unitPath)||!existsSync(publishPath))continue;
  const unit=JSON.parse(await readFile(unitPath,'utf8')) as {title:string;render:{html:string};viewModel:{heroImage?:{url:string};checkpoints?:Array<{headline:string;watchFor:string}>;deepSections?:Array<{key:string;bars?:Array<{label:string}>}>}};
  const url=(JSON.parse(await readFile(publishPath,'utf8')) as {searchRegistration?:{publicPostUrl?:string}}).searchRegistration?.publicPostUrl??'';
  if(!/^https:\/\/motusnova\.blogspot\.com\//.test(url))continue;
  const facts=extractArticleFacts(unit.render.html),check=unit.viewModel.checkpoints?.[0];
  parts.push({category,title:unit.title,url,keyPoints:facts.keyPoints,synthesis:facts.synthesis,checkpoint:check?check.watchFor:null,heroImageUrl:unit.viewModel.heroImage?.url??null,topStock:category==='korea'?unit.viewModel.deepSections?.find(s=>s.key==='korea-stocks')?.bars?.[0]?.label??null:category==='ai'?unit.title.match(/^([^\s…]+)/)?.[1]??null:null});
}
const summary=buildNaverSummary(date,parts);
await mkdir(join('data','daily-report',date),{recursive:true});
await writeFile(join('data','daily-report',date,'naver-summary.md'),summary.markdown,'utf8');
await writeFile(join('data','daily-report','naver-latest.md'),summary.markdown,'utf8');
console.log(`NAVER_SUMMARY ${date} ${parts.length} categories, ${summary.body.length} chars`);
