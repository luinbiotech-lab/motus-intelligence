/**
 * Naver blog summary. `--date D` writes the operation date's summary (data/daily-report/<D>/naver-summary.md).
 * `--evening` (owner 2026-11-13) writes the post to hand over right after the Korea close article: the newest Korea
 * close plus the U.S./AI articles already public at that moment, to data/daily-report/<D>/naver-evening.md and the fixed
 * copies naver-latest.md / naver-latest.txt (phone copy text). Reads only the hydrated published units; no blog call.
 */
import {existsSync,readdirSync} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {buildNaverSummary,extractArticleFacts,phoneText,selectEveningParts,type PublishedCandidate} from './reports/naver-summary.js';

async function readUnit(date:string,category:'korea'|'us'|'ai'):Promise<PublishedCandidate|null>{
  const dir=join('data','operations',date,category),unitPath=join(dir,'published-unit.json'),publishPath=join(dir,'auto-publish.json');
  if(!existsSync(unitPath)||!existsSync(publishPath))return null;
  const unit=JSON.parse(await readFile(unitPath,'utf8')) as {title:string;render:{html:string};viewModel:{heroImage?:{url:string};checkpoints?:Array<{headline:string;watchFor:string}>;deepSections?:Array<{key:string;bars?:Array<{label:string}>}>}};
  const registration=(JSON.parse(await readFile(publishPath,'utf8')) as {searchRegistration?:{publicPostUrl?:string;registeredAt?:string}}).searchRegistration,url=registration?.publicPostUrl??'';
  if(!/^https:\/\/motusnova\.blogspot\.com\//.test(url))return null;
  const facts=extractArticleFacts(unit.render.html),check=unit.viewModel.checkpoints?.[0];
  return {operationDate:date,registeredAt:registration?.registeredAt??'',category,title:unit.title,url,keyPoints:facts.keyPoints,synthesis:facts.synthesis,checkpoint:check?check.watchFor:null,heroImageUrl:unit.viewModel.heroImage?.url??null,topStock:category==='korea'?unit.viewModel.deepSections?.find(s=>s.key==='korea-stocks')?.bars?.[0]?.label??null:category==='ai'?unit.title.match(/^([^\s…]+?)(?:이|가|은|는|의)?(?=[\s…])/)?.[1]??null:null};
}
const CATEGORIES=['korea','us','ai'] as const;
const args=process.argv.slice(2);
if(args.includes('--evening')){
  const root=join('data','operations'),dates=existsSync(root)?readdirSync(root).filter(name=>/^\d{4}-\d{2}-\d{2}$/.test(name)):[];
  const units:PublishedCandidate[]=[];
  for(const date of dates)for(const category of CATEGORIES){const unit=await readUnit(date,category);if(unit)units.push(unit)}
  const selected=selectEveningParts(units);
  if(!selected)throw new Error('no published Korea close article');
  const summary=buildNaverSummary(selected.anchor.operationDate,selected.parts);
  await mkdir(join('data','daily-report',selected.anchor.operationDate),{recursive:true});
  await writeFile(join('data','daily-report',selected.anchor.operationDate,'naver-evening.md'),summary.markdown,'utf8');
  await writeFile(join('data','daily-report','naver-latest.md'),summary.markdown,'utf8');
  await writeFile(join('data','daily-report','naver-latest.txt'),phoneText(summary),'utf8');
  console.log(`NAVER_EVENING ${selected.anchor.operationDate} ${selected.parts.map(part=>part.category+'@'+part.registeredAt).join(' ')} ${summary.body.length} chars`);
}else{
  const date=args[args.indexOf('--date')+1]??'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('--date YYYY-MM-DD or --evening required');
  const parts:PublishedCandidate[]=[];
  for(const category of CATEGORIES){const unit=await readUnit(date,category);if(unit)parts.push(unit)}
  const summary=buildNaverSummary(date,parts);
  await mkdir(join('data','daily-report',date),{recursive:true});
  await writeFile(join('data','daily-report',date,'naver-summary.md'),summary.markdown,'utf8');
  console.log(`NAVER_SUMMARY ${date} ${parts.length} categories, ${summary.body.length} chars`);
}
