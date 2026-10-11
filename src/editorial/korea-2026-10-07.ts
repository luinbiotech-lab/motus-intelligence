import type {KoreaMarketDailyViewModel} from '../intelligence/daily-masters.js';
import type {KoreaMarketNewsletterMetric} from '../intelligence/korea-market.js';
import type {NewsletterSourceLink} from '../intelligence/newsletter.js';

const KRX='https://www.krx.co.kr/main/mobile.jsp';
const NEWSPIM='https://www.newspim.com/news/view/20261007001273';
const YUANTA='https://account.myasset.com/myasset/research/rs_global/RS_0401000_M.cmd?glblGubun=KS';
const NEWS1='https://www.fnnews.com/news/202610071537016283';

/** Verified close data only. Conflicting intraday investor-flow snapshots are not mixed. */
export function koreaMarket20261007():KoreaMarketDailyViewModel {
  const sources:NewsletterSourceLink[]=[
    source('한국거래소 — 10월 7일 시장지수',KRX,'한국거래소'),
    source('뉴스핌 — 10월 7일 한국 증시 마감',NEWSPIM,'뉴스핌'),
    source('유안타증권 — 10월 7일 국내 시황',YUANTA,'유안타증권'),
    source('뉴스1 — 10월 7일 지수·환율 교차검증',NEWS1,'뉴스1')
  ];
  return {
    publicationId:'motus-korea-market-2026-10-07',issueDate:'2026-10-07',issueNumber:4,
    title:'국내 증시 마감: 외국인 매도에 코스피 1.98% 하락, 코스닥 900선 이탈',
    subtitle:'삼성전자 실적 경계와 반도체 약세가 수급을 압박한 하루',
    category:'KOREA_MARKET',canonicalLabel:'Korea Market',displayLabel:'국내증시',
    marketSummary:'코스피는 1.98% 내린 6,803.90, 코스닥은 2.34% 하락한 898.43에 마감했다. 삼성전자 잠정실적 발표를 앞둔 경계감과 외국인·기관의 동반 매도가 대형 반도체와 경기민감주를 눌렀다. 원·달러 환율은 서울 외환시장 주간 종가 기준 3.2원 내린 1,340.4원이었다.',
    indexMetrics:[metric('KOSPI','INDEX','KOSPI','6,803.90 (-1.98%)','DOWN'),metric('KOSDAQ','INDEX','KOSDAQ','898.43 (-2.34%)','DOWN')],
    fxAndSupporting:[metric('USD_KRW','FX','USD/KRW','1,340.4원 (-3.2원)','DOWN')],
    investorFlows:[metric('KOSPI_FOREIGN','FLOW','KOSPI 외국인','-3조 1,095억원','DOWN'),metric('KOSPI_INSTITUTION','FLOW','KOSPI 기관','-8,598억원','DOWN'),metric('KOSPI_RETAIL','FLOW','KOSPI 개인','+3조 2,616억원','UP')],
    sectors:[metric('SECTOR_HEALTH','SECTOR','의료·정밀기기','+5.86%','UP'),metric('SECTOR_ENTERTAINMENT','SECTOR','오락·문화','+3.95%','UP'),metric('SECTOR_METALS','SECTOR','금속','-4.14%','DOWN'),metric('SECTOR_TRANSPORT','SECTOR','운송장비·부품','-3.54%','DOWN')],
    movers:[metric('SAMSUNG_ELECTRONICS','MOVER','삼성전자','-1.29%','DOWN'),metric('SK_HYNIX','MOVER','SK하이닉스','-2.82%','DOWN'),metric('KB_FINANCIAL','MOVER','KB금융','+0.96%','UP'),metric('LG_ELECTRONICS','MOVER','LG전자','-10.54%','DOWN')],
    research:[],
    marketCommentary:['미국 증시의 최고치 경신만으로 국내 대형주의 방향을 돌리기에는 실적 발표 전 경계와 외국인 매도 압력이 더 컸다. 코스피 외국인 순매도는 3조원을 넘었고 개인이 이를 받아냈지만, 삼성전자와 SK하이닉스가 함께 하락하면서 지수 방어가 어려웠다.','코스닥도 외국인·기관 매도 속 900선을 내줬다. 반면 의료·정밀기기와 오락·문화는 올랐다. 지수 하락이 모든 업종의 동반 약세라기보다 반도체와 일부 대형 경기민감주에 집중됐다는 점을 함께 볼 필요가 있다.'],
    checkpoints:[{headline:'삼성전자 잠정실적',watchFor:'실적 발표 뒤 반도체 대형주의 외국인 수급 변화',validityHorizon:'SHORT_TERM'},{headline:'코스피 외국인 수급',watchFor:'3거래일 연속 순매도 강도가 완화되는지',validityHorizon:'SHORT_TERM'},{headline:'코스닥 900선',watchFor:'바이오·미디어 강세가 지수 회복으로 이어지는지',validityHorizon:'SHORT_TERM'}],
    sources
  };
}

function metric(factId:string,group:KoreaMarketNewsletterMetric['group'],label:string,displayValue:string,direction:KoreaMarketNewsletterMetric['direction']):KoreaMarketNewsletterMetric {return {factId,group,label,displayValue,direction,source:{label:'뉴스핌 — 한국거래소 인용 마감 자료',url:NEWSPIM}};}
function source(label:string,url:string,publisher:string):NewsletterSourceLink{return {label,url,publisher};}
