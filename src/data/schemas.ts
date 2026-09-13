import { paths, statuses } from '../domain/models.js';
export interface Schema { type?: string; enum?: readonly unknown[]; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean|Schema; items?: Schema; anyOf?: Schema[]; format?: string; minimum?: number; maximum?: number; minLength?: number }
const str: Schema = { type: 'string', minLength: 1 };
const bool: Schema = { type: 'boolean' };
const num: Schema = { type: 'number' };
const date: Schema = { type: 'string', format: 'date' };
const time: Schema = { type: 'string', format: 'date-time' };
const url: Schema = { type: 'string', format: 'uri' };
const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] });
const enumeration = (...values: readonly string[]): Schema => ({ type: 'string', enum: values });
const array = (items: Schema): Schema => ({ type: 'array', items });
const object = (properties: Record<string, Schema>, optional: string[]=[]): Schema => ({ type: 'object', properties, required: Object.keys(properties).filter(key=>!optional.includes(key)), additionalProperties: false });
const fieldProvenance = { type: 'object', additionalProperties: object({ sourceId: str, sourceUrl: url, observedAt: time, collectedAt: time }) } satisfies Schema;
const base = { id: str, sample: bool, sourceId: str, sourceUrl: url, observedAt: time, collectedAt: time, unit: str, status: enumeration(...statuses), missingReasons: { type: 'object', additionalProperties: str } satisfies Schema, collectionMode: enumeration('SAMPLE_FIXTURE','MANUAL_VERIFIED','API'), verificationUrls: array(url), fieldProvenance };
export const entitySchemas = {
  MarketSnapshot: object({ ...base, market: enumeration('US'), tradingDate: date, symbol: str, instrumentType: enumeration('INDEX','EQUITY','FX','YIELD','COMMODITY'), close: nullable(num), previousClose: nullable(num), change: nullable(num), changePct: nullable(num), volume: nullable({type:'number',minimum:0}), currency: {type:'string',format:'currency'} },['collectionMode','verificationUrls','fieldProvenance']),
  MacroRelease: object({ ...base, indicatorId: str, indicatorName: str, releaseTime: time, period: str, actual: nullable(num), consensus: nullable(num), previous: nullable(num), revisedPrevious: nullable(num), adjustmentType: enumeration('SA','NSA','UNKNOWN') },['collectionMode','verificationUrls','fieldProvenance']),
  CompanyEvent: object({ ...base, companyId: str, ticker: str, eventType: str, eventTime: time, title: str, summary: str, primarySourceUrl: url },['collectionMode','verificationUrls','fieldProvenance']),
  FilingRecord: object({ ...base, companyId: str, ticker: str, formType: str, accessionNumber: str, filedAt: time, period: str, extractedFacts: array(str), cik: str, companyName: str, primaryDocument: str, filingUrl: url, acceptedAt: time, filedDate: date, timestampPrecision: enumeration('DATE','ACCEPTED_TIMESTAMP') },['collectionMode','verificationUrls','fieldProvenance','cik','companyName','primaryDocument','filingUrl','acceptedAt','filedDate','timestampPrecision']),
  NewsReference: object({ ...base, title: str, publisher: str, publishedAt: time, url, relatedTickers: array(str), relatedIndustries: array(str), verifiedFacts: array(str), sourceTier: enumeration('A','B','C'), usedInReport: bool },['collectionMode','verificationUrls','fieldProvenance']),
};
export const signalSchema = object({ id: str, eventId: str, trigger: str, usIndustry: str, usCompany: str, macroConditions: array(str), evidenceIds: array(str), counterFactors: array(str), driverStatement: str },['driverStatement']);
export const inputSchema = object({ schemaVersion: enumeration('1.0'), sample: bool, tradingDate: date, asOf: time,
  session: object({ status: enumeration('OK','HOLIDAY','EARLY_CLOSE'), closeAt: time, sourceId: str, sourceUrl: url }),
  market: array(entitySchemas.MarketSnapshot), macro: array(entitySchemas.MacroRelease), companyEvents: array(entitySchemas.CompanyEvent), filings: array(entitySchemas.FilingRecord), news: array(entitySchemas.NewsReference), signals: array(signalSchema), koreaContext: object({ calendar: array(str), counterFactors: array(str) }) });
export const sourceSchema = object({ sourceId: str, name: str, category: str, official: bool, priority: {type:'number',minimum:1}, authenticationType: str, rateLimit: str, latency: str, redistributionStatus: enumeration('UNKNOWN'), commercialUseStatus: enumeration('UNKNOWN'), enabled: bool, notes: str, homepage: url, maxAgeMinutes: {type:'number',minimum:1}, connectionStatus: enumeration(...statuses), verificationTier: enumeration('A','B','C','D') },['verificationTier']);
export const ruleSchema = object({ ruleId: str, ruleVersion: str, trigger: str, usIndustry: str, usCompany: array(str), macroCondition: array(str), transmissionPath: enumeration(...paths), koreaIndustry: str, koreaCompanyCandidate: array(str), direction: enumeration('POSITIVE','NEGATIVE','MIXED','HOLD'), baseStrength: {type:'number',minimum:1,maximum:5}, evidenceRequirements: object({ minimumSources: {type:'number',minimum:1}, primaryRequired: bool }), counterFactors: array(str), validityHorizon: enumeration('INTRADAY','SHORT_TERM','MEDIUM_TERM') });
export function schemaErrors(value: unknown, schema: Schema, path = '$'): string[] {
  if (schema.anyOf) return schema.anyOf.some(s => schemaErrors(value,s,path).length === 0) ? [] : [`${path}: 허용 타입 불일치`];
  const errors: string[] = [];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && actual !== schema.type) return [`${path}: ${schema.type} 필수`];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: 허용값 불일치`);
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) errors.push(`${path}: 수치 범위 오류`);
  if (typeof value === 'string') {
    if (value.trim().length < (schema.minLength ?? 0)) errors.push(`${path}: 빈 문자열`);
    if (schema.format === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) errors.push(`${path}: 날짜 오류`);
    if (schema.format === 'date-time') {
      const part = value.slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)) || schemaErrors(part,date).length) errors.push(`${path}: 시간대가 있는 ISO 시각 필수`);
    }
    if (schema.format === 'currency' && !/^[A-Z]{3}$/.test(value)) errors.push(`${path}: 3자리 통화 코드 필수`);
    if (schema.format === 'uri') { try { if (!['https:','http:'].includes(new URL(value).protocol)) errors.push(`${path}: HTTP(S) URL 필수`); } catch { errors.push(`${path}: URL 오류`); } }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v,i) => errors.push(...schemaErrors(v,schema.items!,`${path}[${i}]`)));
  if (actual === 'object') {
    const obj = value as Record<string,unknown>;
    for (const key of schema.required ?? []) if (!(key in obj)) errors.push(`${path}.${key}: 필수 필드 누락`);
    for (const [key,v] of Object.entries(obj)) {
      const child = schema.properties?.[key];
      if (child) errors.push(...schemaErrors(v,child,`${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: 미등록 필드`);
      else if (typeof schema.additionalProperties === 'object') errors.push(...schemaErrors(v,schema.additionalProperties,`${path}.${key}`));
    }
  }
  return errors;
}
