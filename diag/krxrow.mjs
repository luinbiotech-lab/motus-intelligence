const K=(process.env.KRX_KEY??'').trim();
for(const [name,path] of [['KOSPI','idx/kospi_dd_trd'],['KOSDAQ','idx/kosdaq_dd_trd']]){
 const r=await fetch(`https://data-dbg.krx.co.kr/svc/apis/${path}?basDd=20261028`,{headers:{AUTH_KEY:K,accept:'application/json'}});const j=await r.json();
 const row=(j.OutBlock_1??[]).find(x=>/^(코스피|코스닥)$/.test(x.IDX_NM));
 console.log(`::notice title=KRX ${name} 20261028::${JSON.stringify(row?{BAS_DD:row.BAS_DD,IDX_NM:row.IDX_NM,CLSPRC_IDX:row.CLSPRC_IDX,CMPPREVDD_IDX:row.CMPPREVDD_IDX,FLUC_RT:row.FLUC_RT}:{status:r.status,rows:(j.OutBlock_1??[]).length})}`);
}
