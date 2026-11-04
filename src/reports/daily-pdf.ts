/**
 * MOTUS daily briefing PDF (owner decision 2026-11-04: 루인's briefing infographic design, two A4 pages).
 *
 * Built only from the published unit's verified view model: index closes and changes, charted moves, broker report
 * cards and quotes exactly as composed for the article, and the article's own checkpoints. Figures in 루인's design
 * image were placeholders; nothing here is invented, and a box without real data is left out.
 */
import type {AIIntelligenceDailyViewModel,ArticleDeepSection,ArticleReportCard,KoreaMarketDailyViewModel,USMarketDailyViewModel} from '../intelligence/daily-masters.js';
import {barChart,lineChart} from './weekly-pdf.js';

type View=AIIntelligenceDailyViewModel|USMarketDailyViewModel|KoreaMarketDailyViewModel;
const NAVY='#0b1f3f',NAVY2='#13305e',GOLD='#f2c14e',RED='#d1242f',BLUE='#1f5fbf',GRAY='#5d6b7c',LINE='#d9e0e8',SOFT='#f3f6fa';
const esc=(value:unknown)=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const num=(value:number,digits=2)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
const signed=(value:number)=>{const r=Number(value.toFixed(2));return `${r>0?'▲ +':r<0?'▼ ':''}${r.toFixed(2)}%`};
const col=(value:number)=>{const r=Number(value.toFixed(2));return r>0?RED:r<0?BLUE:'#333'};
const day=(date:string)=>`${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;

export interface DailyRow {name:string;close:string|null;change:number}
/** Stock rows from the article's composed stock paragraphs ('X(SYM)은 251.20달러로 11.15% 급락했다', '검색 1위 X는 222,000원으로 3.06% 하락했다'). */
export function stockRows(view:View):DailyRow[] {
  const deep=view.deepSections??[],rows:DailyRow[]=[];
  for(const section of deep.filter(item=>/stocks/.test(item.key)))for(const p of section.paragraphs){
    const us=p.text.match(/^(.+?)\(([A-Z.]+)\)[은는] ([\d,.]+)달러로 ([\d.]+)% (상승|하락|급등|급락|보합)/),kr=p.text.match(/^검색 \d+위 (.+?)[은는] ([\d,]+)원으로 ([\d.]+)% (상승|하락|급등|급락|보합)/);
    if(us)rows.push({name:`${us[1]}(${us[2]})`,close:`$${us[3]}`,change:(/하락|급락/.test(us[5]!)?-1:1)*Number(us[4])});
    else if(kr)rows.push({name:kr[1]!,close:`${kr[2]}원`,change:(/하락|급락/.test(kr[4]!)?-1:1)*Number(kr[3])});
  }
  if(!rows.length)for(const section of deep.filter(item=>item.bars?.length&&/stocks/.test(item.key)))for(const bar of section.bars!)rows.push({name:bar.label,close:null,change:bar.value});
  // Units composed before sections carried bars: the '·'-joined list of the same figures ('엔비디아 -1.26% · …').
  if(!rows.length)for(const section of deep.filter(item=>/stocks/.test(item.key)))for(const p of section.paragraphs)if((p.text.match(/ · /g)??[]).length>=2)for(const part of p.text.split(' · ')){const match=part.match(/^(.*\S)\s+([+\-−]?\d+(?:\.\d+)?)%$/);if(match)rows.push({name:match[1]!,close:null,change:Number(match[2]!.replace('−','-'))})}
  return rows;
}
const reportCards=(view:View)=>(view.deepSections??[]).flatMap(section=>section.paragraphs.filter(p=>p.report).map(p=>({card:p.report!,text:p.text})));
const brokerQuotes=(view:View)=>(view.deepSections??[]).filter(section=>section.role==='broker'||/causes|issue|broker/.test(section.key)).flatMap(section=>section.paragraphs.filter(p=>!p.report&&/“/.test(p.text)&&!/^MOTUS 정리/.test(p.text)));

export interface DailyPdf {html:string;fileName:string}
export function buildDailyPdfHtml(view:View,category:'AI_INTELLIGENCE'|'US_MARKET'|'KOREA_MARKET',sessionLabel:string):DailyPdf {
  const deep=view.deepSections??[],kind=category==='AI_INTELLIGENCE'?'AI 산업':category==='US_MARKET'?'미국 증시':'국내 증시';
  const header=`<div class=band><div class=bandtop><div class=logo>MOTUS <span>Market Intelligence Report</span></div><div class=when>${esc(kind)} 브리핑<br><b>${esc(view.issueDate.replace(/-/g,'. '))}</b></div></div><div class=rule></div><h1>${esc(view.title).replace(/^(.*?)(…|,)/,'<em>$1</em>$2')}</h1><p class=lede>${esc(leadOf(view))}</p></div>`;
  // Box 1: today at a glance (real closes and changes only).
  const tiles:Array<{label:string;value:string;change:number|null}>=[];
  if(category==='US_MARKET'){const v=view as USMarketDailyViewModel,names:Record<string,string>={sp500:'S&P 500',nasdaq:'나스닥','dow-jones':'다우존스'};for(const series of v.marketHistory.series.filter(item=>names[item.key]))tiles.push({label:names[series.key]!,value:num(series.latestClose),change:series.latestChangePct})}
  if(category==='KOREA_MARKET'){const v=view as KoreaMarketDailyViewModel,facts=(v.narrative?.facts??[]).join(' ');const all=[...v.indexMetrics,...v.fxAndSupporting],pick=[all.find(m=>/KOSPI/i.test(m.label)),all.find(m=>/KOSDAQ/i.test(m.label)),all.find(m=>m.group==='FX'||/USD\/KRW|원·달러/i.test(m.label))];for(const metric of pick){if(!metric)continue;const name=/KOSPI/i.test(metric.label)?'코스피':/KOSDAQ/i.test(metric.label)?'코스닥':null,match=name?facts.match(new RegExp(`${name}(?:은|는) [\\d,.]+(?:으로|로) 마감해 전 거래일보다 ([\\d.]+)% (상승|하락)`)):null;tiles.push({label:name??'원·달러',value:metric.displayValue,change:match?(match[2]==='상승'?1:-1)*Number(match[1]):null})}}
  const rows=stockRows(view);
  if(category==='AI_INTELLIGENCE'&&rows.length>=3){const up=rows.filter(row=>row.change>0.005).length,sorted=[...rows].sort((a,b)=>b.change-a.change);tiles.push({label:'상승 종목',value:`${up} / ${rows.length}`,change:null},{label:'최강 '+sorted[0]!.name.split(' ')[0],value:'',change:sorted[0]!.change},{label:'최약 '+sorted.at(-1)!.name.split(' ')[0],value:'',change:sorted.at(-1)!.change})}
  const glance=tiles.length?box('오늘의 시장 한눈에 보기',`<div class=tiles>${tiles.map(tile=>`<div class=tile><div class=tl>${esc(tile.label)}</div>${tile.value?`<div class=tv>${esc(tile.value)}</div>`:''}${tile.change!==null&&Number.isFinite(tile.change)?`<div class=tc style="color:${col(tile.change)}">${signed(tile.change)}</div>`:''}</div>`).join('')}</div>`):'';
  // Box 2: charted moves (sectors, search-top or AI bellwethers).
  const bars=deep.find(section=>section.bars?.length)?.bars??(category==='AI_INTELLIGENCE'?rows.map(row=>({label:row.name,value:row.change})):[]),barTitle=category==='US_MARKET'?'업종별 등락률 (SPDR 섹터 ETF)':category==='KOREA_MARKET'?'검색 상위 종목 등락률':'AI 대표 종목 등락률';
  const barsBox=bars.length>=2?box(barTitle,barChart(bars.map(bar=>[bar.label.length>9?bar.label.slice(0,9)+'…':bar.label,bar.value] as [string,number]),300,Math.max(120,bars.length*19+10))):'';
  // Box 3: stock table; box 4: index trend (US/Korea history).
  const table=rows.length?box('주요 종목 동향 (종가 기준)',`<table class=t><thead><tr><th>종목</th>${rows.some(row=>row.close)?'<th class=r>종가</th>':''}<th class=r>등락률</th></tr></thead><tbody>${rows.slice(0,7).map(row=>`<tr><td>${esc(row.name)}</td>${rows.some(item=>item.close)?`<td class=r>${esc(row.close??'-')}</td>`:''}<td class=r style="color:${col(row.change)};font-weight:800">${signed(row.change)}</td></tr>`).join('')}</tbody></table>`):'';
  const history=(view as USMarketDailyViewModel).marketHistory,lead=history?.series?.[category==='US_MARKET'?1:0];
  const trend=lead&&lead.closes.length>=5?box(`${lead.key==='nasdaq'?'나스닥':lead.label} 지수 추이 (최근 ${Math.min(20,lead.closes.length)}거래일)`,lineChart(lead.dates.slice(-20).map((date,index)=>({date,close:lead.closes.slice(-20)[index]!})),lead.dates.slice(-1)[0]!,NAVY2,value=>num(value,0),300,130)):'';
  // Box 5: today's issues (official announcements for AI; broker comments for the markets).
  const issues=category==='AI_INTELLIGENCE'?(view as AIIntelligenceDailyViewModel).issues.slice(0,3).map(issue=>({head:issue.headline,body:issue.whatHappened[0]??issue.coreContent})):brokerQuotes(view).slice(0,3).map(p=>({head:(p.text.match(/^(\S+?)[은는] /)?.[1]??'증권가')+' 시각',body:p.text.match(/“([^”]+)”/)?.[1]??p.text}));
  const issueBox=issues.length?box(category==='AI_INTELLIGENCE'?'시장 핵심 이슈 (공식 발표)':'시장 핵심 이슈 (증권가 진단)',issues.map(item=>`<div class=issue><div class=ih>${esc(item.head)}</div><div class=ib>${esc(clip(item.body,150))}</div></div>`).join('')):'';
  const analysis=(view as USMarketDailyViewModel).narrative?.analysis?.[0];
  const motus=analysis?`<div class=motus><div class=ml>MOTUS 분석</div><div class=mt>${esc(analysis)}</div></div>`:'';
  // Page 2: broker report table with rating boxes, quotes, index comparison, checkpoints.
  const cards=reportCards(view);
  const reportBox=cards.length?box('증권가 주요 리포트',`<table class=rep>${cards.slice(0,6).map(({card})=>`<tr><td class=rc><b>${esc(card.company??card.title)}</b><div>${esc(card.broker)}, ${esc(day(card.date))}</div></td><td class=rq>“${esc(card.title)}”</td><td class=rr>${card.rating||card.target?`<div class=rb><b>${esc(card.rating??'')}</b>${card.target?`<div>${esc(card.target)}원</div>`:''}</div>`:''}</td></tr>`).join('')}</table>`,'gold'):'';
  const quotes=brokerQuotes(view).slice(cards.length?0:3,cards.length?4:7);
  const quoteBox=quotes.length?box('증권가 시각 (원문 인용)',quotes.map(p=>`<div class=q><div class=qs>${esc(p.text.match(/^(\S+?)[은는] /)?.[1]??'')}</div>“${esc(clip(p.text.match(/“([^”]+)”/)?.[1]??p.text,170))}”</div>`).join(''),'gold'):'';
  const compare=history&&history.series.length>=2?box('주요 지수 비교 (최근 20거래일, 첫날=100)',multiLine(history.series.slice(0,4).map(series=>({label:series.key==='sp500'?'S&P 500':series.key==='nasdaq'?'나스닥':series.key==='dow-jones'?'다우':series.label,points:series.closes.slice(-20)})))):'';
  const watch=checkpoints(view);
  const watchBox=watch.length?box('향후 체크 포인트',watch.slice(0,4).map(item=>{const [head,...rest]=item.split(/:\s/);return `<div class=ck><span class=cb>✓</span><div><b>${esc(head!)}</b>${rest.length?`<div>${esc(clip(rest.join(': '),110))}</div>`:''}</div></div>`}).join(''),'red'):'';
  const sources=(view.sources??[]).slice(0,10).map(item=>esc(item.label)).join(' · ');
  const css=`@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans CJK KR","Noto Sans KR",sans-serif;color:#17212f;font-size:9pt;line-height:1.5}
.page{width:210mm;height:297mm;padding:0 0 9mm;position:relative;page-break-after:always;overflow:hidden;background:#fff}.page:last-child{page-break-after:auto}.in{padding:0 9mm}
.band{background:linear-gradient(135deg,${NAVY} 0%,${NAVY2} 70%,#1d4f8f 100%);color:#fff;padding:9mm 9mm 7mm}.bandtop{display:flex;justify-content:space-between;align-items:flex-start}.logo{font-size:20pt;font-weight:900;letter-spacing:1px}.logo span{font-size:9pt;font-weight:500;letter-spacing:0;margin-left:6px;color:#dbe6f5}
.when{text-align:right;font-size:8.5pt;color:#dbe6f5}.when b{color:#fff;font-size:10pt}.rule{height:3px;background:linear-gradient(90deg,#3d7bd9,#d1242f);margin:6px 0 9px}
h1{font-size:19pt;line-height:1.3;margin:0 0 6px;font-weight:900;word-break:keep-all}h1 em{font-style:normal;color:${GOLD}}.lede{margin:0;font-size:9.5pt;color:#e6eef8;line-height:1.55}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm}.grid2>*:only-child{grid-column:1/-1}.box{border:1px solid ${LINE};border-radius:6px;overflow:hidden;background:#fff}.bh{background:${NAVY};color:#fff;font-weight:800;font-size:10pt;padding:4px 10px}.bh.gold{background:linear-gradient(90deg,${NAVY},${NAVY2})}.bh.red{background:#7a1f2b}.bb{padding:6px 9px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.tile{background:${SOFT};border-radius:5px;padding:6px;text-align:center}.tl{font-weight:800;font-size:9.5pt}.tv{font-size:12.5pt;font-weight:900}.tc{font-size:11pt;font-weight:900}
.t{width:100%;border-collapse:collapse;font-size:8.6pt}.t th{text-align:left;color:${GRAY};font-weight:700;border-bottom:1px solid ${LINE};padding:2px 3px}.t td{border-bottom:1px solid #eef1f5;padding:3px}.r{text-align:right}
.issue{padding:4px 0;border-bottom:1px dashed ${LINE}}.issue:last-child{border:0}.ih{font-weight:900;font-size:10pt}.ib{color:#2c3a4b;font-size:8.6pt}
.motus{display:grid;grid-template-columns:30mm 1fr;margin-top:4mm;border-radius:6px;overflow:hidden;border:1px solid ${LINE}}.ml{background:${NAVY};color:#fff;font-weight:900;font-size:11pt;display:flex;align-items:center;justify-content:center;text-align:center}.mt{padding:7px 10px;font-size:9pt}
.rep{width:100%;border-collapse:collapse}.rep td{border-bottom:1px solid ${LINE};padding:5px 6px;vertical-align:middle}.rc{width:30%}.rc b{font-size:10.5pt}.rc div{color:${GRAY};font-size:8pt}.rq{font-weight:700;font-size:9pt}.rr{width:22mm}.rb{border:1.5px solid ${RED};border-radius:5px;text-align:center;color:${RED};padding:2px}.rb b{font-size:9.5pt}.rb div{font-weight:900;font-size:9pt}
.q{padding:5px 0;border-bottom:1px dashed ${LINE};font-size:8.8pt}.q:last-child{border:0}.qs{display:inline-block;background:${NAVY2};color:#fff;font-size:7.5pt;font-weight:700;padding:1px 6px;border-radius:3px;margin-right:5px}
.ck{display:flex;gap:7px;padding:4px 0}.cb{color:#7a1f2b;font-weight:900;font-size:12pt;line-height:1}.ck b{font-size:9.8pt}.ck div div{font-size:8.6pt;color:#2c3a4b}
.foot{position:absolute;left:9mm;right:9mm;bottom:4mm;border-top:1px solid ${LINE};padding-top:2px;font-size:6.8pt;color:${GRAY}}`;
  const p1=`<div class=page>${header}<div class=in><div class=grid2>${glance}${barsBox}</div><div class=grid2>${table}${trend||issueBox}</div>${trend?issueBox:''}${motus}</div><div class=foot>MOTUS Market Intelligence · ${esc(sessionLabel)} · 공개 자료 기반 참고 자료이며 투자 권유가 아닙니다.</div></div>`;
  const p2=`<div class=page><div class=in style="padding-top:8mm">${reportBox}${quoteBox?`<div style="margin-top:4mm">${quoteBox}</div>`:''}<div class=grid2>${compare||''}${watchBox}</div><div style="margin-top:4mm;font-size:7.4pt;color:${GRAY}"><b>자료</b> ${sources}</div><div style="margin-top:3mm;font-size:7.2pt;color:${GRAY};border:1px solid ${LINE};padding:5px 7px"><b>Compliance Notice</b> 본 자료는 MOTUS가 공개된 시장 데이터와 증권사 공개 리포트를 바탕으로 작성한 참고 자료로, 특정 종목의 매수·매도를 권유하지 않습니다. 증권사 문장은 원문 그대로 인용했으며 저작권은 해당 증권사에 있습니다.</div></div><div class=foot>MOTUS Market Intelligence · 2/2</div></div>`;
  return {html:`<!doctype html><html lang=ko><head><meta charset=utf-8><title>${esc(view.title)}</title><style>${css}</style></head><body>${p1}${p2}</body></html>`,fileName:`MOTUS_${category==='AI_INTELLIGENCE'?'AI':category==='US_MARKET'?'US':'Korea'}_Daily_${view.issueDate}.pdf`};
}
function box(title:string,body:string,tone?:'gold'|'red'){return `<div class=box><div class="bh${tone?' '+tone:''}">${esc(title)}</div><div class=bb>${body}</div></div>`}
function clip(value:string,max:number){const text=value.replace(/\s+/g,' ').trim();return text.length>max?text.slice(0,max-1)+'…':text}
function leadOf(view:View){const text=(view as AIIntelligenceDailyViewModel).todayCore?.summary??(view as USMarketDailyViewModel).marketSummary??'';return clip(text.split(/(?<=다\.)\s/).slice(0,2).join(' '),170)}
function checkpoints(view:View):string[] {
  const risks=(view.deepSections??[]).find((section:ArticleDeepSection)=>section.role==='watch'||/risks/.test(section.key));
  if(risks)return risks.paragraphs.map(p=>p.text);
  const watch=(view as AIIntelligenceDailyViewModel).whatToWatch??(view as USMarketDailyViewModel).checkpoints??[];
  return watch.map(item=>`${item.headline}: ${item.watchFor}`);
}
/** Several series rebased to 100 on the first point, one colour each, with the last value labelled. */
export function multiLine(series:Array<{label:string;points:number[]}>,width=300,height=150):string {
  const data=series.filter(item=>item.points.length>=2).map(item=>({label:item.label,points:item.points.map(value=>value/item.points[0]!*100)}));if(!data.length)return '';
  const colors=['#1f5fbf','#d1242f','#7b4fc4','#2e8b57'],all=data.flatMap(item=>item.points);let lo=Math.min(...all),hi=Math.max(...all);const pad=(hi-lo||1)*0.1;lo-=pad;hi+=pad;
  const L=26,R=48,T=16,B=12,n=Math.max(...data.map(item=>item.points.length)),X=(index:number)=>L+(width-L-R)*index/(n-1),Y=(value:number)=>T+(height-T-B)*(1-(value-lo)/(hi-lo));
  const out=[`<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">`];
  for(let k=0;k<4;k++){const value=lo+(hi-lo)*k/3,y=Y(value);out.push(`<line x1="${L}" x2="${width-R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e3e8ef" stroke-width="0.6"/><text x="2" y="${(y+3).toFixed(1)}" font-size="7" fill="${GRAY}">${value.toFixed(0)}</text>`)}
  data.forEach((item,index)=>{const color=colors[index%colors.length]!;out.push(`<path d="${item.points.map((value,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(value).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="1.5"/>`);const last=item.points.at(-1)!,change=last-100;out.push(`<rect x="${width-R+2}" y="${(Y(last)-6).toFixed(1)}" width="${R-3}" height="11" rx="2" fill="${color}"/><text x="${width-R+4}" y="${(Y(last)+2.5).toFixed(1)}" font-size="7" font-weight="700" fill="#fff">${change>=0?'+':''}${change.toFixed(1)}%</text>`);out.push(`<circle cx="${L+6+index*68}" cy="7" r="2.5" fill="${color}"/><text x="${L+11+index*68}" y="9.5" font-size="7.5" fill="#17212f">${esc(item.label)}</text>`)});
  out.push('</svg>');return out.join('');
}
export type {ArticleReportCard};
/** True when this workflow run is the one that published the article (ledger PUBLISHED attemptId === run id). */
export function publishedByRun(ledger:string,runId:string|undefined,postId:string):boolean {
  if(!runId)return false;
  return ledger.split('\n').filter(Boolean).some(line=>{try{const entry=JSON.parse(line) as {event?:string;attemptId?:string;postId?:string};return entry.event==='PUBLISHED'&&String(entry.attemptId)===runId&&(!entry.postId||entry.postId===postId)}catch{return false}});
}

/* ---- Combined daily report (owner decision 2026-11-04): Korea, US and AI in one PDF, published once a day. ---- */
export type DailyCategory='AI_INTELLIGENCE'|'US_MARKET'|'KOREA_MARKET';
export interface DailyReportPart {category:DailyCategory;view:View;sessionLabel:string}
export const DAILY_REPORT_ORDER:DailyCategory[]=['KOREA_MARKET','US_MARKET','AI_INTELLIGENCE'];
export const dailyKind=(category:DailyCategory)=>category==='AI_INTELLIGENCE'?'AI 산업':category==='US_MARKET'?'미국 증시':'국내 증시';
/** One A4 PDF: a cover page with each market's headline and figures, then each category's two-page briefing. */
export function buildCombinedDailyPdfHtml(parts:DailyReportPart[],date:string):DailyPdf&{pages:number} {
  const ordered=DAILY_REPORT_ORDER.flatMap(category=>parts.filter(part=>part.category===category));
  if(!ordered.length)throw new Error('DAILY_REPORT_WITHOUT_PARTS');
  const built=ordered.map(part=>({part,html:buildDailyPdfHtml(part.view,part.category,part.sessionLabel).html}));
  const css=built[0]!.html.match(/<style>([\s\S]*?)<\/style>/)![1]!;
  // The last tile closes as </div>(tc) </div>(tile) </div>(tiles): the first triple close ends the tile grid.
  const tilesOf=(html:string)=>html.match(/<div class=tiles>[\s\S]*?<\/div><\/div><\/div>/)?.[0]??'';
  const cards=built.map(({part,html})=>`<div class=box style="margin-top:4mm"><div class=bh>${esc(dailyKind(part.category))} · ${esc(part.sessionLabel)}</div><div class=bb><div style="font-size:13pt;font-weight:900;line-height:1.35;word-break:keep-all">${esc(part.view.title)}</div><p style="margin:3px 0 5px;color:#2c3a4b">${esc(leadOf(part.view))}</p>${tilesOf(html)}</div></div>`).join('');
  const cover=`<div class=page><div class=band><div class=bandtop><div class=logo>MOTUS <span>Daily Market &amp; AI Report</span></div><div class=when>데일리 리포트<br><b>${esc(date.replace(/-/g,'. '))}</b></div></div><div class=rule></div><h1><em>오늘의 시장</em>: ${esc(ordered.map(part=>dailyKind(part.category)).join(' · '))}</h1><p class=lede>${esc(ordered.map((part,index)=>`${index+2+index}쪽 ${dailyKind(part.category)}`).join(' / '))} — 각 시장의 수치·차트·증권가 리포트를 2쪽씩 정리했습니다.</p></div><div class=in>${cards}</div><div class=foot>MOTUS Market Intelligence · ${esc(date)} 데일리 리포트 · 공개 자료 기반 참고 자료이며 투자 권유가 아닙니다.</div></div>`;
  const bodies=built.map(({part,html})=>html.match(/<body>([\s\S]*)<\/body>/)![1]!.replace('MOTUS Market Intelligence · 2/2',`MOTUS Market Intelligence · ${esc(dailyKind(part.category))}`));
  return {html:`<!doctype html><html lang=ko><head><meta charset=utf-8><title>MOTUS 데일리 리포트 ${esc(date)}</title><style>${css}</style></head><body>${cover}${bodies.join('')}</body></html>`,fileName:`MOTUS_Daily_Report_${date}.pdf`,pages:1+2*ordered.length};
}
export {leadOf as dailyLead};
/** Categories a daily report waits for (owner decision 2026-11-04): Monday Korea + AI, Tuesday-Friday all three. */
export function expectedCategories(weekday:number):DailyCategory[] {return weekday===1?['KOREA_MARKET','AI_INTELLIGENCE']:weekday>=2&&weekday<=5?[...DAILY_REPORT_ORDER]:[]}
/** The article this operation date published (last PUBLISHED/REPUBLISHED ledger entry with a public URL). */
export function publishedArticle(ledger:string):{url:string;sessionDate:string|null;attemptId:string|null}|null {
  let found:{url:string;sessionDate:string|null;attemptId:string|null}|null=null;
  for(const line of ledger.split('\n').filter(Boolean)){try{const entry=JSON.parse(line) as {event?:string;publicPostUrl?:string|null;sessionDate?:string;attemptId?:string};if((entry.event==='PUBLISHED'||entry.event==='REPUBLISHED')&&entry.publicPostUrl)found={url:entry.publicPostUrl,sessionDate:entry.sessionDate??null,attemptId:entry.attemptId?String(entry.attemptId):null}}catch{/* skip */}}
  return found;
}
/** A rebuilt live-unit.json stands in for the missing snapshot only when it cannot differ from the published one:
 * market categories when it is the same session (the session's closes are fixed), AI only when no other run of
 * that category came after the publishing run (a later AI run can pick other announcements). */
export function liveUnitUsable(category:DailyCategory,unitSession:string|undefined,published:{sessionDate:string|null;attemptId:string|null},runs:string):boolean {
  if(!published.sessionDate||unitSession!==published.sessionDate)return false;
  if(category!=='AI_INTELLIGENCE')return true;
  const ids=runs.split('\n').filter(Boolean).flatMap(line=>{try{return [String((JSON.parse(line) as {runId?:string}).runId)]}catch{return []}});
  return Boolean(published.attemptId)&&ids.at(-1)===published.attemptId;
}
