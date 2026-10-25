import {mergeBundleIntoOpsData} from './production/ops-data-merge.js';

const [bundleRoot,opsDataRoot]=process.argv.slice(2);
if(!bundleRoot||!opsDataRoot){console.error('usage: ops-data-merge-cli <persistence-bundle-dir> <ops-data/data-dir>');process.exit(2)}
const summary=await mergeBundleIntoOpsData(bundleRoot,opsDataRoot);
console.log(JSON.stringify(summary));
