import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {buildFiveSessionMajorIndexHistory} from '../dist/src/services/market-history.js';
import {renderMarketTrendSection} from '../dist/src/publishers/motus.js';

const [publicationPath,sep11Path,sep15Path,sep16Path,outputBase]=process.argv.slice(2);
if(!publicationPath||!sep11Path||!sep15Path||!sep16Path||!outputBase) throw new Error('usage: publication 2026-09-11-input 2026-09-15-input 2026-09-16-input output-base');
const readJson=async path=>JSON.parse(await readFile(resolve(path),'utf8'));
const [publication,sep11,sep15,sep16]=await Promise.all([readJson(publicationPath),readJson(sep11Path),readJson(sep15Path),readJson(sep16Path)]);
if(publication.status!=='DRAFT'||publication.draftPostId!=='1299415515105343069'||publication.publicPostUrl!==null) throw new Error('unexpected publication target');
const history=buildFiveSessionMajorIndexHistory([sep11,sep15,sep16]);
const before=publication.html;
const chart=renderMarketTrendSection(history);
const block=/<section\b[^>]*data-section=["'](?:major-index-graph|major-index-trend)["'][^>]*>[\s\S]*?<\/section>/i;
if(!block.test(before)) throw new Error('existing market graph section not found');
const after=before.replace(block,chart);
const title=value=>(value.match(/<title>([\s\S]*?)<\/title>/i)?.[1]??'').trim();
const dashboard=value=>value.match(/<div\b[^>]*class=["'][^"']*market-dashboard[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0]??'';
const count=(value,pattern)=>(value.match(pattern)??[]).length;
const comparison={
  reportId:publication.reportId,tradingDate:publication.tradingDate,draftPostId:publication.draftPostId,
  bloggerApiCalled:false,newPostCreated:false,automaticPublishAttempted:false,titleUnchanged:title(before)===title(after),
  marketDataUnchanged:dashboard(before)===dashboard(after),oldBarChartRemoved:!/(?:major-index-chart|막대그래프|data-change=|당일 등락률 · 0% 기준)/i.test(after),
  lineChartCount:count(after,/<svg\b[^>]*class=["']index-line-chart["']/gi),fiveSessionSeriesCount:count(after,/data-values=["'][^"']+(?:,[^,"']+){4}["']/gi),
  twoByTwoLayout:/data-layout=["']two-by-two["']/.test(after)&&count(after,/class=["']index-trend-row["'][^>]*style=["'][^"']*display:flex!important[^"']*flex-wrap:nowrap!important/gi)===2&&count(after,/width:50%;max-width:50%/gi)===4&&count(after,/class=["']index-trend-card["']/gi)===4,
  mobileOverflowDisabled:!after.includes('overflow-x:auto')&&after.includes('max-width:100%')&&after.includes('box-sizing:border-box'),
  inlineSvgSafe:!/<script\b|javascript:|<foreignObject\b|<iframe\b|\son\w+\s*=/i.test(chart),
  provenance:history.series.map(series=>({key:series.key,sourceLabel:series.sourceLabel,sourceUrl:series.sourceUrl,points:series.provenance})),
  beforeSha256:createHash('sha256').update(before).digest('hex'),afterSha256:createHash('sha256').update(after).digest('hex')
};
if(!comparison.titleUnchanged||!comparison.marketDataUnchanged||!comparison.oldBarChartRemoved||comparison.lineChartCount!==4||comparison.fiveSessionSeriesCount!==4||!comparison.twoByTwoLayout||!comparison.mobileOverflowDisabled||!comparison.inlineSvgSafe) throw new Error('market trend preview verification failed');
const base=resolve(outputBase);
await mkdir(dirname(base),{recursive:true});
await Promise.all([
  writeFile(`${base}-before.html`,before),writeFile(`${base}-after.html`,after),
  writeFile(`${base}-preview.json`,JSON.stringify({title:publication.title,version:'2E.2.0-MARKET-TREND.1',...comparison},null,2)),
  writeFile(`${base}-provenance.json`,JSON.stringify(history,null,2))
]);
console.log(JSON.stringify(comparison,null,2));
