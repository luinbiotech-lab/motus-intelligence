import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import type { EvidencePackage, EvidenceRecord, InputBundle, MarketSnapshot, ReportRecord } from '../domain/models.js';

export const EDITORIAL_RENDERER_VERSION = '2E.1.0';
export const BROKERAGE_RENDERER_VERSION = '2E.A4.1.0';

export interface EditorialSeoMetadata {
  title: string;
  description: string;
  slug: string;
  hashtags: string[];
}
export interface EditorialTerm {
  term: string;
  explanation: string;
  evergreenKey: string;
  evergreenTitle: string;
}
export interface OpportunityDecision {
  contentType: 'B_EVENT'|'C_EVERGREEN'|'D_COMPANY_INDUSTRY';
  recommended: boolean;
  score: number;
  reason: string;
  suggestedTitle: string|null;
  evidenceIds: string[];
}
export interface DailyEditorialOutput {
  rendererVersion: string;
  tradingDate: string;
  seo: EditorialSeoMetadata;
  bloggerMarkdown: string;
  terms: EditorialTerm[];
  opportunities: OpportunityDecision[];
  naver: { intro: string; hashtags: string[] };
}
export interface BrokerageReportOutput {
  rendererVersion: string;
  reportId: string;
  tradingDate: string;
  cached: boolean;
  markdown: string;
  naver: { intro: string; hashtags: string[] };
}

const indexName: Record<string,string> = {
  SPX: 'S&P 500',
  DJIA: '다우지수',
  IXIC: '나스닥',
  RUT: '러셀2000',
  VIX: 'VIX',
  US2Y: '미국 2년물 국채금리',
  US10Y: '미국 10년물 국채금리',
  DXY_FUTURES_SEP26: '달러인덱스 선물',
  WTI_CL_FUTURES_OCT26: 'WTI 원유 선물'
};

export function renderDailyEditorial(report:ReportRecord,evidence:EvidencePackage):DailyEditorialOutput {
  const input=evidence.originalInput as InputBundle;
  const market=input.market.filter(item=>item.status==='OK'&&item.close!==null);
  const map=new Map(market.map(item=>[item.symbol,item]));
  const spx=map.get('SPX'), nasdaq=map.get('IXIC'), dow=map.get('DJIA'), rut=map.get('RUT'), vix=map.get('VIX');
  const us2y=map.get('US2Y'), us10y=map.get('US10Y'), dollar=map.get('DXY_FUTURES_SEP26'), oil=map.get('WTI_CL_FUTURES_OCT26');
  const title=`${report.tradingDate} 미국증시 마감: 금리 상승에도 주식시장은 위험선호를 이어갔다`;
  const summary=[
    `${displayIndex(spx)}와 ${displayIndex(nasdaq)}가 나란히 상승하며 장을 마쳤다.`,
    `${displayIndex(vix)}는 낮아졌고, 단기 국채금리는 ${displayChange(us2y)} 움직였다.`,
    `한국시장 관점에서는 금리와 기술주 흐름을 함께 봐야 하는 하루였다.`
  ];
  const body=[
    `# ${title}`,
    '',
    summary.map(line=>`- ${line}`).join('\n'),
    '',
    '## 미국시장 마감',
    '',
    `미국 주식시장은 전반적으로 위험자산 선호가 우세했다. ${displayIndex(spx)}를 기록했고, 기술주 비중이 큰 ${displayIndex(nasdaq)}로 마감했다. ${displayIndex(dow)}도 상승했으며, 중소형주를 보여주는 ${displayIndex(rut)} 역시 플러스권에 머물렀다.`,
    '',
    `변동성 지표인 ${displayIndex(vix)}로 낮아졌다. 주가 상승과 변동성 하락이 동시에 나타났다는 점에서, 이날 장은 단순한 반등보다 투자심리 개선 쪽에 가까웠다.`,
    '',
    '## 시장을 움직인 원인',
    '',
    `채권시장에서는 ${displayIndex(us2y)}였고 ${displayIndex(us10y)}였다. 단기금리의 움직임은 통화정책 기대가 여전히 시장 가격에 반영되고 있음을 보여준다. 다만 이날 주식시장은 금리 부담보다 성장주와 기술주 흐름에 더 민감하게 반응했다.`,
    '',
    `${dollar?`달러 흐름은 ${displayIndex(dollar)}로 정리된다. `:''}${oil?`에너지 쪽에서는 ${displayIndex(oil)}였다. `:''}환율과 원자재가 한 방향으로 강한 압력을 만들었다기보다, 주식 내부의 위험선호가 더 뚜렷했던 장으로 보는 편이 자연스럽다.`,
    '',
    '## 주요 기업과 산업',
    '',
    companyParagraph(input),
    '',
    '## 한국시장 영향',
    '',
    koreaParagraph(input),
    '',
    '## 오늘의 체크리스트',
    '',
    '- 미국 국채 2년물과 10년물 금리의 추가 상승 여부',
    '- 나스닥 상승이 반도체와 AI 인프라 종목으로 이어지는지',
    '- 달러와 원유 가격이 한국 수출주와 항공·화학 업종에 주는 압력',
    '',
    '## 출처 및 관련 자료',
    '',
    sourceLines(evidence.records).join('\n'),
    '',
    hashtags(report.tradingDate).join(' ')
  ];
  const bloggerMarkdown=sanitizePublicMarkdown(body.join('\n'));
  const terms=buildDynamicTerms(bloggerMarkdown);
  const opportunities=decideContentOpportunities(report,evidence,bloggerMarkdown,terms);
  const seo={title,description:summary.join(' '),slug:`us-market-close-${report.tradingDate}`,hashtags:hashtags(report.tradingDate)};
  return {rendererVersion:EDITORIAL_RENDERER_VERSION,tradingDate:report.tradingDate,seo,bloggerMarkdown,terms,opportunities,naver:buildNaverIntro(title,summary,seo.hashtags)};
}

export function decideContentOpportunities(report:ReportRecord,evidence:EvidencePackage,bodyText:string,terms:EditorialTerm[]):OpportunityDecision[] {
  const input=evidence.originalInput as InputBundle;
  const market=input.market.filter(item=>item.status==='OK'&&item.close!==null);
  const largeMoves=market.filter(item=>Math.abs(item.changePct??0)>=2.5 || item.symbol==='VIX'&&Math.abs(item.changePct??0)>=10);
  const hasCompany=input.companyEvents.length+input.filings.length>0;
  const koreaImpact=evidence.impactJudgments.filter(item=>item.status==='OK'&&item.confidenceScore>=70);
  const base: OpportunityDecision[] = [
    {
      contentType:'B_EVENT',
      recommended:false,
      score:Math.min(100,largeMoves.length*35 + (input.news.some(item=>item.usedInReport)?25:0)),
      reason:largeMoves.length?'VIX·원자재·금리 등에서 별도 이벤트로 다룰 만한 움직임이 확인됐습니다.':'시장 충격이나 단일 이벤트가 충분히 크지 않아 Daily 안에서 처리합니다.',
      suggestedTitle:largeMoves.length?`${report.tradingDate} 미국시장 변동 요인 점검`:null,
      evidenceIds:largeMoves.map(item=>item.id)
    },
    {
      contentType:'C_EVERGREEN',
      recommended:false,
      score:Math.min(100,terms.filter(term=>highPriorityTerms.has(term.term)).length*18),
      reason:terms.filter(term=>highPriorityTerms.has(term.term)).length>=4?'약어·전문 용어가 충분해 Evergreen 후보입니다.':'용어 해설은 Daily 안에 넣고 별도 Evergreen은 보류합니다.',
      suggestedTitle:terms.filter(term=>highPriorityTerms.has(term.term)).length>=4?'미국증시 마감 리포트에서 자주 나오는 핵심 약어 정리':null,
      evidenceIds:[]
    },
    {
      contentType:'D_COMPANY_INDUSTRY',
      recommended:false,
      score:Math.min(100,(hasCompany?35:0)+koreaImpact.length*18),
      reason:hasCompany&&koreaImpact.length>=2?'기업 이벤트와 한국시장 전달경로가 함께 확인되어 산업 후속 글 후보입니다.':'기업·산업 단독 글로 분리할 만큼의 복합 근거는 제한적입니다.',
      suggestedTitle:hasCompany?'미국 기업 이벤트가 한국 산업에 주는 시사점':'미국 금리와 기술주 흐름의 한국시장 전달경로',
      evidenceIds:[...input.companyEvents.map(item=>item.id),...input.filings.map(item=>item.id),...koreaImpact.flatMap(item=>item.evidenceIds)].slice(0,8)
    }
  ];
  const recommended=new Set(base.filter(item=>item.score>=70).sort((a,b)=>b.score-a.score).slice(0,2).map(item=>item.contentType));
  return base.map(item=>({...item,recommended:recommended.has(item.contentType)}));
}

const highPriorityTerms=new Set(['PBR','PER','EPS','BPS','ROE','EBITDA','FCF','CAPEX','CPI','PCE','FOMC','VIX','DXY','YoY','MoM','QoQ','bp','Guidance','Consensus','WTI']);
export function buildDynamicTerms(markdown:string):EditorialTerm[] {
  const candidates: EditorialTerm[] = [
    {term:'PBR',explanation:'주가를 주당순자산으로 나눈 값입니다. 자산가치 대비 주가 수준을 볼 때 씁니다.',evergreenKey:'term-pbr',evergreenTitle:'PBR로 밸류에이션 읽기'},
    {term:'PER',explanation:'주가를 주당순이익으로 나눈 값입니다. 이익 대비 주가 부담을 비교할 때 씁니다.',evergreenKey:'term-per',evergreenTitle:'PER과 성장주의 가격 부담'},
    {term:'EPS',explanation:'주당순이익입니다. 기업 이익이 한 주당 얼마나 쌓이는지 보여줍니다.',evergreenKey:'term-eps',evergreenTitle:'EPS와 실적 시즌 읽기'},
    {term:'BPS',explanation:'주당순자산입니다. 기업의 장부상 순자산을 주식 수로 나눈 값입니다.',evergreenKey:'term-bps',evergreenTitle:'BPS와 PBR 함께 보기'},
    {term:'ROE',explanation:'자기자본이익률입니다. 회사가 자본을 얼마나 효율적으로 이익으로 바꾸는지 보여줍니다.',evergreenKey:'term-roe',evergreenTitle:'ROE가 높은 기업의 의미'},
    {term:'EBITDA',explanation:'이자·세금·감가상각 전 이익입니다. 기업의 현금창출력을 거칠게 비교할 때 사용합니다.',evergreenKey:'term-ebitda',evergreenTitle:'EBITDA로 기업 체력 보기'},
    {term:'FCF',explanation:'잉여현금흐름입니다. 영업과 투자 지출 뒤 실제로 남는 현금을 뜻합니다.',evergreenKey:'term-fcf',evergreenTitle:'FCF가 중요한 이유'},
    {term:'CAPEX',explanation:'설비투자입니다. AI 데이터센터, 반도체, 에너지 인프라 투자 판단에 자주 등장합니다.',evergreenKey:'term-capex',evergreenTitle:'CAPEX와 투자 사이클'},
    {term:'CPI',explanation:'소비자물가지수입니다. Fed 정책 기대와 국채금리 방향을 움직이는 핵심 물가 지표입니다.',evergreenKey:'term-cpi',evergreenTitle:'CPI 발표와 시장 반응'},
    {term:'PCE',explanation:'개인소비지출 물가지수입니다. Fed가 선호하는 물가 지표로 알려져 있습니다.',evergreenKey:'term-pce',evergreenTitle:'PCE와 Fed의 물가 판단'},
    {term:'FOMC',explanation:'미국 연방공개시장위원회입니다. 기준금리와 통화정책 방향을 결정합니다.',evergreenKey:'term-fomc',evergreenTitle:'FOMC 전후 시장 체크포인트'},
    {term:'VIX',explanation:'옵션시장에서 계산되는 변동성 지표입니다. 숫자가 내려가면 공포가 완화됐다는 신호로 해석되는 경우가 많습니다.',evergreenKey:'term-vix',evergreenTitle:'VIX로 시장 심리 확인하기'},
    {term:'DXY',explanation:'달러인덱스입니다. 주요 통화 대비 달러의 상대 강도를 보여줍니다.',evergreenKey:'term-dxy',evergreenTitle:'DXY와 원화 흐름'},
    {term:'YoY',explanation:'전년 대비 변화율입니다. 물가와 실적의 장기 흐름을 비교할 때 사용합니다.',evergreenKey:'term-yoy',evergreenTitle:'YoY와 MoM 차이'},
    {term:'MoM',explanation:'전월 대비 변화율입니다. CPI처럼 월간 지표의 단기 변화를 볼 때 씁니다.',evergreenKey:'term-mom',evergreenTitle:'MoM 지표 읽는 법'},
    {term:'QoQ',explanation:'전분기 대비 변화율입니다. 기업 실적이나 GDP 흐름을 볼 때 자주 등장합니다.',evergreenKey:'term-qoq',evergreenTitle:'QoQ와 실적 해석'},
    {term:'bp',explanation:'basis point의 줄임말로 0.01%포인트를 뜻합니다. 금리 변화폭을 정확히 말할 때 사용합니다.',evergreenKey:'term-bp',evergreenTitle:'bp로 금리 변화 읽기'},
    {term:'Guidance',explanation:'기업이 제시하는 향후 실적 전망입니다. 실적 발표 뒤 주가 반응을 좌우할 수 있습니다.',evergreenKey:'term-guidance',evergreenTitle:'가이던스가 주가에 중요한 이유'},
    {term:'Consensus',explanation:'시장 예상치입니다. 실제 지표나 실적이 예상치를 웃도는지 밑도는지 판단하는 기준입니다.',evergreenKey:'term-consensus',evergreenTitle:'컨센서스와 서프라이즈'},
    {term:'WTI',explanation:'미국 서부텍사스산 원유 가격을 뜻합니다. 에너지 비용, 물가 기대, 화학·항공 업종 판단에 자주 활용됩니다.',evergreenKey:'term-wti',evergreenTitle:'WTI 원유 가격과 산업별 영향'},
    {term:'국채금리',explanation:'정부가 발행한 채권의 수익률입니다. 금리가 오르면 성장주 밸류에이션과 환율, 외국인 수급에 부담이 될 수 있습니다.',evergreenKey:'term-treasury-yield',evergreenTitle:'미국 국채금리와 주식시장의 관계'}
  ];
  const aliases: Record<string,string[]>={DXY:['달러인덱스'],WTI:['원유'],CAPEX:['설비투자','AI 인프라'],CPI:['소비자물가'],bp:['%포인트','포인트'],Consensus:['예상치'],Guidance:['전망']};
  const selected=candidates.filter(item=>markdown.includes(item.term)||(aliases[item.term]??[]).some(alias=>markdown.includes(alias))).slice(0,8);
  return selected.length>=3?selected:selected.concat(candidates.filter(item=>!selected.includes(item)&&item.term==='국채금리'&&markdown.includes('금리'))).slice(0,Math.max(3,selected.length));
}

export async function renderBrokerageReportOnDemand(report:ReportRecord,evidence:EvidencePackage,outputDir:string):Promise<BrokerageReportOutput> {
  const path=`${outputDir}/${report.reportId}-${BROKERAGE_RENDERER_VERSION}.md`;
  const daily=renderDailyEditorial(report,evidence);
  try {
    await access(path);
    return {rendererVersion:BROKERAGE_RENDERER_VERSION,reportId:report.reportId,tradingDate:report.tradingDate,cached:true,markdown:await readFile(path,'utf8'),naver:daily.naver};
  } catch {}
  await mkdir(outputDir,{recursive:true});
  const input=evidence.originalInput as InputBundle;
  const lines=[
    `# 내부용 A4 브로커리지 요약 — ${report.tradingDate}`,
    '',
    `- 렌더러: ${BROKERAGE_RENDERER_VERSION}`,
    `- 기준 리포트: ${report.reportId}`,
    '- 용도: 내부 관리자 요청 시 생성되는 1페이지 요약',
    '',
    '## 핵심 판단',
    '',
    daily.seo.description,
    '',
    '## 시장 데이터',
    '',
    ...input.market.filter(item=>item.status==='OK'&&item.close!==null).map(item=>`- ${indexName[item.symbol]??item.symbol}: ${item.close} ${item.unit}, ${formatPct(item.changePct)}.`),
    '',
    '## 한국시장 체크포인트',
    '',
    koreaParagraph(input),
    '',
    '## 공개 콘텐츠 동시 산출',
    '',
    daily.naver.intro,
    '',
    daily.naver.hashtags.join(' ')
  ];
  const markdown=lines.join('\n');
  await writeFile(path,markdown);
  return {rendererVersion:BROKERAGE_RENDERER_VERSION,reportId:report.reportId,tradingDate:report.tradingDate,cached:false,markdown,naver:daily.naver};
}

function displayIndex(record:MarketSnapshot|undefined) {
  if(!record||record.close===null) return '확인 가능한 수치 없음';
  return `${indexName[record.symbol]??record.symbol} ${record.close}(${formatPct(record.changePct)})`;
}
function displayChange(record:MarketSnapshot|undefined) {
  if(!record) return '확인 불가';
  return `${formatSigned(record.change)}포인트, ${formatPct(record.changePct)}`;
}
function formatPct(value:number|null|undefined) {
  if(typeof value!=='number') return '변동률 확인 불가';
  return `${value>0?'+':''}${Number(value.toFixed(2))}%`;
}
function formatSigned(value:number|null|undefined) {
  if(typeof value!=='number') return '확인 불가';
  return `${value>0?'+':''}${Number(value.toFixed(3))}`;
}
function companyParagraph(input:InputBundle) {
  if(input.companyEvents.length||input.filings.length) {
    const events=input.companyEvents.map(item=>`${item.ticker}는 ${item.title}을 통해 ${item.summary}`).join(' ');
    const filings=input.filings.map(item=>`${item.ticker} ${item.formType}에는 ${item.extractedFacts.join(', ')}가 확인됐다`).join(' ');
    return [events,filings].filter(Boolean).join(' ');
  }
  return '개별 기업 이슈는 시장 전체 흐름을 압도할 만큼 따로 분리되지 않았다. 이날은 특정 한 종목보다 금리, 기술주, 변동성의 조합이 더 중요한 관찰 지점이었다.';
}
function koreaParagraph(input:InputBundle) {
  const signals=input.signals.filter(item=>item.driverStatement);
  if(signals.length) return signals.map(item=>`${item.driverStatement} 이 흐름은 ${item.usIndustry}에서 한국 관련 업종으로 이어질 수 있지만, 환율과 실적 기대가 함께 확인돼야 한다.`).join(' ');
  return '한국시장에서는 미국 기술주 흐름과 금리 수준을 함께 봐야 한다. 지수 상승만 보고 추격하기보다 환율, 외국인 수급, 반도체 업종의 장중 반응을 확인하는 편이 안전하다.';
}
function sourceLines(records:EvidenceRecord[]) {
  const seen=new Set<string>();
  return records.filter(record=>record.sourceUrl&&!seen.has(record.sourceUrl)&&seen.add(record.sourceUrl)).slice(0,8).map((record,index)=>`- 자료 링크 ${index+1}: ${record.sourceUrl}`);
}
function hashtags(date:string) {
  return ['#미국증시','#미국시장마감','#나스닥','#SP500','#국채금리','#한국시장',`#${date.replaceAll('-','')}`];
}
function buildNaverIntro(title:string,summary:string[],tags:string[]) {
  return {intro:`${title}\n\n오늘 미국장은 지수 상승, 금리, 변동성 흐름을 함께 봐야 했습니다. 핵심 수치와 한국시장 체크포인트만 짧게 정리했습니다.\n\n${summary[0]??''}`,hashtags:tags.slice(0,6)};
}
function sanitizePublicMarkdown(markdown:string) {
  return markdown
    .replace(/CLAIM-[A-Z0-9:._-]+/g,'')
    .replace(/MANUAL-\d{4}-\d{2}-\d{2}-[a-f0-9]+/g,'')
    .replace(/\b(AUTO_VALIDATED|REVIEW_REQUIRED|BLOCKED|PUBLISHED|APPROVED|OK|NO_DATA|DATA_NOT_CONNECTED)\b/g,'')
    .replace(/"/g,'”');
}
