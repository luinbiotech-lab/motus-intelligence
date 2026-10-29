import {createHash} from 'node:crypto';

export interface VerifiedBrokerAnalysis {
 category:'US_MARKET'|'KOREA_MARKET';publisher:string;author:string;headline:string;
 publishedAt:string;collectedAt:string;sourceUrl:string;documentUrl:string|null;
 basis:'OFFICIAL_TRANSCRIPT'|'OFFICIAL_REPORT_ABSTRACT';
 sourceTextHash:string;anchors:Array<{text:string;offset:number}>;
 institutionView:string[];interpretation:string;sectorContext:string[];risks:string;watch:string;
}
export interface BrokerAnalysisAudit {sourceId:string;category:'US_MARKET'|'KOREA_MARKET';url:string;status:'PASS'|'FAILED';recordCount:number;collectedAt:string;error:string|null}
const MS='https://www.morganstanley.com/insights/podcasts/thoughts-on-the-market';
const HANA='https://www.hanaw.com/main/research/research/list.cmd?cid=2&pid=2';
const hash=(text:string)=>'sha256:'+createHash('sha256').update(text).digest('hex');
export function researchText(html:string):string {return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&#(?:39|x27);/gi,"'").replace(/&amp;/g,'&').replace(/&(?:nbsp|quot|lt|gt);/g,' ').replace(/\s+/g,' ').trim()}
function recent(date:string,at:string){const elapsed=Date.parse(at)-Date.parse(date);return Number.isFinite(elapsed)&&elapsed>=0&&elapsed<=7*86400000}
function proof(text:string,terms:string[]){const anchors=terms.map(term=>({text:term,offset:text.indexOf(term)}));return anchors.every(a=>a.offset>=0)?{sourceTextHash:hash(text),anchors}:null}

// These reviewed Korean paraphrases are enabled only for the corresponding
// source passages. New/unrecognized reports remain unreviewed; no title-based
// forecast, target price, or paid model call is used as a fallback.
export function parseMorganAnalysis(html:string,at:string):VerifiedBrokerAnalysis[] {
 const analyses:VerifiedBrokerAnalysis[]=[];
 for(const card of html.split(/<div class="episodecard\b[^>]*>/i).slice(1,7)){
  const dateText=researchText(card.match(/class="episode-eyebrow"[^>]*>([\s\S]*?)<\/div>/i)?.[1]??'');
  const date=Date.parse(dateText+' 00:00:00 GMT');if(!Number.isFinite(date))continue;
  const publishedAt=new Date(date).toISOString().slice(0,10);if(publishedAt!=='2026-10-26'||!recent(publishedAt,at))continue;
  const title=card.match(/class="episode-title"[^>]*>[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if(!title||researchText(title[2]!)!=='The Next Stage of the Market Correction')continue;
  const transcript=researchText(card.match(/class="[^"]*transcript_text"[^>]*>([\s\S]*?)<\/div>/i)?.[1]??'');
  const p=proof(transcript,['Mike Wilson','mid-cycle transition','midterm elections','liquidity','credit markets','may still have some unfinished business','cost of capital']);
  if(!p||!transcript.includes('S&P 500')||!transcript.includes('Semiconductors'))continue;
  const sourceUrl=new URL(title[1]!,MS).href;if(!sourceUrl.startsWith(MS+'/'))continue;
  analyses.push({category:'US_MARKET',publisher:'Morgan Stanley',author:'Mike Wilson',headline:'모건스탠리: 지수 조정의 마지막 단계와 AI 자금조달 부담',publishedAt,collectedAt:at,sourceUrl,documentUrl:null,basis:'OFFICIAL_TRANSCRIPT',...p,
   institutionView:[
    '모건스탠리의 미국 주식 전략을 이끄는 마이크 윌슨은 10월 26일 공개 해설에서 주가 조정이 상당 부분 진행됐지만 S&P500의 추가 조정 가능성이 남아 있다고 평가했다. 그는 이를 경기 회복 초기의 주도주에서 우량 기업으로 관심이 옮겨가는 중간 국면으로 설명했다.',
    '윌슨이 제시한 변수는 AI 투자에 필요한 자금조달 물량, 미국 중간선거, 유동성이었다. AI 사업의 투자수익과 자본비용에 대한 의문이 커진 상황에서 신규 자금 수요를 신용시장이 소화하는 과정이 중요하다는 판단이다. 이는 발표 당시 전략가의 전망이며 이후 시장에서 확인된 결과를 뜻하지 않는다.'
   ],
   interpretation:'MOTUS 해석: 이 관점을 현재 시장에 적용하려면 지수 등락과 함께 기업의 자금조달 조건을 봐야 한다. 주가가 반등해도 차입 비용과 발행 부담이 커진다면 AI 설비 확대가 주주에게 남기는 이익은 달라질 수 있다. 지수 상승만으로 투자 여건 전체가 개선됐다고 판단하기 어려운 이유다.',
   sectorContext:['윌슨은 반도체·자동차·자본재 등 경기 회복 초기 주도 업종의 조정과 우량 기업으로의 이동을 언급했다. 이 업종 구분은 기관이 제시한 투자 관점이다. 해당 거래일의 업종별 수익률이나 개별 기업의 지수 기여도를 대신하는 수치로 사용하지 않는다.'],
   risks:'전망의 한계: 이 해설은 10월 26일 발표됐다. 이후의 통화정책 결정과 기업 실적에 따라 판단이 달라질 수 있으며, 발표일 이후의 지수 흐름을 미리 설명한 사실로 취급할 수 없다.',
   watch:'후속 확인: AI 관련 기업의 실제 자금조달 금리와 발행 조건, 신용시장 반응, 지수 상승 종목의 확산 여부를 함께 대조한다.'});
  break;
 }
 return analyses;
}

export function parseHanaAnalysis(html:string,at:string):VerifiedBrokerAnalysis[] {
 const titles=[...html.matchAll(/<a\b[^>]*class="more_btn title"[^>]*id="([\d_]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
 for(let i=0;i<Math.min(titles.length,4);i++){
  const item=titles[i]!,headline=researchText(item[2]!);
  if(!headline.includes('주도 섹터 변경 가능성과 11월 특유 계절성'))continue;
  const card=html.slice(item.index!,titles[i+1]?.index??item.index!+15000);
  const date=card.match(/class="txtbasic">(20\d{2})\.(\d{2})\.(\d{2})<\/span>/);
  const clock=researchText(card.match(/class="hide-on-mobile txtbasic r-side-bar">([\s\S]*?)<\/span>/)?.[1]??'');
  const time=clock.match(/(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})/);if(!date||!time)continue;
  const hour=(Number(time[2])%12)+(time[1]==='오후'?12:0),publishedAt=`${date[1]}-${date[2]}-${date[3]}T${String(hour).padStart(2,'0')}:${time[3]}:${time[4]}+09:00`;
  if(!recent(publishedAt,at))continue;
  const text=researchText(card.match(/<li class="[^"]*j_bbsContn[^\"]*">([\s\S]*?)<\/li>/i)?.[1]??'');
  const p=proof(text,['69개월','6개월','1:2','생명보험','기관 빈집','11월']);
  const author=researchText(card.match(/class="none m-name">([\s\S]*?)<\/span>/)?.[1]??'');
  const file=card.match(/href="(\/main\/research\/research\/download\.cmd\?[^"]+)"/i)?.[1];
  if(!p||author!=='이경수'||!file||!['에너지','반도체','기술하드웨어','전기제품'].every(term=>text.includes(term)))continue;
  return [{category:'KOREA_MARKET',publisher:'하나증권',author,headline:'하나증권: 11월 업종 교체와 이익 전망 변화에 주목',publishedAt,collectedAt:at,sourceUrl:HANA+'#'+item[1],documentUrl:new URL(file.replaceAll('&amp;','&'),'https://www.hanaw.com').href,basis:'OFFICIAL_REPORT_ABSTRACT',...p,
   institutionView:[
    '하나증권 이경수 연구위원은 10월 27일 공개한 보고서 요약에서 11월 업종 선택에 이익 전망의 변화와 계절성을 함께 반영했다. 주가 흐름만 따라가는 방식과 달리, 최근 6개월 이익 전망 수정에 가격 모멘텀보다 두 배의 가중치를 둔 모델을 사용했다.',
    '모델이 제시한 업종은 생명보험·에너지·반도체·기술하드웨어·전기제품이다. 보고서는 3분기 실적 발표 이후 차익실현과 연말 운용 정리가 겹치는 11월에는 기관의 보유 변화가 업종 교체에 영향을 줄 수 있다고 봤다. 이 목록은 모델의 선정 결과이며 당일 상승률 순위가 아니다.'
   ],interpretation:'MOTUS 해석: 하루 상승률이 큰 상품을 주도 업종으로 고르는 것과 이익 전망 개선을 확인하는 것은 다른 판단이다. 반도체 강세가 이어지더라도 이익 추정치 상향이 함께 나타나는지, 기관 매매가 특정 상품에 집중됐는지 업종 전반으로 확산됐는지를 나눠 봐야 한다.',sectorContext:[],
   risks:'전망의 한계: 계절성과 과거 자료를 이용한 모델 결과가 다음 달 수익률을 보장하지 않는다. 실제 실적과 자금 흐름이 가정에서 벗어나면 선정 업종의 성과도 달라질 수 있다.',
   watch:'후속 확인: 해당 업종의 이익 추정치 수정 방향과 기관 순매매를 같은 기간으로 비교하고, 실적 발표 전후에 업종 교체가 이어지는지 확인한다.'}];
 }
 return [];
}

export async function collectBrokerAnalysis(category:'US_MARKET'|'KOREA_MARKET',at:string,fetcher:typeof fetch=fetch):Promise<{analyses:VerifiedBrokerAnalysis[];audit:BrokerAnalysisAudit[]}> {
 const url=category==='US_MARKET'?MS:HANA;
 try {
  const response=await fetcher(url,{headers:{accept:'text/html','user-agent':'MOTUS-ResearchCollector/1.0'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('BROKER_ANALYSIS_HTTP_'+response.status);
  if(response.url&&new URL(response.url).hostname!==new URL(url).hostname)throw Error('BROKER_ANALYSIS_REDIRECT_REJECTED');
  const html=await response.text();if(html.length>4000000)throw Error('BROKER_ANALYSIS_OVERSIZED');
  const analyses=category==='US_MARKET'?parseMorganAnalysis(html,at):parseHanaAnalysis(html,at);
  const audit:BrokerAnalysisAudit[]=[{sourceId:'broker-analysis:index',category,url,status:analyses.length?'PASS':'FAILED',recordCount:analyses.length,collectedAt:at,error:analyses.length?null:'BROKER_ANALYSIS_NO_REVIEWED_RECENT_PASSAGE'}];
  for(const item of analyses)audit.push({sourceId:'broker-analysis:passage',category,url:item.sourceUrl,status:'PASS',recordCount:1,collectedAt:at,error:null});
  return {analyses,audit};
 }catch(error){return {analyses:[],audit:[{sourceId:'broker-analysis:index',category,url,status:'FAILED',recordCount:0,collectedAt:at,error:error instanceof Error&&/^BROKER_ANALYSIS_/.test(error.message)?error.message:'BROKER_ANALYSIS_FETCH_FAILED'}]};}
}

export function brokerAnalysisReasons(category:string,analyses:VerifiedBrokerAnalysis[]|undefined,html:string,at:string):string[] {
 if(!['US_MARKET','KOREA_MARKET'].includes(category))return [];
 const items=analyses??[];
 if(!items.length)return ['BROKER_ANALYSIS_REQUIRED'];
 const text=researchText(html.replace(/<(header|ul|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' '));
 return items.some(item=>item.category!==category||!(category==='US_MARKET'?item.publisher==='Morgan Stanley'&&item.sourceUrl.startsWith(MS+'/'):item.publisher==='하나증권'&&item.sourceUrl.startsWith(HANA+'#'))||!recent(item.publishedAt,at)||!Number.isFinite(Date.parse(item.collectedAt))||Date.parse(item.collectedAt)>Date.parse(at)||Date.parse(at)-Date.parse(item.collectedAt)>2*3600000||!/^sha256:[a-f\d]{64}$/.test(item.sourceTextHash)||item.anchors.length<2||item.anchors.some(a=>a.offset<0)||!item.author||!item.institutionView?.length||![...item.institutionView,item.interpretation,item.risks,item.watch].every(p=>p.length>=40&&text.includes(p))||!html.includes(item.sourceUrl.replaceAll('&','&amp;')))?['BROKER_ANALYSIS_PROVENANCE_OR_BODY_INVALID']:[];
}
