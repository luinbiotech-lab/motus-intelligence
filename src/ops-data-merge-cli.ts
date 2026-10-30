import {readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {mergeBundleIntoOpsData} from './production/ops-data-merge.js';
import {buildDailyStatus} from './production/run-record.js';

const [bundleRoot,opsDataRoot]=process.argv.slice(2);
if(!bundleRoot||!opsDataRoot){console.error('usage: ops-data-merge-cli <persistence-bundle-dir> <ops-data/data-dir>');process.exit(2)}
const summary=await mergeBundleIntoOpsData(bundleRoot,opsDataRoot);
// Rebuild the one-glance status from the merged tree: runs that persist in parallel each saw only their own outcome.
const dates=await operationDates(bundleRoot),rebuilt:string[]=[];
for(const date of dates){try{await writeFile(join(opsDataRoot,'operations',date,'daily-status.md'),await buildDailyStatus(join(opsDataRoot,'operations'),date,new Date().toISOString()),'utf8');rebuilt.push(date)}catch(error){console.log('::warning title=Daily status not rebuilt::'+date+' '+(error instanceof Error?error.message:String(error)))}}
console.log(JSON.stringify({...summary,dailyStatusRebuilt:rebuilt}));

async function operationDates(root:string):Promise<string[]> {try{return (await readdir(join(root,'operations'))).filter(name=>/^\d{4}-\d{2}-\d{2}$/.test(name))}catch{return []}}
