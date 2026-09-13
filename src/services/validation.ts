import type { InputBundle, Issue, Provenance, Source, Status, ValidationResult } from '../domain/models.js';
import { entitySchemas, inputSchema, schemaErrors } from '../data/schemas.js';
import { marketChange } from '../utils/calculations.js';
export const groups = ['market','macro','companyEvents','filings','news'] as const;
export const records = (input: InputBundle): Provenance[] => groups.flatMap<Provenance>(key => input[key]);
const schemaNames = ['MarketSnapshot','MacroRelease','CompanyEvent','FilingRecord','NewsReference'] as const;
const severity: Status[] = ['BLOCKED','INVALID_VALUE','CONFLICT','SOURCE_UNAVAILABLE','DATA_NOT_CONNECTED','NO_DATA','DELAYED','LOW_CONFIDENCE','REVIEW_REQUIRED','HOLIDAY','EARLY_CLOSE','OK'];
export const worst = (values: Status[]): Status => severity.find(s => values.includes(s)) ?? 'OK';
const nyDate = (time: string) => new Intl.DateTimeFormat('en-CA',{ timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(time));
export function normalize(raw: unknown): { input: InputBundle|null; issues: Issue[] } {
  // Validate envelope independently; malformed individual records are retained as evidence and quarantined later.
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {input:null,issues:[{recordId:'input',field:'$',status:'BLOCKED',message:'입력은 객체여야 합니다.'}]};
  const envelope = structuredClone(raw) as Record<string,unknown>;
  for (const group of groups) if (Array.isArray(envelope[group])) envelope[group] = [];
  const errors = schemaErrors(envelope,inputSchema);
  if (errors.length) return {input:null,issues:errors.map(message => ({recordId:'input',field:'$',status:'BLOCKED',message}))};
  return {input:structuredClone(raw) as InputBundle,issues:[]};
}
export function validate(input: InputBundle, sources: Source[]): ValidationResult {
  const issues: Issue[] = []; const excluded = new Set<string>();
  const add = (id:string, field:string,status:Status,message:string,exclude=true) => { issues.push({recordId:id,field,status,message}); if(exclude) excluded.add(id); };
  const sourceMap = new Map(sources.map(s => [s.sourceId,s]));
  const sessionSource = sourceMap.get(input.session.sourceId);
  if (!sessionSource) add('session','sourceId','SOURCE_UNAVAILABLE','거래일 출처 미등록');
  else if (!sessionSource.official) add('session','sourceId','LOW_CONFIDENCE','거래일 출처가 공식 출처가 아닙니다.');
  if (nyDate(input.session.closeAt) !== input.tradingDate) add('session','closeAt','INVALID_VALUE','미국 동부 기준 거래일 불일치');
  if (Date.parse(input.asOf) < Date.parse(input.session.closeAt) && input.session.status !== 'HOLIDAY') add('session','closeAt','BLOCKED','정규장 마감 전 입력');
  if (!input.sample && input.session.sourceId.startsWith('SAMPLE')) add('session','sample','BLOCKED','샘플 출처를 실제 입력에 사용할 수 없습니다.');
  const seenIds = new Map<string,string>(); const business = new Map<string,{id:string;value:string}>();
  groups.forEach((group,index) => {
    for (const [position, raw] of input[group].entries()) {
      const id = raw && typeof raw === 'object' && typeof raw.id === 'string' ? raw.id : `${group}[${position}]`;
      const errors = schemaErrors(raw,entitySchemas[schemaNames[index]!]);
      if (errors.length) { errors.forEach(e => add(id,'schema','INVALID_VALUE',e)); continue; }
      const r = raw as Provenance; const fields = r as unknown as Record<string,unknown>;
      const serialized = JSON.stringify(r);
      if (seenIds.has(id)) add(id,'id',seenIds.get(id) === serialized ? 'REVIEW_REQUIRED':'CONFLICT','중복 식별자: 모든 해당 ID 제외');
      seenIds.set(id,serialized);
      const source = sourceMap.get(r.sourceId);
      if (!source) add(id,'sourceId','SOURCE_UNAVAILABLE','미등록 출처');
      else {
        if (!source.official) add(id,'sourceId','LOW_CONFIDENCE','비공식 출처: 교차 검수 필요');
        if (!input.sample && r.sourceId.startsWith('SAMPLE')) add(id,'sourceId','BLOCKED','샘플 전용 출처');
        if (Date.parse(input.asOf) - Date.parse(r.observedAt) > source.maxAgeMinutes * 60000) add(id,'observedAt','DELAYED','출처별 내부 최신성 기준 초과');
      }
      if (r.sample !== input.sample) add(id,'sample','BLOCKED','샘플/실제 혼합 금지');
      if (!input.sample && r.collectionMode !== 'MANUAL_VERIFIED' && r.collectionMode !== 'API') add(id,'collectionMode','BLOCKED','실데이터는 MANUAL_VERIFIED 또는 API 수집 모드가 필수입니다.');
      if (r.collectionMode === 'MANUAL_VERIFIED' && (!r.verificationUrls || r.verificationUrls.length === 0)) add(id,'verificationUrls','BLOCKED','수동 검증 데이터는 확인 URL이 한 개 이상 필요합니다.');
      if (!input.sample && (['id','symbol','ticker','companyId','indicatorId'].some(k=>typeof fields[k]==='string'&&(fields[k] as string).startsWith('SAMPLE')) || new URL(r.sourceUrl).hostname.endsWith('.invalid'))) add(id,'sample','BLOCKED','가상 식별자 또는 예시 URL을 실제 입력에 사용할 수 없습니다.');
      if (r.status !== 'OK') add(id,'status',r.status,'입력 상태 유지');
      if (Date.parse(r.collectedAt) < Date.parse(r.observedAt) || Date.parse(r.collectedAt) > Date.parse(input.asOf)) add(id,'collectedAt','INVALID_VALUE','관측 ≤ 수집 ≤ 분석시각 위반');
      for (const [field,value] of Object.entries(fields)) if(value === null) {
        if (!r.missingReasons[field]) add(id,field,'INVALID_VALUE','값 부재 사유 필수');
        else if(field!=='volume') add(id,field,'NO_DATA',r.missingReasons[field]!,['close','previousClose','actual'].includes(field));
      }
      for (const field of ['releaseTime','eventTime','filedAt','publishedAt']) if(typeof fields[field] === 'string' && Date.parse(fields[field]) > Date.parse(input.asOf)) add(id,field,'INVALID_VALUE','미래 자료 사용 금지');
      let key: string = group;
      let payload: unknown = fields;
      if (group === 'market') {
        const m = raw as InputBundle['market'][number];
        key += `:${m.market}:${m.symbol}:${m.tradingDate}`; payload = [m.close,m.previousClose,m.volume,m.currency,m.unit];
        if(m.tradingDate !== input.tradingDate || nyDate(m.observedAt) !== input.tradingDate) add(id,'tradingDate','INVALID_VALUE','거래일 불일치');
        if(Date.parse(m.observedAt)>Date.parse(input.asOf)) add(id,'observedAt','INVALID_VALUE','분석 기준시각 이후 시장값 사용 금지');
        const units = {INDEX:'points',EQUITY:'price',FX:'rate',YIELD:'percent',COMMODITY:'price'};
        if(m.unit !== units[m.instrumentType]) add(id,'unit','INVALID_VALUE','상품 유형과 단위 불일치');
        if(m.currency !== 'USD' && m.currency !== 'KRW' && m.currency !== 'JPY' && m.currency !== 'EUR' && m.currency !== 'GBP' && m.currency !== 'CHF' && m.currency !== 'CAD' && m.currency !== 'AUD') add(id,'currency','INVALID_VALUE','지원하지 않는 통화');
        if(m.close !== null && m.previousClose !== null) {
          const c = marketChange(m.close,m.previousClose);
          if(c.status !== 'OK') add(id,'previousClose','INVALID_VALUE','전일값 0 또는 비유한 수치');
          else {
            if(m.change !== null && Math.abs(m.change-c.raw.change) > 1e-8) add(id,'change','CONFLICT','전일 대비 계산 불일치');
            if(m.changePct !== null && Math.abs(m.changePct-c.display.changePct) > 1e-8) add(id,'changePct','CONFLICT','등락률 소수점 2자리 재계산 불일치');
          }
        }
      } else if(group === 'macro') { key += `:${fields.indicatorId}:${fields.period}:${fields.releaseTime}`; payload=[fields.actual,fields.consensus,fields.previous,fields.revisedPrevious,fields.unit,fields.adjustmentType]; }
      else if(group === 'companyEvents') {key += `:${fields.companyId}:${fields.eventType}:${fields.eventTime}`;payload=[fields.title,fields.summary];}
      else if(group === 'filings') {key += `:${fields.accessionNumber}`;payload=fields.extractedFacts;}
      else {key += `:${fields.url}`;payload=fields.verifiedFacts;}
      const previous = business.get(key); const value = JSON.stringify(payload);
      if(previous) {
        if(previous.value === value) add(id,'duplicate','REVIEW_REQUIRED','동일 자연키/값 중복: 후속 레코드 제외');
        else {add(id,'conflict','CONFLICT','동일 자연키의 원본값 충돌');add(previous.id,'conflict','CONFLICT','충돌 상대 레코드 존재');}
      } else business.set(key,{id,value});
    }
  });
  if(input.session.status === 'HOLIDAY') {
    if(input.market.length) input.market.forEach((r,i) => add(r?.id??`market[${i}]`,'session','CONFLICT','휴장일 시세 입력'));
    issues.push({recordId:'session',field:'status',status:'HOLIDAY',message:'수동 입력 휴장일. 거래 일정 자동 연동 없음.'});
  } else if(input.session.status === 'EARLY_CLOSE') issues.push({recordId:'session',field:'status',status:'EARLY_CLOSE',message:'입력된 조기 마감시각으로 검증'});
  if(!input.market.length && input.session.status !== 'HOLIDAY') add('market','records','NO_DATA','미국시장 마감 데이터 없음');
  return {status:worst(issues.map(i=>i.status)),issues,excludedIds:[...excluded]};
}
