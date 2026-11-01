import test from 'node:test';
import assert from 'node:assert/strict';
import { KrxBokOfficialSourceAdapter } from '../src/operations/korea-official.js';
import { NaverDataLabProvider } from '../src/search/providers.js';
test('KRX requests go to the data host, and an unapproved key is reported with the provider message', async () => {
    const urls = [];
    const fetcher = (async (input) => { urls.push(String(input)); return new Response(JSON.stringify({ respMsg: 'Unauthorized API Call', respCode: '401' }), { status: 401, headers: { 'content-type': 'application/json' } }); });
    const result = await new KrxBokOfficialSourceAdapter(fetcher, { KRX_AUTH_KEY: 'k' }).fetch('2026-10-27', '2026-10-28T09:00:00+09:00');
    assert.ok(urls[0].startsWith('https://data-dbg.krx.co.kr/svc/apis/idx/kospi_dd_trd?basDd=20261027'), String(urls[0]));
    assert.equal(result.requiredProviderAvailable, false);
    assert.equal(result.reasonCode, 'KRX_HTTP_401:Unauthorized_API_Call');
    assert.ok(!JSON.stringify(result).includes('openapi.krx.co.kr'));
});
test('KRX returning no rows for the date (not yet published) is distinguished from a missing index row', async () => {
    const fetcher = (async () => new Response(JSON.stringify({ OutBlock_1: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await new KrxBokOfficialSourceAdapter(fetcher, { KRX_AUTH_KEY: 'k' }).fetch('2026-10-27', '2026-10-28T06:17:00+09:00');
    assert.equal(result.reasonCode, 'KRX_KOSPI_NO_ROWS_FOR_DATE');
});
test('Naver API HUB authentication failure carries the gateway error code and never the credentials', async () => {
    let headers;
    const fetcher = (async (_input, init) => { headers = new Headers(init?.headers); return new Response(JSON.stringify({ error: { errorCode: '200', message: 'Authentication Failed', details: 'Invalid authentication information.' } }), { status: 401, headers: { 'content-type': 'application/json' } }); });
    const provider = new NaverDataLabProvider({ startDate: '2026-10-01', endDate: '2026-10-12', timeUnit: 'date', keywordGroups: [{ groupName: 'AI 인프라', keywords: ['AI 데이터센터'] }] }, { clientId: ' id-value ', clientSecret: 'secret-value\n' }, fetcher);
    await assert.rejects(provider.collect([{ label: 'AI 인프라', aliases: [] }], '2026-10-28T00:00:00Z'), (error) => { assert.equal(error.message, 'NAVER_DATALAB_HTTP_401:200'); assert.ok(!error.message.includes('secret')); return true; });
    assert.equal(headers.get('X-NCP-APIGW-API-KEY-ID'), 'id-value');
    assert.equal(headers.get('X-NCP-APIGW-API-KEY'), 'secret-value');
});
test('provider messages that reflect the submitted key are never recorded', async () => {
    const key = '0123456789ABCDEF0123456789ABCDEF01234567';
    const krx = (async () => new Response(JSON.stringify({ respMsg: `Invalid AUTH_KEY ${key}`, respCode: '401' }), { status: 401 }));
    const result = await new KrxBokOfficialSourceAdapter(krx, { KRX_AUTH_KEY: key }).fetch('2026-10-27', '2026-10-28T09:00:00+09:00');
    assert.equal(result.reasonCode, 'KRX_HTTP_401');
    assert.ok(!JSON.stringify(result).includes(key.slice(0, 8)));
    const naver = (async () => new Response(JSON.stringify({ error: { errorCode: key, message: key } }), { status: 401 }));
    const provider = new NaverDataLabProvider({ startDate: '2026-10-01', endDate: '2026-10-12', timeUnit: 'date', keywordGroups: [{ groupName: 'AI 인프라', keywords: ['AI 데이터센터'] }] }, { clientId: key, clientSecret: key }, naver);
    await assert.rejects(provider.collect([{ label: 'AI 인프라', aliases: [] }], '2026-10-28T00:00:00Z'), (error) => { assert.equal(error.message, 'NAVER_DATALAB_HTTP_401'); return true; });
});
