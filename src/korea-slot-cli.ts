/**
 * Prints the operation date (ops-data folder and ledger slot) a Korea run must use (MOT-040): the requested date in
 * the morning, the next trading day for the same-day evening edition. Usage: node dist/src/korea-slot-cli.js --date D [--at ISO]
 */
import {koreaPublicationSlot} from './operations/internal-live-daily.js';
const args=process.argv.slice(2),value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined};
const date=value('--date')??'',at=value('--at')??new Date().toISOString();
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('--date YYYY-MM-DD required');
const slot=koreaPublicationSlot(at,date);
console.error(JSON.stringify({requestedDate:date,at,...slot}));
console.log(slot.slotDate);
