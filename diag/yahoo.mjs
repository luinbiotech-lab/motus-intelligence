const note=(l,o)=>console.log(`::notice title=${l}::${JSON.stringify(o).slice(0,950)}`);
for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
 for(const sym of ['^KS11','^KQ11']){
  const url=`https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?period1=1792886400&period2=1793318400&interval=1d`;
  try{const r=await fetch(url,{headers:{'user-agent':'MOTUS-Internal-Collector/1.0','accept':'application/json'},signal:AbortSignal.timeout(15000)});const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{}
   const res=j?.chart?.result?.[0];const ts=res?.timestamp??[];const close=res?.indicators?.quote?.[0]?.close??[];
   note(`${host} ${sym}`,{status:r.status,err:j?.chart?.error??(j?null:t.slice(0,160)),tz:res?.meta?.exchangeTimezoneName,gmtoffset:res?.meta?.gmtoffset,rows:ts.map((x,i)=>[new Date((x+(res?.meta?.gmtoffset??0))*1000).toISOString().slice(0,16),close[i]])});
  }catch(e){note(`${host} ${sym}`,{networkError:String(e?.cause?.code??e)})}
 }}
