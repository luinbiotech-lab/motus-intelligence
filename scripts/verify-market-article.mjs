// Temporary runner check (no publication, no persistence): builds US and Korea units from live verified sources
// and prints the rendered visible text so editorial depth and accuracy can be reviewed.
import {RepositoryInternalDailyBuilder} from '../dist/src/operations/internal-live-daily.js';
import {evaluateEditorialQuality} from '../dist/src/production/editorial-quality.js';
import {buildProductionVerification} from '../dist/src/production/verification-artifact.js';
const now=Date.now(),cases=[['US_MARKET',new Date(now).toISOString()],['KOREA_MARKET',(()=>{const d=new Date(now+24*3600000);d.setUTCHours(21,20,0,0);if(d.getTime()-now>30*3600000)d.setUTCDate(d.getUTCDate()-1);return d.toISOString()})()]];
for(const [category,at] of cases){
 const result=await new RepositoryInternalDailyBuilder(fetch,process.env,undefined,undefined,undefined,'/tmp/no-ops').build(category,at);
 if(!result.payload){console.log(`::notice title=${category} state::${result.state} ${result.reason} at=${at}`);continue}
 const unit=result.payload.unit,quality=evaluateEditorialQuality(unit.title,unit.render.html),verification=buildProductionVerification(result.payload,'internal',result.audit,at);
 console.log(`::notice title=${category} summary::at=${at} ${unit.title} | len=${quality.visibleText.length} blocks=${quality.proseBlockCount} pass=${quality.pass} ${quality.reasons.join(';')} | verification=${verification.verification} ${verification.unresolvedConflicts.join(';')}`);
 const text=quality.visibleText;for(let i=0;i<text.length&&i<6000;i+=1800)console.log(`::notice title=${category} text ${i/1800+1}::${text.slice(i,i+1800)}`);
}
