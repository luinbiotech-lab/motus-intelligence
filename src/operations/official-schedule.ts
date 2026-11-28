/**
 * Official market schedules the Forex Factory feed does not carry (MO-29, MOT-058):
 * - Bank of Korea monetary policy (통화정책방향 결정) meetings,
 * - NYSE holidays and early closes.
 *
 * Both are published once a year by the institution, so they are kept here as dated tables with their source.
 * A week outside the covered range is reported as NOT covered (never guessed): the caller writes a FAILED audit row
 * so the gap is visible in evidence.json, and the table is simply missing those rows.
 */

/** BOK 금통위 통화정책방향 결정회의 dates (KST calendar dates). */
export const BOK_MPC_SOURCE={label:'한국은행 통화정책방향 결정회의 일정',url:'https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?menuNo=200755'};
/**
 * Verified dates. 2026: 10/22 (KDI 경제정보센터 게재 한국은행 보도자료 「통화정책방향」), 11/26 (SBS Biz 2026-10-29 「한은, 내년 첫 금리
 * 결정 1월 14일…금통위 일정 확정」 '11월 26일 올해 마지막 금통위'). 2027: same SBS Biz article (한국은행 발표 8회).
 * Earlier 2026 meetings are not listed because they were not verified and are in the past.
 */
export const BOK_MPC_DATES:readonly string[]=['2026-10-22','2026-11-26','2027-01-14','2027-02-25','2027-04-09','2027-05-27','2027-07-15','2027-08-26','2027-10-15','2027-11-25'];
/** Inclusive KST date range in which BOK_MPC_DATES is complete. */
export const BOK_MPC_COVERAGE={from:'2026-10-01',to:'2027-12-31'};

/** NYSE Group, 2025-12-23 「NYSE Group Announces 2026, 2027 and 2028 Holiday and Early Closings Calendar」. */
export const NYSE_CALENDAR_SOURCE={label:'NYSE 휴장·조기 마감 일정',url:'https://ir.theice.com/press/news-details/2025/NYSE-Group-Announces-2026-2027-and-2028-Holiday-and-Early-Closings-Calendar/default.aspx'};
export const NYSE_HOLIDAYS:ReadonlyArray<readonly [string,string]>=[
  ['2026-01-01','새해 첫날'],['2026-01-19','마틴 루서 킹 데이'],['2026-02-16','대통령의 날'],['2026-04-03','성금요일'],['2026-05-25','메모리얼 데이'],['2026-06-19','준틴스'],['2026-07-03','독립기념일 대체'],['2026-09-07','노동절'],['2026-11-26','추수감사절'],['2026-12-25','성탄절'],
  ['2027-01-01','새해 첫날'],['2027-01-18','마틴 루서 킹 데이'],['2027-02-15','대통령의 날'],['2027-03-26','성금요일'],['2027-05-31','메모리얼 데이'],['2027-06-18','준틴스 대체'],['2027-07-05','독립기념일 대체'],['2027-09-06','노동절'],['2027-11-25','추수감사절'],['2027-12-24','성탄절 대체'],
  ['2028-01-17','마틴 루서 킹 데이'],['2028-02-21','대통령의 날'],['2028-04-14','성금요일'],['2028-05-29','메모리얼 데이'],['2028-06-19','준틴스'],['2028-07-04','독립기념일'],['2028-09-04','노동절'],['2028-11-23','추수감사절'],['2028-12-25','성탄절'],
];
/** Early closes at 13:00 ET (options 13:15). */
export const NYSE_EARLY_CLOSES:ReadonlyArray<readonly [string,string]>=[
  ['2026-11-27','추수감사절 다음 날'],['2026-12-24','성탄절 전날'],['2027-11-26','추수감사절 다음 날'],['2028-07-03','독립기념일 전날'],['2028-11-24','추수감사절 다음 날'],
];
export const NYSE_COVERAGE={from:'2026-01-01',to:'2028-12-31'};

export interface OfficialScheduleItem {
  /** Calendar date in the institution's own zone (KST for BOK, ET for NYSE). */
  date:string;
  kind:'BOK_MPC'|'NYSE_HOLIDAY'|'NYSE_EARLY_CLOSE';
  koreanTitle:string;
  /** For an early close: the 13:00 ET close in KST, e.g. '11/28(토) 03:00'. */
  kstClose:string|null;
}
export interface OfficialSchedule {items:OfficialScheduleItem[];uncovered:Array<{source:'BOK_MPC'|'NYSE';from:string;to:string}>}

const inRange=(date:string,range:{from:string;to:string})=>date>=range.from&&date<=range.to;
const WEEKDAY=['일','월','화','수','목','금','토'];
export const shortKstDay=(date:string)=>{const d=new Date(`${date}T00:00:00Z`);return `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}(${WEEKDAY[d.getUTCDay()]})`};

/** Offset of America/New_York from UTC in hours on that date at 13:00 local (−5 standard, −4 daylight). */
export function newYorkOffsetHours(date:string):number {
  // Try both offsets and keep the one whose instant reads back as 13:00 in New York.
  for(const offset of [-4,-5]){
    const instant=new Date(Date.parse(`${date}T13:00:00Z`)-offset*3600000);
    const hour=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(instant);
    if(Number(hour)===13)return offset;
  }
  throw new Error(`NEW_YORK_OFFSET_UNRESOLVED ${date}`);
}
/** 13:00 ET on that date, in KST ('11/28(토) 03:00'). */
export function earlyCloseKst(date:string):string {
  const instant=Date.parse(`${date}T13:00:00Z`)-newYorkOffsetHours(date)*3600000,kst=new Date(instant+9*3600000).toISOString();
  return `${shortKstDay(kst.slice(0,10))} ${kst.slice(11,16)}`;
}

/** Official schedule items whose date falls in [from, to] (inclusive), plus the parts of that range no table covers. */
export function officialSchedule(from:string,to:string):OfficialSchedule {
  const items:OfficialScheduleItem[]=[],uncovered:OfficialSchedule['uncovered']=[];
  const check=(source:'BOK_MPC'|'NYSE',range:{from:string;to:string})=>{
    if(from<range.from)uncovered.push({source,from,to:to<range.from?to:prevDay(range.from)});
    if(to>range.to)uncovered.push({source,from:from>range.to?from:nextDay(range.to),to});
  };
  check('BOK_MPC',BOK_MPC_COVERAGE);check('NYSE',NYSE_COVERAGE);
  for(const date of BOK_MPC_DATES)if(date>=from&&date<=to&&inRange(date,BOK_MPC_COVERAGE))items.push({date,kind:'BOK_MPC',koreanTitle:'한은 금통위 기준금리 결정',kstClose:null});
  for(const [date,name] of NYSE_HOLIDAYS)if(date>=from&&date<=to)items.push({date,kind:'NYSE_HOLIDAY',koreanTitle:`뉴욕증시 휴장(${name})`,kstClose:null});
  for(const [date,name] of NYSE_EARLY_CLOSES)if(date>=from&&date<=to)items.push({date,kind:'NYSE_EARLY_CLOSE',koreanTitle:`뉴욕증시 조기 마감(${name}, 현지 13:00)`,kstClose:earlyCloseKst(date)});
  items.sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind));
  return {items,uncovered};
}
function nextDay(date:string):string {return new Date(Date.parse(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10)}
function prevDay(date:string):string {return new Date(Date.parse(`${date}T00:00:00Z`)-86400000).toISOString().slice(0,10)}
