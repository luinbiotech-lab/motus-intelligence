/**
 * MOTUS weekly PDF report ("주간 시장 전략"): the design approved by the owner on 2026-11-01
 * (docs/reports/samples/MOTUS_Weekly_2026-11-01.pdf): A4, three pages, broker-analyst layout, charts with the actual
 * index level printed on each line, red for up and blue for down, every figure numbered with its source.
 *
 * Everything printed is computed from the collected weekly evidence (closes, calendar, broker sentences quoted
 * verbatim); the summary sentences state measured facts only. Rendering to PDF is a separate step (pdf-render.ts).
 */
import {koreanDateLabel} from '../operations/broker-briefs.js';
import {josa} from '../operations/ai-generic-synthesis.js';
import {dayLabel,headlineEvents,joinEvents,weekRangeLabel,type WeeklyArticle,type WeeklyEvidence,type WeeklyQuote} from '../operations/weekly-review.js';

const NAVY='#0b2545',RED='#d1242f',BLUE='#1f5fbf',GRAY='#6b7785',LIGHT='#eef2f7',ACC='#c8a24a',SHADE='#f6efe0';
const esc=(value:unknown)=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const num=(value:number,digits=2)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
const pct=(value:number,digits=2)=>`${value>0?'+':value<0?'-':''}${Math.abs(value).toFixed(digits)}%`;
const col=(value:number)=>value>0?RED:value<0?BLUE:'#333';
const B=(value:number)=>`<b style="color:${col(value)}">${pct(value)}</b>`;
const WEEKDAY=['일','월','화','수','목','금','토'];
const weekday=(date:string)=>WEEKDAY[new Date(date+'T00:00:00Z').getUTCDay()]!;

type Point={date:string;close:number};
export function lineChart(points:Point[],weekStart:string,color:string,format:(value:number)=>string=value=>num(value),width=300,height=112):string {
  if(points.length<2)return '';
  const padL=6,padR=52,padT=8,padB=18,values=points.map(point=>point.close);let lo=Math.min(...values),hi=Math.max(...values);const span=hi-lo||1;lo-=span*0.08;hi+=span*0.08;
  const X=(index:number)=>padL+(width-padL-padR)*index/(points.length-1),Y=(value:number)=>padT+(height-padT-padB)*(1-(value-lo)/(hi-lo));
  const out=[`<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block">`];
  const first=points.findIndex(point=>point.date>=weekStart);
  if(first>=0){const x0=X(first)-(X(1)-X(0))/2;out.push(`<rect x="${x0.toFixed(1)}" y="${padT}" width="${(X(points.length-1)-x0).toFixed(1)}" height="${height-padT-padB}" fill="${SHADE}"/>`)}
  for(let k=0;k<5;k++){const value=lo+(hi-lo)*k/4,y=Y(value);out.push(`<line x1="${padL}" x2="${width-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e3e8ef" stroke-width="0.6"/><text x="${width-padR+4}" y="${(y+3).toFixed(1)}" font-size="7.5" fill="${GRAY}">${esc(format(value))}</text>`)}
  const months=new Set<string>();points.forEach((point,index)=>{const month=point.date.slice(5,7);if(!months.has(month)&&point.date.slice(8)<='07'){months.add(month);out.push(`<text x="${X(index).toFixed(1)}" y="${height-5}" font-size="7.5" fill="${GRAY}">${Number(month)}월</text>`)}});
  out.push(`<path d="${points.map((point,index)=>`${index?'L':'M'}${X(index).toFixed(1)},${Y(point.close).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>`);
  const lx=X(points.length-1),ly=Y(points.at(-1)!.close);
  out.push(`<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.4" fill="${color}"/><rect x="${width-padR+1}" y="${(ly-7).toFixed(1)}" width="${padR-2}" height="13" rx="2" fill="${color}"/><text x="${width-padR+4}" y="${(ly+2.6).toFixed(1)}" font-size="7.8" font-weight="700" fill="#fff">${esc(format(points.at(-1)!.close))}</text></svg>`);
  return out.join('');
}
export function barChart(rows:Array<[string,number]>,width=300,height=190):string {
  if(!rows.length)return '';
  const sorted=[...rows].sort((a,b)=>b[1]-a[1]),max=Math.max(...sorted.map(row=>Math.abs(row[1])))*1.25||1,mid=width*0.55,bar=(height-10)/sorted.length;
  const out=[`<svg viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg"><line x1="${mid}" x2="${mid}" y1="0" y2="${height}" stroke="#9aa6b2" stroke-width="0.6"/>`];
  sorted.forEach(([label,value],index)=>{const y=4+index*bar,length=width*0.42*Math.abs(value)/max,x=value>=0?mid:mid-length;
    out.push(`<rect x="${x.toFixed(1)}" y="${(y+2).toFixed(1)}" width="${length.toFixed(1)}" height="${(bar-5).toFixed(1)}" fill="${col(value)}" opacity="0.88"/><text x="${value>=0?mid-4:mid+4}" y="${(y+bar/2+2).toFixed(1)}" font-size="8" text-anchor="${value>=0?'end':'start'}" fill="#222">${esc(label)}</text><text x="${(value>=0?x+length+3:x-3).toFixed(1)}" y="${(y+bar/2+2).toFixed(1)}" font-size="8" font-weight="700" text-anchor="${value>=0?'start':'end'}" fill="${col(value)}">${pct(value)}</text>`)});
  out.push('</svg>');return out.join('');
}

const SECTORS:Record<string,string>={XLK:'기술',XLC:'커뮤니케이션',XLY:'경기소비재',XLF:'금융',XLV:'헬스케어',XLI:'산업재',XLE:'에너지',XLB:'소재',XLP:'필수소비재',XLU:'유틸리티',XLRE:'부동산'};
/** Week-over-week change from a chart series: last close in the week against the last close before it. */
export function seriesWeekChange(points:Point[]|undefined,weekStart:string,weekEnd:string):number|null {
  if(!points)return null;const last=points.filter(point=>point.date>=weekStart&&point.date<=weekEnd).at(-1),prior=points.filter(point=>point.date<weekStart).at(-1);
  return last&&prior?(last.close/prior.close-1)*100:null;
}
/** The largest one-day move of a quote within the week (from its own daily closes). */
export function biggestDay(quote:WeeklyQuote):{date:string;pct:number}|null {
  let before=quote.priorClose,best:{date:string;pct:number}|null=null;
  for(const day of quote.daily){const change=(day.close/before-1)*100;before=day.close;if(!best||Math.abs(change)>Math.abs(best.pct))best={date:day.date,pct:change}}
  return best;
}

export interface WeeklyPdf {html:string;fileName:string;pageTitle:string}
export function buildWeeklyPdfHtml(evidence:WeeklyEvidence,article:WeeklyArticle,issueDate:string):WeeklyPdf {
  const {window}=evidence,Q=(label:string)=>evidence.quotes.find(item=>item.label===label),charts=evidence.charts??{};
  const sp=Q('S&P 500'),nq=Q('나스닥'),dj=Q('다우존스'),ks=Q('코스피'),kq=Q('코스닥'),ty=Q('미국 10년물 국채금리'),fx=Q('원·달러 환율');
  if(!sp||!nq||!dj||!ks||!kq)throw new Error('WEEKLY_PDF_INDEX_MISSING');
  const range=weekRangeLabel(window),nextRange=weekRangeLabel({...window,weekStart:window.nextStart,weekEnd:window.nextEnd});
  const caps=(group:'US_STOCK'|'KOREA_STOCK')=>evidence.quotes.filter(item=>item.group===group).sort((a,b)=>b.changePct-a.changePct);
  const us=caps('US_STOCK'),kr=caps('KOREA_STOCK');
  // Headline: the larger U.S. index move and the KOSPI, as the article title states them.
  const usLead=[sp,nq,dj].sort((a,b)=>Math.abs(b.changePct)-Math.abs(a.changePct))[0]!,word=(value:number)=>Math.abs(value)<0.005?'보합':value>0?'상승':'하락',size=(value:number)=>`${Math.abs(value)<0.1?Math.abs(value).toFixed(2):Math.abs(value).toFixed(1)}%`;
  const headline=`${esc(usLead.label)} 주간 ${size(usLead.changePct)} ${word(usLead.changePct)},<br>코스피 ${size(ks.changePct)} ${word(ks.changePct)}`;
  const events=headlineEvents(evidence.calendar);
  // Summary points: measured facts only.
  const points:string[]=[];
  const nqDay=biggestDay(nq);
  points.push(`<b class=k>미국.</b> 나스닥 ${B(nq.changePct)}, S&P 500 ${B(sp.changePct)}, 다우존스 ${B(dj.changePct)}로 한 주를 마쳤다.${nqDay?` 나스닥의 하루 최대 변동은 ${weekday(nqDay.date)}요일 ${B(nqDay.pct)}였다.`:''}${us.length>=2?` 대형 기술주 중 ${esc(josa(us[0]!.label,'이','가'))} ${B(us[0]!.changePct)}로 가장 강했고 ${esc(josa(us.at(-1)!.label,'이','가'))} ${B(us.at(-1)!.changePct)}로 가장 약했다.`:''}`);
  const ksDay=biggestDay(ks);
  points.push(`<b class=k>국내.</b> 코스피 ${B(ks.changePct)}(${num(ks.weekClose)}), 코스닥 ${B(kq.changePct)}(${num(kq.weekClose)})로 두 지수의 주간 수익률 차이는 ${Math.abs(ks.changePct-kq.changePct).toFixed(1)}%p였다.${ksDay?` 코스피의 하루 최대 변동은 ${weekday(ksDay.date)}요일 ${B(ksDay.pct)}.`:''}${kr.length>=2?` 시가총액 상위 종목 중 ${esc(kr[0]!.label)} ${B(kr[0]!.changePct)}, ${esc(kr.at(-1)!.label)} ${B(kr.at(-1)!.changePct)}.`:''}`);
  if(ty){const peak=Math.max(...ty.daily.map(day=>day.close));points.push(`<b class=k>금리·환율.</b> 미국 10년물 금리는 주중 최고 ${peak.toFixed(2)}%를 거쳐 <b>${ty.weekClose.toFixed(2)}%</b>(${ty.changeBp!>0?'+':''}${ty.changeBp}bp)로 마감했다.${fx?` 원·달러 환율은 <b>${num(fx.weekClose)}원</b>(${B(fx.changePct)}).`:''}`)}
  if(events.length||evidence.calendar.length){const key=evidence.calendar.filter(item=>item.impact==='High').slice(0,3).map(item=>`${esc(item.kstLabel)} ${esc(item.countryLabel)} ${esc(item.koreanTitle??item.title)}${item.forecast?`(예상 ${esc(item.forecast)})`:''}`);points.push(`<b class=k>다음 주(${esc(nextRange)}).</b> ${events.length?esc(joinEvents(events))+'가 핵심 일정이다. ':''}${key.length?key.join(', ')+'.':''}`)}

  const qrow=(label:string)=>{const q=Q(label);if(!q)return '';const value=q.unit==='yield'?`${q.weekClose.toFixed(2)}%`:q.unit==='fx'?num(q.weekClose):num(q.weekClose);const change=q.unit==='yield'?`<td class=r style="color:${col(q.changeBp!)}">${q.changeBp!>0?'+':''}${q.changeBp}bp</td>`:`<td class=r style="color:${col(q.changePct)}"><b>${pct(q.changePct)}</b></td>`;return `<tr><td>${esc(label)}</td><td class=r>${value}</td>${change}</tr>`};
  const flows=evidence.flows?`<div class=sh>코스피 투자자별 순매수 <span class=tk>(${esc(evidence.flows.date.slice(5).replace('-','/'))}, 억원)</span></div><table>${([['외국인',evidence.flows.foreign],['기관',evidence.flows.institution],['개인',evidence.flows.individual]] as Array<[string,number]>).map(([label,value])=>`<tr><td>${label}</td><td class=r style="color:${col(value)}"><b>${value>0?'+':''}${num(value,0)}</b></td></tr>`).join('')}</table>`:'';

  const mini=([['^GSPC','S&P 500',NAVY,sp],['^IXIC','나스닥',NAVY,nq],['^KS11','코스피','#7a1f2b',ks],['^KQ11','코스닥','#7a1f2b',kq]] as Array<[string,string,string,WeeklyQuote]>).map(([symbol,name,color,quote])=>`<div class=mini><div class=minih><b>${name}</b><span class=lv>${num(quote.weekClose)}</span><span style="color:${col(quote.changePct)};font-weight:800">${pct(quote.changePct)} W/W</span></div>${lineChart(charts[symbol]??[],window.weekStart,color)}</div>`).join('');
  const sectorRows=Object.entries(SECTORS).map(([symbol,label])=>[label,seriesWeekChange(charts[symbol],window.weekStart,window.weekEnd)] as [string,number|null]).filter((row):row is [string,number]=>row[1]!==null);
  const capTable=(rows:WeeklyQuote[],korea:boolean)=>{const pick=[...rows.slice(0,4),...rows.slice(-4).filter(item=>!rows.slice(0,4).includes(item))];return `<table class=t><thead><tr><th>종목</th><th class=r>주간 종가</th><th class=r>주간 등락</th></tr></thead><tbody>${pick.map(q=>`<tr><td>${esc(q.label)}${korea?'':` <span class=tk>${esc(q.symbol)}</span>`}</td><td class=r>${korea?num(q.weekClose,0)+'원':'$'+num(q.weekClose)}</td><td class=r style="color:${col(q.changePct)}"><b>${pct(q.changePct)}</b></td></tr>`).join('')}</tbody></table>`};
  const reviews=evidence.broker.filter(item=>item.kind==='review'),outlooks=evidence.broker.filter(item=>item.kind==='outlook');
  const brokerTable=reviews.length?`<h2>증권가가 본 이번 주</h2><table class=t><thead><tr><th style="width:23mm">증권사</th><th>리포트와 핵심 문장 (원문 인용)</th></tr></thead><tbody>${reviews.slice(0,4).map(item=>`<tr><td class=nw><b>${esc(item.broker)}</b><div class=tk>${esc(koreanDateLabel(item.date))}</div></td><td><div class=rt>${esc(item.title)}</div><div>“${esc(item.sentence.replace(/[.。]$/,''))}”</div></td></tr>`).join('')}</tbody></table><div class=src>자료: 각 증권사 주간 리포트(네이버페이 증권 리서치 게시)</div>`:'';
  const calendar=evidence.calendar.length?`<h2>다음 주 주요 일정 (${esc(nextRange)}, 한국시간)</h2><table class=t><thead><tr><th style="width:30mm">일시</th><th style="width:13mm">국가</th><th>지표·이벤트</th><th class=r style="width:18mm">예상</th><th class=r style="width:18mm">이전</th></tr></thead><tbody>${evidence.calendar.slice(0,14).map(item=>`<tr${item.impact==='High'?' class=hi':''}><td class=nw>${esc(item.kstLabel)}</td><td>${esc(item.countryLabel)}</td><td>${esc(item.koreanTitle??item.title)}${item.impact==='High'?' <span class=star>★</span>':''}</td><td class=r>${esc(item.forecast||'-')}</td><td class=r>${esc(item.previous||'-')}</td></tr>`).join('')}</tbody></table><div class=src>★ 시장 영향이 큰 일정. 예상치는 Forex Factory 집계 기준이며, 일정은 발표 기관 사정에 따라 바뀔 수 있음.</div>`:'';
  // Checkpoints: next week's headline releases with their time and consensus, then the brokers' own outlook sentences.
  const boxes:string[]=[];
  for(const group of events){const items=evidence.calendar.filter(item=>`${item.countryLabel} ${item.group}`===group||item.group===group);const first=items[0];if(!first)continue;boxes.push(`<div class=box><div class=bt>${boxes.length+1}. ${esc(group)} (${esc(first.kstLabel)})</div>${items.slice(0,3).map(item=>`${esc(item.koreanTitle??item.title)}${item.forecast?` 예상 <b>${esc(item.forecast)}</b>`:''}${item.previous?`(이전 ${esc(item.previous)})`:''}`).join(', ')}.</div>`)}
  for(const item of outlooks.slice(0,3))boxes.push(`<div class=box><div class=bt>${boxes.length+1}. ${esc(item.broker)}의 다음 주 시각</div>“${esc(item.sentence.replace(/[.。]$/,''))}” <span class=tk>— 「${esc(item.title)}」, ${esc(koreanDateLabel(item.date))}</span></div>`);
  if(ty&&!boxes.length)boxes.push(`<div class=box><div class=bt>1. 미국 10년물 금리</div>이번 주 마감 ${ty.weekClose.toFixed(2)}%.</div>`);

  const sources=['Yahoo Finance(지수·금리·환율·종목 일별 종가)',...(evidence.flows?['네이버페이 증권(투자자별 매매)']:[]),...(evidence.calendar.length?['Forex Factory(경제 캘린더)']:[]),...new Set(evidence.broker.map(item=>item.broker))].join(', ');
  const issue=`${issueDate.slice(0,4)}. ${Number(issueDate.slice(5,7))}. ${Number(issueDate.slice(8,10))} (${weekday(issueDate)})`;
  const head=(page:number)=>`<div class=top><div class=brand>MOTUS <span>Research</span></div><div class=meta>주간 시장 전략 · Weekly Market Strategy<br>${issue} · ${page}/3</div></div>`;
  const foot=`<div class=foot>MOTUS Research · 공개 자료 기반 참고 자료이며 투자 권유가 아닙니다. 수치는 각 시장의 ${esc(koreanDateLabel(sp.weekCloseDate))} 종가 기준입니다.</div>`;
  const fig=(no:number,title:string,body:string,source='자료: Yahoo Finance, MOTUS')=>body?`<div class=fig><div class=figt><span>그림 ${no}.</span> ${esc(title)}</div>${body}<div class=src>${esc(source)}</div></div>`:'';
  const css=`@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"Noto Sans CJK KR","Noto Sans KR",sans-serif;color:#1b2430;font-size:9.3pt;line-height:1.55}
.page{width:210mm;height:297mm;padding:11mm 12mm 10mm;position:relative;page-break-after:always;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.4px solid ${NAVY};padding-bottom:5px}.brand{font-size:17pt;font-weight:900;color:${NAVY};letter-spacing:.5px}.brand span{font-weight:400;color:${ACC}}
.meta{text-align:right;font-size:7.8pt;color:${GRAY};line-height:1.4}.tag{display:inline-block;margin:10px 0 4px;background:${NAVY};color:#fff;font-size:7.8pt;font-weight:700;padding:2px 8px}
h1{font-size:19pt;line-height:1.3;margin:2px 0 4px;color:${NAVY};font-weight:900;letter-spacing:-.4px}.sub{color:${GRAY};font-size:9pt;margin-bottom:8px}
.grid{display:grid;grid-template-columns:62mm 1fr;gap:6mm}.side{background:${LIGHT};padding:7px 8px;align-self:start}.sh{font-weight:800;color:${NAVY};font-size:9pt;border-bottom:1.4px solid ${NAVY};padding-bottom:2px;margin:6px 0 4px}
.side table{width:100%;border-collapse:collapse;font-size:8pt}.side td{padding:2.4px 0;border-bottom:1px solid #d6dde7}.r{text-align:right}.nw{white-space:nowrap}
h2{font-size:11pt;color:${NAVY};margin:9px 0 5px;padding-left:7px;border-left:4px solid ${ACC};font-weight:800}.pt{margin:0 0 6px}.pt b.k{color:${NAVY}}
.pt .n{display:inline-block;width:15px;height:15px;background:${NAVY};color:#fff;font-size:8pt;text-align:center;line-height:15px;margin-right:5px;font-weight:800}
.fig{margin:6px 0 4px}.figt{font-weight:800;font-size:8.6pt;color:#222;border-bottom:1px solid #9aa6b2;padding-bottom:2px;margin-bottom:3px}.figt span{color:${ACC}}.src{font-size:7pt;color:${GRAY};margin-top:1px}
.minis{display:grid;grid-template-columns:1fr 1fr;gap:4mm 5mm}.mini{border-top:1px solid #d6dde7;padding-top:3px}.minih{display:flex;gap:8px;align-items:baseline;font-size:8.6pt}.lv{font-weight:800;font-size:10pt}
.t{width:100%;border-collapse:collapse;font-size:8.2pt}.t th{background:${NAVY};color:#fff;font-weight:700;padding:3px 5px;text-align:left}.t td{padding:3px 5px;border-bottom:1px solid #dde3ea;vertical-align:top}
.t tr.hi td{background:#fbf6ea}.star{color:${ACC}}.tk{color:${GRAY};font-size:7.2pt}.rt{color:${GRAY};font-size:7.6pt}.two{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.box{border:1px solid ${NAVY};padding:6px 9px;margin-top:5px}.box .bt{font-weight:800;color:${NAVY};margin-bottom:2px}
.foot{position:absolute;left:12mm;right:12mm;bottom:7mm;border-top:1px solid #c5ced9;padding-top:3px;font-size:6.8pt;color:${GRAY}}.legend{font-size:7.2pt;color:${GRAY}}.legend i{display:inline-block;width:10px;height:8px;background:${SHADE};margin:0 3px -1px 0}`;
  const p1=`<div class=page>${head(1)}<div class=tag>주간 시황 | 미국·국내 증시</div><h1>${headline}</h1><div class=sub>${esc(range)} 주간 결산과 ${esc(nextRange)} 일정 점검</div>
<div class=grid><div class=side><div class=sh>Market Data <span class=tk>(주간 종가·등락)</span></div><table>${['S&P 500','나스닥','다우존스','러셀 2000','필라델피아 반도체','코스피','코스닥'].map(qrow).join('')}</table>
<div class=sh>금리·환율·원자재</div><table>${['미국 10년물 국채금리','원·달러 환율','달러인덱스','WTI 유가','금'].map(qrow).join('')}</table>${flows}<div class=tk style="margin-top:4px">자료: Yahoo Finance${evidence.flows?', 네이버페이 증권':''}</div></div>
<div><h2>Weekly Summary</h2>${points.map((text,index)=>`<p class=pt><span class=n>${index+1}</span>${text}</p>`).join('')}</div></div>
${fig(1,'미국·국내 주요 지수 3개월 추이 (일별 종가, 오른쪽 숫자는 실제 지수)',`<div class=minis>${mini}</div><div class=legend><i></i>음영: 이번 주(${esc(range)})</div>`)}${foot}</div>`;
  const p2=`<div class=page>${head(2)}<h2>미국 업종과 대형주</h2><div class=two><div>${fig(2,'미국 업종별 주간 수익률 (SPDR 섹터 ETF)',barChart(sectorRows))}</div>
<div>${us.length?`<div class=figt><span>표 1.</span> 미국 대형 기술주 주간 등락 (상위·하위 4)</div>${capTable(us,false)}<div class=src>자료: Yahoo Finance</div>`:''}${kr.length?`<div class=figt style="margin-top:8px"><span>표 2.</span> 국내 시가총액 상위 종목 주간 등락 (상위·하위 4)</div>${capTable(kr,true)}<div class=src>자료: Yahoo Finance</div>`:''}</div></div>
<h2>금리와 환율</h2><div class=two>${fig(3,'미국 10년물 국채금리 (%)',lineChart(charts['^TNX']??[],window.weekStart,'#8a5a00',value=>value.toFixed(2)+'%',300,120))}${fig(4,'원·달러 환율 (원)',lineChart(charts['KRW=X']??[],window.weekStart,'#3c6e47',value=>num(value,0),300,120))}</div>${foot}</div>`;
  const p3=`<div class=page>${head(3)}${calendar}${boxes.length?`<h2>다음 주 체크포인트</h2>${boxes.slice(0,4).join('')}`:''}${brokerTable}
<div class=box style="border-color:#c5ced9;font-size:7.4pt;color:${GRAY};margin-top:8px"><b>Compliance Notice</b> 본 자료는 MOTUS가 공개된 시장 데이터와 증권사 공개 리포트를 바탕으로 작성한 참고 자료로, 특정 종목의 매수·매도를 권유하지 않습니다. 증권사 문장은 각 사 리포트 요약문을 그대로 인용했으며 저작권은 해당 증권사에 있습니다. 자료: ${esc(sources)}.</div>${foot}</div>`;
  return {html:`<!doctype html><html lang=ko><head><meta charset=utf-8><title>${esc(article.title)}</title><style>${css}</style></head><body>${p1}${p2}${p3}</body></html>`,fileName:`MOTUS_Weekly_${window.weekStart}_${window.weekEnd}.pdf`,pageTitle:article.title};
}
