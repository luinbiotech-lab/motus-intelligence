import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GoogleBloggerApiAdapter,type BloggerPublishingConfig} from '../src/services/blogger.js';
import {appendPublishLedger,findPublishedSameSession,readPublishLedger} from '../src/production/publication-operation.js';

const config:BloggerPublishingConfig={previewBaseUrl:'https://preview.local',placeholderBaseUrl:'https://pending.local',blogId:'blog',credentialEnvironmentVariable:'TOKEN',publisher:{brand:'MOTUS',displayName:'MOTUS | What Moves the World',baseUrl:'https://motusnova.blogspot.com/',ctaText:'전체 분석은 MOTUS에서 확인하세요',categories:['Daily Market']}};

function adapterWith(posts:Array<Record<string,unknown>>){
  const responses=[{items:[]},{items:posts}];
  const fakeFetch=async()=>new Response(JSON.stringify(responses.shift()??{items:[]}),{status:200,headers:{'content-type':'application/json'}});
  return new GoogleBloggerApiAdapter(name=>name==='TOKEN'?'access':undefined,fakeFetch);
}

test('remote duplicate check matches an existing post for the same session even under a different title and operation date',async()=>{
  // Manual close edition published on 2026-10-19 for session 2026-10-19; next-morning edition runs on 2026-10-20 for the same session.
  const adapter=adapterWith([{id:'p1',title:'국내증시 마감: 업종 흐름과 다음 거래일 체크포인트',content:'<article><p>2026-10-19 국내증시 마감은 KOSPI ...</p></article>',status:'LIVE',labels:['국내증시'],url:'https://motusnova.blogspot.com/2026/10/kbi.html',published:'2026-10-19T23:01:51+09:00'}]);
  const matches=await adapter.findMatchingPosts({title:'수급과 업종 흐름으로 읽는 전일 국내증시',label:'국내증시',operationDate:'2026-10-20',sessionDate:'2026-10-19'},config);
  assert.equal(matches.length,1);assert.equal(matches[0]?.status,'PUBLISHED');
});

test('remote duplicate check does not flag a post that only covers an older session',async()=>{
  const adapter=adapterWith([{id:'p0',title:'Dow Jones 하락, 미국 주요 지수 동반 하락',content:'<article><p>2026-10-22 대비 2026-10-23 마감</p></article>',status:'LIVE',labels:['미국증시'],url:'https://motusnova.blogspot.com/2026/10/dow-jones.html',published:'2026-10-25T22:13:35+09:00'}]);
  const matches=await adapter.findMatchingPosts({title:'S&P 500 상승, 주요 지수 반등',label:'미국증시',operationDate:'2026-10-27',sessionDate:'2026-10-26'},config);
  assert.equal(matches.length,0);
});

test('ledger guard finds a published operation covering the same session under another operation date',async()=>{
  const root=await mkdtemp(join(tmpdir(),'motus-ledger-'));
  try{
    const legacy=join(root,'2026-10-19','korea');await mkdir(legacy,{recursive:true});
    await writeFile(join(legacy,'live-unit.json'),JSON.stringify({observedDate:'2026-10-19'}),'utf8');
    await appendPublishLedger(legacy,{identity:'2026-10-19|KOREA_MARKET',operationDate:'2026-10-19',category:'KOREA_MARKET',at:'2026-10-19T14:01:51Z',event:'PUBLISHED',postId:'p1',publicPostUrl:'https://motusnova.blogspot.com/2026/10/kbi.html',fingerprint:'sha256:x',detail:'legacy entry without sessionDate'});
    const legacyEntries=await readPublishLedger(legacy);assert.equal(legacyEntries[0]?.sessionDate,undefined);
    const hit=await findPublishedSameSession(root,'korea','KOREA_MARKET','2026-10-19');
    assert.deepEqual(hit,{operationDate:'2026-10-19',postId:'p1',publicPostUrl:'https://motusnova.blogspot.com/2026/10/kbi.html'});
    assert.equal(await findPublishedSameSession(root,'korea','KOREA_MARKET','2026-10-20'),null);
    assert.equal(await findPublishedSameSession(root,'us','US_MARKET','2026-10-19'),null);

    // A rerun that overwrote live-unit.json with a newer session must still be caught through the recorded sessionDate.
    const modern=join(root,'2026-10-25','us');await mkdir(modern,{recursive:true});
    await appendPublishLedger(modern,{identity:'2026-10-25|US_MARKET',operationDate:'2026-10-25',sessionDate:'2026-10-23',category:'US_MARKET',at:'2026-10-25T13:13:35Z',event:'PUBLISHED',postId:'p2',publicPostUrl:'https://motusnova.blogspot.com/2026/10/dow-jones.html',fingerprint:'sha256:y',detail:'published'});
    await writeFile(join(modern,'live-unit.json'),JSON.stringify({observedDate:'2026-10-26'}),'utf8');
    assert.equal((await findPublishedSameSession(root,'us','US_MARKET','2026-10-23'))?.postId,'p2');
    assert.equal(await findPublishedSameSession(root,'us','US_MARKET','2026-10-26'),null);

    // Non-published attempts never count as a duplicate.
    const held=join(root,'2026-10-26','us');await mkdir(held,{recursive:true});
    await appendPublishLedger(held,{identity:'2026-10-26|US_MARKET',operationDate:'2026-10-26',sessionDate:'2026-10-26',category:'US_MARKET',at:'2026-10-26T00:00:00Z',event:'GATE_HOLD',postId:null,publicPostUrl:null,fingerprint:'sha256:z',detail:'hold'});
    assert.equal(await findPublishedSameSession(root,'us','US_MARKET','2026-10-26'),null);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('ledger guard tolerates a missing operations root',async()=>{
  assert.equal(await findPublishedSameSession(join(tmpdir(),'motus-missing-root-'+Date.now()),'us','US_MARKET','2026-10-23'),null);
});
