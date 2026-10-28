// Prints only HTTP status, provider error codes/messages and credential *shape* (length, charset, whitespace). Secret values are redacted.
const id=process.env.NAVER_ID??'',secret=process.env.NAVER_SECRET??'',krx=process.env.KRX_KEY??'';
const secrets=[id,secret,krx,id.trim(),secret.trim(),krx.trim()].filter(v=>v.length>=4);
const redact=s=>{for(const v of secrets)s=s.split(v).join('[REDACTED]');return s};
const note=(label,obj)=>console.log(`::notice title=${label}::${redact(typeof obj==='string'?obj:JSON.stringify(obj)).replace(/\r?\n/g,' ').slice(0,900)}`);
const shape=v=>({len:v.length,trimmedLen:v.trim().length,leadingOrTrailingWhitespace:v!==v.trim(),hasNewline:/[\r\n]/.test(v),hasInnerSpace:/\s/.test(v.trim()),hasQuote:/["']/.test(v),charset:[/[a-z]/.test(v)&&'lower',/[A-Z]/.test(v)&&'upper',/[0-9]/.test(v)&&'digit',/[^A-Za-z0-9]/.test(v.trim())&&'symbol'].filter(Boolean).join('+'),hexOnly:/^[0-9a-fA-F]+$/.test(v.trim())});
async function call(label,url,init){
  try{const r=await fetch(url,{...init,signal:AbortSignal.timeout(15000)}),body=await r.text();let j=null;try{j=JSON.parse(body)}catch{}
    const summary={status:r.status,contentType:r.headers.get('content-type'),wwwAuth:r.headers.get('www-authenticate'),rows:Array.isArray(j?.OutBlock_1)?j.OutBlock_1.length:undefined,results:Array.isArray(j?.results)?j.results.length:undefined,items:Array.isArray(j?.items)?j.items.length:undefined,body:r.ok?undefined:body.slice(0,400)};
    note(label,summary);return r.status}
  catch(e){note(label,{networkError:String(e?.cause?.code??e?.message??e)});return null}
}
const mode=process.argv[2];
if(mode==='shape')note('credential-shape',{naverId:shape(id),naverSecret:shape(secret),krx:shape(krx),idEqualsSecret:id.trim()===secret.trim()});
if(mode==='naver'){
  const I=id.trim(),S=secret.trim(),body=JSON.stringify({startDate:'2026-10-20',endDate:'2026-10-27',timeUnit:'date',keywordGroups:[{groupName:'코스피',keywords:['코스피']}]});
  await call('hub-search-trend',`https://naverapihub.apigw.ntruss.com/search-trend/v1/search`,{method:'POST',headers:{'Content-Type':'application/json','X-NCP-APIGW-API-KEY-ID':I,'X-NCP-APIGW-API-KEY':S},body});
  await call('hub-news-search',`https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent('코스피')}&display=1`,{headers:{'X-NCP-APIGW-API-KEY-ID':I,'X-NCP-APIGW-API-KEY':S}});
  await call('hub-search-trend-swapped',`https://naverapihub.apigw.ntruss.com/search-trend/v1/search`,{method:'POST',headers:{'Content-Type':'application/json','X-NCP-APIGW-API-KEY-ID':S,'X-NCP-APIGW-API-KEY':I},body});
  await call('legacy-datalab',`https://openapi.naver.com/v1/datalab/search`,{method:'POST',headers:{'Content-Type':'application/json','X-Naver-Client-Id':I,'X-Naver-Client-Secret':S},body});
  await call('legacy-news-search',`https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent('코스피')}&display=1`,{headers:{'X-Naver-Client-Id':I,'X-Naver-Client-Secret':S}});
}
if(mode==='krx'){
  const K=krx.trim(),base='https://data-dbg.krx.co.kr/svc/apis';
  for(const [label,path] of [['krx-kospi-idx','idx/kospi_dd_trd'],['krx-kosdaq-idx','idx/kosdaq_dd_trd'],['krx-krx-idx','idx/krx_dd_trd'],['krx-stk-bydd','sto/stk_bydd_trd'],['krx-ksq-bydd','sto/ksq_bydd_trd']])
    await call(label,`${base}/${path}?basDd=20261027`,{headers:{accept:'application/json',AUTH_KEY:K}});
  await call('krx-kospi-idx-queryparam',`${base}/idx/kospi_dd_trd?basDd=20261027&AUTH_KEY=${encodeURIComponent(K)}`,{headers:{accept:'application/json'}});
  await call('krx-kospi-idx-oldhost',`https://openapi.krx.co.kr/svc/apis/idx/kospi_dd_trd?basDd=20261027`,{headers:{accept:'application/json',AUTH_KEY:K}});
}
