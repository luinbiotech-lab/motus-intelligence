import json, html, math
D = json.load(open('report-data.json'))
E = json.load(open('evidence.json'))
NAVY, RED, BLUE, GRAY, LIGHT, ACC = '#0b2545', '#d1242f', '#1f5fbf', '#6b7785', '#eef2f7', '#c8a24a'
WEEK0, WEEK1, PRIOR = '2026-10-26', '2026-10-30', '2026-10-23'

def esc(s): return html.escape(str(s))
def series(sym, start='2026-07-31'): return [(d, v) for d, v in D[sym] if d >= start and d <= WEEK1]
def wk(sym):
    v = dict(D[sym]); return (v[WEEK1] / v[PRIOR] - 1) * 100, v[WEEK1]
def pct(x, d=2): return f"{'+' if x > 0 else ''}{x:.{d}f}%"
def col(x): return RED if x > 0 else BLUE if x < 0 else '#333'
def num(x, d=2): return f"{x:,.{d}f}"

def line_chart(pts, w, h, color, fmt=lambda v: num(v), title='', unit=''):
    pad_l, pad_r, pad_t, pad_b = 6, 52, 8, 18
    vals = [v for _, v in pts]; lo, hi = min(vals), max(vals); span = hi - lo or 1
    lo -= span * 0.08; hi += span * 0.08
    X = lambda i: pad_l + (w - pad_l - pad_r) * i / (len(pts) - 1)
    Y = lambda v: pad_t + (h - pad_t - pad_b) * (1 - (v - lo) / (hi - lo))
    out = [f'<svg viewBox="0 0 {w} {h}" width="100%" xmlns="http://www.w3.org/2000/svg" style="display:block">']
    # this week shading
    idx = [i for i, (d, _) in enumerate(pts) if d >= WEEK0]
    if idx:
        x0 = X(idx[0]) - (X(1) - X(0)) / 2; out.append(f'<rect x="{x0:.1f}" y="{pad_t}" width="{X(len(pts)-1)-x0:.1f}" height="{h-pad_t-pad_b}" fill="#f6efe0"/>')
    for k in range(5):
        v = lo + (hi - lo) * k / 4; y = Y(v)
        out.append(f'<line x1="{pad_l}" x2="{w-pad_r}" y1="{y:.1f}" y2="{y:.1f}" stroke="#e3e8ef" stroke-width="0.6"/>')
        out.append(f'<text x="{w-pad_r+4}" y="{y+3:.1f}" font-size="7.5" fill="{GRAY}">{fmt(v)}</text>')
    seen = set()
    for i, (d, _) in enumerate(pts):
        m = d[5:7]
        if m not in seen and d[8:] <= '07':
            seen.add(m); out.append(f'<text x="{X(i):.1f}" y="{h-5}" font-size="7.5" fill="{GRAY}">{int(m)}월</text>')
    path = ' '.join(f"{'M' if i == 0 else 'L'}{X(i):.1f},{Y(v):.1f}" for i, (_, v) in enumerate(pts))
    out.append(f'<path d="{path}" fill="none" stroke="{color}" stroke-width="1.6" stroke-linejoin="round"/>')
    lx, ly = X(len(pts) - 1), Y(pts[-1][1])
    out.append(f'<circle cx="{lx:.1f}" cy="{ly:.1f}" r="2.4" fill="{color}"/>')
    out.append(f'<rect x="{w-pad_r+1}" y="{ly-7:.1f}" width="{pad_r-2}" height="13" rx="2" fill="{color}"/><text x="{w-pad_r+4}" y="{ly+2.6:.1f}" font-size="7.8" font-weight="700" fill="#fff">{fmt(pts[-1][1])}</text>')
    out.append('</svg>'); return ''.join(out)

def hbar(rows, w, h):
    # rows: (label, value)
    rows = sorted(rows, key=lambda r: r[1], reverse=True)
    m = max(abs(v) for _, v in rows) * 1.25; mid = w * 0.55; bh = (h - 10) / len(rows)
    out = [f'<svg viewBox="0 0 {w} {h}" width="100%" xmlns="http://www.w3.org/2000/svg">', f'<line x1="{mid}" x2="{mid}" y1="0" y2="{h}" stroke="#9aa6b2" stroke-width="0.6"/>']
    for i, (lab, v) in enumerate(rows):
        y = 4 + i * bh; L = (w * 0.42) * abs(v) / m; x = mid if v >= 0 else mid - L
        out.append(f'<rect x="{x:.1f}" y="{y+2:.1f}" width="{L:.1f}" height="{bh-5:.1f}" fill="{col(v)}" opacity="0.88"/>')
        out.append(f'<text x="{(mid-4) if v>=0 else (mid+4)}" y="{y+bh/2+2:.1f}" font-size="8" text-anchor="{"end" if v>=0 else "start"}" fill="#222">{esc(lab)}</text>')
        tx = x + L + 3 if v >= 0 else x - 3
        out.append(f'<text x="{tx:.1f}" y="{y+bh/2+2:.1f}" font-size="8" font-weight="700" text-anchor="{"start" if v>=0 else "end"}" fill="{col(v)}">{pct(v)}</text>')
    out.append('</svg>'); return ''.join(out)

Q = {q['label']: q for q in E['quotes']}
def qrow(label, unit=''):
    q = Q[label]; ch = q['changePct']; val = q['weekClose']
    if q['unit'] == 'yield': return f'<tr><td>{esc(label)}</td><td class=r>{val:.2f}%</td><td class=r style="color:{col(q["changeBp"])}">{q["changeBp"]:+d}bp</td></tr>'
    v = f'{val:,.2f}' if q['unit'] != 'fx' else f'{val:,.2f}'
    return f'<tr><td>{esc(label)}</td><td class=r>{v}</td><td class=r style="color:{col(ch)}"><b>{pct(ch)}</b></td></tr>'

def fig(no, title, body, src='자료: Yahoo Finance, MOTUS'):
    return f'<div class=fig><div class=figt><span>그림 {no}.</span> {esc(title)}</div>{body}<div class=src>{esc(src)}</div></div>'

idx_specs = [('^GSPC', 'S&P 500', NAVY), ('^IXIC', '나스닥', NAVY), ('^KS11', '코스피', '#7a1f2b'), ('^KQ11', '코스닥', '#7a1f2b')]
small = ''
for sym, name, c in idx_specs:
    ch, last = wk(sym)
    small += f'<div class=mini><div class=minih><b>{name}</b><span class=lv>{num(last)}</span><span style="color:{col(ch)};font-weight:800">{pct(ch)} W/W</span></div>{line_chart(series(sym), 300, 112, c)}</div>'

sectors = {'XLK': '기술', 'XLC': '커뮤니케이션', 'XLY': '경기소비재', 'XLF': '금융', 'XLV': '헬스케어', 'XLI': '산업재', 'XLE': '에너지', 'XLB': '소재', 'XLP': '필수소비재', 'XLU': '유틸리티', 'XLRE': '부동산'}
sec_svg = hbar([(n, wk(s)[0]) for s, n in sectors.items()], 300, 190)

caps = [q for q in E['quotes'] if q['group'] in ('US_STOCK', 'KOREA_STOCK')]
def cap_table(group, unit):
    rows = sorted([q for q in caps if q['group'] == group], key=lambda q: -q['changePct'])
    pick = rows[:4] + rows[-4:]
    tr = ''.join(f'<tr><td>{esc(q["label"])}{"" if group=="KOREA_STOCK" else f" <span class=tk>{q["symbol"]}</span>"}</td><td class=r>{("$"+num(q["weekClose"])) if unit=="$" else (num(q["weekClose"],0)+"원")}</td><td class=r style="color:{col(q["changePct"])}"><b>{pct(q["changePct"])}</b></td></tr>' for q in pick)
    return f'<table class=t><thead><tr><th>종목</th><th class=r>주간 종가</th><th class=r>주간 등락</th></tr></thead><tbody>{tr}</tbody></table>'

cal = E['calendar']
cal_rows = ''.join(f'<tr{" class=hi" if c["impact"]=="High" else ""}><td class=nw>{esc(c["kstLabel"])}</td><td>{esc(c["countryLabel"])}</td><td>{esc(c["koreanTitle"] or c["title"])}{" <span class=star>★</span>" if c["impact"]=="High" else ""}</td><td class=r>{esc(c["forecast"] or "-")}</td><td class=r>{esc(c["previous"] or "-")}</td></tr>' for c in cal)

brokers = ''.join(f'<tr><td class=nw><b>{esc(b["broker"])}</b><div class=tk>{b["date"][5:].replace("-","/")}</div></td><td><div class=rt>{esc(b["title"])}</div><div>“{esc(b["sentence"].rstrip("."))}”</div></td></tr>' for b in E['broker'] if b['kind']=='review')

tnx = line_chart(series('^TNX'), 300, 120, '#8a5a00', fmt=lambda v: f'{v:.2f}%')
krw = line_chart([(d, v) for d, v in series('KRW=X')], 300, 120, '#3c6e47', fmt=lambda v: f'{v:,.0f}')

nq, sp, dj = Q['나스닥'], Q['S&P 500'], Q['다우존스']
ks, kq, ty, fx = Q['코스피'], Q['코스닥'], Q['미국 10년물 국채금리'], Q['원·달러 환율']
dd = lambda q: {d['date']: d['close'] for d in q['daily']}
nqd = dd(nq)
nq29 = (nqd['2026-10-29'] / nqd['2026-10-28'] - 1) * 100; nq30 = (nqd['2026-10-30'] / nqd['2026-10-29'] - 1) * 100
ksd = dd(ks); ks28 = (ksd['2026-10-28'] / ksd['2026-10-27'] - 1) * 100; ks30 = (ksd['2026-10-30'] / ksd['2026-10-29'] - 1) * 100
cap = {q['label']: q['changePct'] for q in caps}
B = lambda x: f'<b style="color:{col(x)}">{pct(x)}</b>'

head = lambda page: f'''<div class=top><div class=brand>MOTUS <span>Research</span></div><div class=meta>주간 시장 전략 · Weekly Market Strategy<br>2026. 11. 1 (일) · {page}/3</div></div>'''
foot = '<div class=foot>MOTUS Research · 공개 자료 기반 참고 자료이며 투자 권유가 아닙니다. 수치는 각 시장의 10월 30일 종가 기준입니다.</div>'

css = f'''
@page {{ size: A4; margin: 0 }}
* {{ box-sizing: border-box }}
body {{ margin:0; font-family:"Noto Sans CJK KR","Noto Sans KR",sans-serif; color:#1b2430; font-size:9.3pt; line-height:1.55 }}
.page {{ width:210mm; height:297mm; padding:11mm 12mm 10mm; position:relative; page-break-after:always; overflow:hidden }}
.top {{ display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2.4px solid {NAVY}; padding-bottom:5px }}
.brand {{ font-size:17pt; font-weight:900; color:{NAVY}; letter-spacing:.5px }} .brand span {{ font-weight:400; color:{ACC} }}
.meta {{ text-align:right; font-size:7.8pt; color:{GRAY}; line-height:1.4 }}
.tag {{ display:inline-block; margin:10px 0 4px; background:{NAVY}; color:#fff; font-size:7.8pt; font-weight:700; padding:2px 8px }}
h1 {{ font-size:19pt; line-height:1.3; margin:2px 0 4px; color:{NAVY}; font-weight:900; letter-spacing:-.4px }}
.sub {{ color:{GRAY}; font-size:9pt; margin-bottom:8px }}
.grid {{ display:grid; grid-template-columns:62mm 1fr; gap:6mm }}
.side {{ background:{LIGHT}; padding:7px 8px; align-self:start }}
.sh {{ font-weight:800; color:{NAVY}; font-size:9pt; border-bottom:1.4px solid {NAVY}; padding-bottom:2px; margin:6px 0 4px }}
.side table {{ width:100%; border-collapse:collapse; font-size:8pt }} .side td {{ padding:2.4px 0; border-bottom:1px solid #d6dde7 }}
.r {{ text-align:right }} .nw {{ white-space:nowrap }}
h2 {{ font-size:11pt; color:{NAVY}; margin:9px 0 5px; padding-left:7px; border-left:4px solid {ACC}; font-weight:800 }}
.pt {{ margin:0 0 6px }} .pt b.k {{ color:{NAVY} }}
.pt .n {{ display:inline-block; width:15px; height:15px; background:{NAVY}; color:#fff; font-size:8pt; text-align:center; line-height:15px; margin-right:5px; font-weight:800 }}
.fig {{ margin:6px 0 4px }} .figt {{ font-weight:800; font-size:8.6pt; color:#222; border-bottom:1px solid #9aa6b2; padding-bottom:2px; margin-bottom:3px }} .figt span {{ color:{ACC} }}
.src {{ font-size:7pt; color:{GRAY}; margin-top:1px }}
.minis {{ display:grid; grid-template-columns:1fr 1fr; gap:4mm 5mm }}
.mini {{ border-top:1px solid #d6dde7; padding-top:3px }} .minih {{ display:flex; gap:8px; align-items:baseline; font-size:8.6pt }} .lv {{ font-weight:800; font-size:10pt }}
.t {{ width:100%; border-collapse:collapse; font-size:8.2pt }} .t th {{ background:{NAVY}; color:#fff; font-weight:700; padding:3px 5px; text-align:left }} .t td {{ padding:3px 5px; border-bottom:1px solid #dde3ea; vertical-align:top }}
.t tr.hi td {{ background:#fbf6ea }} .star {{ color:{ACC} }} .tk {{ color:{GRAY}; font-size:7.2pt }} .rt {{ color:{GRAY}; font-size:7.6pt }}
.two {{ display:grid; grid-template-columns:1fr 1fr; gap:6mm }}
.box {{ border:1px solid {NAVY}; padding:7px 9px; margin-top:6px }} .box .bt {{ font-weight:800; color:{NAVY}; margin-bottom:3px }}
.foot {{ position:absolute; left:12mm; right:12mm; bottom:7mm; border-top:1px solid #c5ced9; padding-top:3px; font-size:6.8pt; color:{GRAY} }}
.legend {{ font-size:7.2pt; color:{GRAY} }} .legend i {{ display:inline-block; width:10px; height:8px; background:#f6efe0; margin:0 3px -1px 0 }}
'''

p1 = f'''<div class=page>{head(1)}
<div class=tag>주간 시황 | 미국·국내 증시</div>
<h1>빅테크 약세에 나스닥 2% 하락,<br>코스피는 반도체 대형주 앞세워 3% 상승</h1>
<div class=sub>10월 26~30일 주간 결산과 11월 2~6일 일정 점검</div>
<div class=grid>
<div class=side>
<div class=sh>Market Data <span class=tk>(10/30 종가, 주간)</span></div>
<table>{''.join(qrow(l) for l in ['S&P 500','나스닥','다우존스','러셀 2000','필라델피아 반도체','코스피','코스닥'])}</table>
<div class=sh>금리·환율·원자재</div>
<table>{''.join(qrow(l) for l in ['미국 10년물 국채금리','원·달러 환율','달러인덱스','WTI 유가','금'])}</table>
<div class=sh>코스피 투자자별 순매수 <span class=tk>(10/30, 억원)</span></div>
<table><tr><td>외국인</td><td class=r style="color:{BLUE}"><b>-16,149</b></td></tr><tr><td>기관</td><td class=r style="color:{RED}"><b>+7,540</b></td></tr><tr><td>개인</td><td class=r style="color:{RED}"><b>+6,028</b></td></tr></table>
<div class=tk style="margin-top:4px">자료: Yahoo Finance, 네이버페이 증권</div>
</div>
<div>
<h2>Weekly Summary</h2>
<p class=pt><span class=n>1</span><b class=k>미국: 주 후반 이틀 동안 하락.</b> 나스닥은 주간 {B(nq['changePct'])}, S&P 500은 {B(sp['changePct'])}로 마감했다. 수요일까지 3일 연속 오른 나스닥이 목요일 {B(nq29)}, 금요일 {B(nq30)} 떨어졌다. 대형 기술주에서는 알파벳이 주간 {B(cap['알파벳'])}, 메타가 {B(cap['메타'])}로 약했고, 테슬라는 {B(cap['테슬라'])}로 강했다.</p>
<p class=pt><span class=n>2</span><b class=k>국내: 대형 반도체 vs 나머지.</b> 코스피 {B(ks['changePct'])}, 코스닥 {B(kq['changePct'])}로 차이가 7%p에 가까웠다. SK하이닉스 {B(cap['SK하이닉스'])}, 삼성전자 {B(cap['삼성전자'])}가 지수를 끌어올린 반면 한화에어로스페이스 {B(cap['한화에어로스페이스'])}, 기아 {B(cap['기아'])}, HD현대중공업 {B(cap['HD현대중공업'])}은 크게 밀렸다. 코스피는 수요일 하루 {B(ks28)} 급등한 뒤 금요일 {B(ks30)} 하락했다.</p>
<p class=pt><span class=n>3</span><b class=k>금리·환율.</b> 미국 10년물 금리는 수요일 5.05%까지 올랐다가 <b>{ty['weekClose']:.2f}%</b>({ty['changeBp']:+d}bp)로 마감했다. 원·달러 환율은 <b>{fx['weekClose']:,.2f}원</b>({B(fx['changePct'])})으로 원화가 약해졌다.</p>
<p class=pt><span class=n>4</span><b class=k>다음 주: 미국 중간선거와 고용지표.</b> 11월 3일(현지) 상·하원 선거, 11월 6일(금) 22:30 고용보고서(비농업 고용 예상 63K, 이전 29K)가 핵심 일정이다. ISM 제조업·서비스업 지수와 영란은행 금리 결정(11/5)도 예정돼 있다.</p>
</div></div>
{fig(1, '미국·국내 주요 지수 3개월 추이 (일별 종가, 오른쪽 숫자는 실제 지수)', f'<div class=minis>{small}</div><div class=legend><i></i>음영: 이번 주(10/26~30)</div>')}
{foot}</div>'''

p2 = f'''<div class=page>{head(2)}
<h2>미국 업종과 대형주: 커뮤니케이션·기술 약세, 방어 업종 강세</h2>
<div class=two>
<div>{fig(2, '미국 업종별 주간 수익률 (SPDR 섹터 ETF)', sec_svg)}
<p class=pt style="font-size:8.6pt">11개 업종 중 9개가 올랐지만 시가총액 비중이 큰 <b>커뮤니케이션({pct(wk('XLC')[0])})</b>과 <b>기술({pct(wk('XLK')[0])})</b>이 내려 지수는 하락했다. 헬스케어({pct(wk('XLV')[0])})·소재({pct(wk('XLB')[0])})·유틸리티({pct(wk('XLU')[0])}) 등 방어·경기 업종이 상대적으로 강했다.</p></div>
<div><div class=figt><span>표 1.</span> 미국 대형 기술주 주간 등락 (상위·하위 4)</div>{cap_table('US_STOCK','$')}<div class=src>자료: Yahoo Finance</div>
<div class=figt style="margin-top:8px"><span>표 2.</span> 국내 시가총액 상위 종목 주간 등락 (상위·하위 4)</div>{cap_table('KOREA_STOCK','원')}<div class=src>자료: Yahoo Finance</div></div>
</div>
<h2>금리와 환율: 10년물 5% 재시험 후 하락, 원화는 약세</h2>
<div class=two>
{fig(3, '미국 10년물 국채금리 (%)', tnx)}
{fig(4, '원·달러 환율 (원)', krw)}
</div>
{foot}</div>'''

p3 = f'''<div class=page>{head(3)}
<h2>다음 주 주요 일정 (11월 2~6일, 한국시간)</h2>
<table class=t><thead><tr><th style="width:30mm">일시</th><th style="width:13mm">국가</th><th>지표·이벤트</th><th class=r style="width:18mm">예상</th><th class=r style="width:18mm">이전</th></tr></thead><tbody>{cal_rows}</tbody></table>
<div class=src>★ 시장 영향이 큰 일정. 예상치는 Forex Factory 집계 기준이며, 일정은 발표 기관 사정에 따라 바뀔 수 있음.</div>
<h2>다음 주 체크포인트</h2>
<div class=box><div class=bt>① 미국 중간선거 (11/3 현지)</div>대신증권은 이번 선거를 “의회 권력 재편으로 현 집권 행정부의 정책 강도와 속도에 영향을 미치는 중대한 이벤트”로 봤다. 개표 결과가 나오는 11월 4일(수) 한국 장에서 정책 관련 업종의 반응을 확인할 필요가 있다.</div>
<div class=box><div class=bt>② 미국 고용보고서 (11/6 22:30)</div>비농업 고용 예상치는 <b>63K</b>(이전 29K), 실업률은 <b>4.2%</b>(이전 4.2%)다. 키움증권은 다음 주 금융시장이 “중간선거와 주요 고용 및 경기지표 발표를 앞두고 변동성이 확대될 것”으로 예상했다.</div>
<div class=box><div class=bt>③ 미국 10년물 금리 5% 선</div>이번 주 10년물은 수요일 5.05%까지 오른 뒤 4.93%로 내려왔다. 키움증권은 “미국 시장금리의 추가 상승 여부는 달러화와 주식시장 투자심리에도 영향을 미칠 수 있다”고 짚었다.</div>
<div class=box><div class=bt>④ 국내 반도체 쏠림</div>코스피와 코스닥의 주간 수익률 차이가 {ks['changePct']-kq['changePct']:.1f}%p까지 벌어졌다. 대신증권은 “실적 결과에 따른 투자심리 변화가 KOSPI 등락을 좌우하는 핵심 변수”라고 봤다.</div>
<h2>증권가가 본 이번 주</h2>
<table class=t><thead><tr><th style="width:23mm">증권사</th><th>리포트와 핵심 문장 (원문 인용)</th></tr></thead><tbody>{brokers}</tbody></table>
<div class=src>자료: 각 증권사 주간 리포트(네이버페이 증권 리서치 게시), 10월 30일 발간</div>
<div class=box style="border-color:#c5ced9;font-size:7.4pt;color:{GRAY};margin-top:8px"><b>Compliance Notice</b> 본 자료는 MOTUS가 공개된 시장 데이터와 증권사 공개 리포트를 바탕으로 작성한 참고 자료로, 특정 종목의 매수·매도를 권유하지 않습니다. 증권사 문장은 각 사 리포트 요약문을 그대로 인용했으며 저작권은 해당 증권사에 있습니다. 자료: Yahoo Finance, 네이버페이 증권, Forex Factory, 대신증권, 유안타증권, 키움증권.</div>
{foot}</div>'''

open('report.html', 'w').write(f'<!doctype html><html lang=ko><head><meta charset=utf-8><style>{css}</style></head><body>{p1}{p2}{p3}</body></html>')
print('ok')
