import {checkRecordConsistency,renderConsistencyReport} from './production/record-consistency.js';
// Read-only: prints the report for a data tree (default ./data, e.g. a checkout of the ops-data branch). Never writes.
const args=process.argv.slice(2),index=args.indexOf('--root'),root=index>=0?args[index+1]!:'data';
const report=await checkRecordConsistency(root);
console.log(args.includes('--json')?JSON.stringify(report,null,2):renderConsistencyReport(report));
