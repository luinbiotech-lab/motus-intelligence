/** Test helper: serves a one-brief Hankyung consensus market list and PDF so builders find session commentary. */
export function withBrokerBrief(inner:typeof fetch,briefDate:string):typeof fetch{
  return (async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);
    if(url.includes('consensus.hankyung.com/analysis/list'))return new Response(url.includes('report_type=MK')?`<tr><td>${briefDate}</td><td><a href="/analysis/downpdf?report_idx=900">morning brief</a><div class="layerPop"><div><strong>morning brief</strong></div></div></td><td>리서치센터</td><td>테스트증권</td></tr>`:'<table></table>');
    if(url.includes('consensus.hankyung.com/analysis/downpdf'))return new Response(new Uint8Array(Buffer.from('%PDF-1.4 fixture')));
    return inner(input,init);
  }) as typeof fetch;
}
export const briefFixtureText=(kospi:string)=>`[ 국내증시 ]\n• 코스피는 반도체 대형주 강세에 ${kospi}P로 상승 마감\n• 외국인 순매수 확대와 실적 기대가 지수 상승을 이끌었음\n▶ 미국증시\n- 3대 지수는 빅테크 실적 기대에 상승 마감함\n`;
