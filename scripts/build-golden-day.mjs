import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { BlsCpiAdapter, SecEdgarAdapter, TreasuryYieldAdapter } from '../dist/src/data/adapters.js';
import sources from '../config/sources.json' with { type: 'json' };

const tradingDate = '2026-09-11';
const collectedAt = '2026-09-13T08:30:11Z';
const root = `data/golden/${tradingDate}`;
const treasuryCsv = 'Date,2 Yr,10 Yr\n09/10/2026,4.56,4.95\n09/11/2026,4.63,4.96\n';
const blsPayload = {
  status: 'REQUEST_SUCCEEDED',
  Results: {
    series: [{
      seriesID: 'CUSR0000SA0',
      data: [
        { year: '2026', period: 'M08', periodName: 'August', latest: 'true', value: '334.131', footnotes: [{}] },
        { year: '2026', period: 'M07', periodName: 'July', value: '332.813', footnotes: [{}] },
        { year: '2026', period: 'M06', periodName: 'June', value: '332.568', footnotes: [{}] }
      ]
    }]
  }
};
const secPayload = {
  name: 'ORACLE CORP',
  tickers: ['ORCL', 'ORCL-PD'],
  filings: {
    recent: {
      accessionNumber: ['0001193125-26-387905'],
      form: ['8-K'],
      filingDate: ['2026-09-10'],
      reportDate: ['2026-09-10'],
      primaryDocument: ['orcl-20260910.htm']
    }
  }
};

const source = id => sources.find(item => item.sourceId === id);
const treasury = await new TreasuryYieldAdapter(async () => ({ ok: true, status: 200, text: async () => treasuryCsv })).collect(source('US_TREASURY'), {
  tradingDate,
  observedAt: '2026-09-11T19:30:00Z',
  collectedAt,
  recordIds: { US2Y: 'US2Y-2026-09-11', US10Y: 'US10Y-2026-09-11' }
});
const bls = await new BlsCpiAdapter(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(blsPayload) })).collect(source('BLS'), {
  tradingDate,
  observedAt: '2026-09-11T12:30:00Z',
  collectedAt,
  period: '2026-08',
  releaseTime: '2026-09-11T12:30:00Z',
  recordId: 'CPI-MOM-2026-08'
});
const sec = await new SecEdgarAdapter(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(secPayload) }), 0).collect(source('SEC_EDGAR'), {
  tradingDate,
  observedAt: '2026-09-10T20:16:50Z',
  collectedAt,
  cik: '1341439',
  ticker: 'ORCL',
  companyId: 'ORACLE',
  companyName: 'Oracle Corporation',
  forms: ['8-K'],
  accessionNumber: '0001193125-26-387905',
  recordId: 'ORCL-8K-2026-09-10'
});

if (treasury.status !== 'OK' || bls.status !== 'OK' || sec.status !== 'OK') {
  throw new Error(`Golden adapters failed: ${treasury.status}, ${bls.status}, ${sec.status}`);
}

const manual = JSON.parse(await readFile(`data/manual/${tradingDate}/input.json`, 'utf8'));
const apiInput = structuredClone(manual);
apiInput.asOf = collectedAt;
apiInput.market = apiInput.market.map(record => treasury.records.find(api => api.symbol === record.symbol) ?? record);
apiInput.macro = apiInput.macro.map(record => record.id === 'CPI-MOM-2026-08' ? bls.records[0] : record);
apiInput.filings = apiInput.filings.map(record => record.accessionNumber === '0001193125-26-387905' ? sec.records[0] : record);

const bySymbol = symbol => manual.market.find(record => record.symbol === symbol);
const apiBySymbol = symbol => apiInput.market.find(record => record.symbol === symbol);
const manualCpi = manual.macro.find(record => record.id === 'CPI-MOM-2026-08');
const apiCpi = apiInput.macro.find(record => record.id === 'CPI-MOM-2026-08');
const manualFiling = manual.filings.find(record => record.accessionNumber === '0001193125-26-387905');
const apiFiling = apiInput.filings.find(record => record.accessionNumber === '0001193125-26-387905');
const comparison = [
  compare('US2Y close', bySymbol('US2Y')?.close, apiBySymbol('US2Y')?.close),
  compare('US10Y close', bySymbol('US10Y')?.close, apiBySymbol('US10Y')?.close),
  compare('CPI-MOM actual', manualCpi?.actual, apiCpi?.actual),
  compare('CPI-MOM previous', manualCpi?.previous, apiCpi?.previous),
  compare('CPI-MOM consensus', manualCpi?.consensus, apiCpi?.consensus, 'EXPECTED_SEPARATION'),
  compare('SEC accessionNumber', manualFiling?.accessionNumber, apiFiling?.accessionNumber),
  compare('SEC filedAt', manualFiling?.filedAt, apiFiling?.filedAt, manualFiling?.filedAt === apiFiling?.filedAt ? 'MATCH' : 'REVIEW_REQUIRED')
];

function compare(field, manualValue, adapterValue, forcedStatus) {
  const numeric = typeof manualValue === 'number' && typeof adapterValue === 'number';
  const difference = numeric ? Number((adapterValue - manualValue).toFixed(8)) : null;
  const status = forcedStatus ?? (manualValue === adapterValue || difference === 0 ? 'MATCH' : 'REVIEW_REQUIRED');
  return { field, manualValue, adapterValue, difference, status };
}

await mkdir(root, { recursive: true });
await writeFile(`${root}/source-raw.json`, JSON.stringify({ tradingDate, treasuryCsv, blsPayload, secPayload }, null, 2));
await writeFile(`${root}/expected-normalized.json`, JSON.stringify({ tradingDate, treasury: treasury.records, bls: bls.records, sec: sec.records }, null, 2));
await writeFile(`${root}/comparison.json`, JSON.stringify({ tradingDate, generatedAt: collectedAt, rows: comparison }, null, 2));
await writeFile(`data/manual/${tradingDate}/input-api.json`, `${JSON.stringify(apiInput, null, 2)}\n`);
console.log(JSON.stringify({ status: 'PASS', input: `data/manual/${tradingDate}/input-api.json`, comparisonRows: comparison.length }, null, 2));
