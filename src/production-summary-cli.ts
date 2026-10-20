import {appendFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {buildProductionSummary} from './production/production-summary.js';

const args=process.argv.slice(2),value=(name:string)=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined},date=value('--date')??'',category=value('--category')??'';
if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['ai','us','korea'].includes(category))throw new Error('--date and --category required');
const root=join(process.cwd(),'data','operations',date,category),live=await json('live-collection.json'),verification=await json('verification.json'),search=await json('search-intelligence.json'),publish=await json('auto-publish.json'),audit=await json('live-source-audit.json'),unit=await json('live-unit.json'),result=buildProductionSummary({category,operationDate:date,live,verification,search,publish,audit,unit});
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,result.markdown,'utf8');else console.log(result.markdown);
if(result.state==='FAILED')console.error(result.annotation);else if(result.state==='HOLD'||result.state==='SKIP')console.warn(result.annotation);else console.log(result.annotation);process.exitCode=result.exitCode;

async function json(name:string):Promise<Record<string,any>>{const path=join(root,name);if(!existsSync(path))return {};try{return JSON.parse(await readFile(path,'utf8')) as Record<string,any>}catch{return {}}}
