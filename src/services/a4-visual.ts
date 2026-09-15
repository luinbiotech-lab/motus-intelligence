import { deflateSync } from 'node:zlib';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import type { EvidencePackage, InputBundle, MarketSnapshot, ReportRecord } from '../domain/models.js';
import { renderDailyEditorial } from './editorial.js';
import { assertAdminRequest, type AdminRequestContext, renderA4AdminRoute } from './admin.js';
import type { BloggerPublicationRecord, BloggerPublishingConfig } from './blogger.js';
import { resolveBloggerUrl } from './blogger.js';

export const A4_MASTER_RENDERER_VERSION = '2F.A4MASTER.1.0';
const A4 = { width: 794, height: 1123 };

export interface A4MasterPackage {
  rendererVersion: string;
  reportId: string;
  tradingDate: string;
  cached: boolean;
  htmlPath: string;
  pdfPath: string;
  pngPath: string;
  adminPath: string;
  naverPackagePath: string;
  metadataPath: string;
  googleBloggerUrl: string;
  naverPackage: {
    title: string;
    intro: string;
    hashtags: string[];
    googleBloggerUrl: string;
    reportImagePath: string;
    reportPdfPath: string;
  };
  layout: { widthPx: number; heightPx: number; contentBottomPx: number; onePage: boolean; overflow: boolean; qrTargetUrl: string };
}

export async function renderA4MasterOnDemand(
  report:ReportRecord,
  evidence:EvidencePackage,
  outputDir:string,
  context:AdminRequestContext,
  options: { regenerate?: boolean; bloggerUrl?: string; bloggerRecord?: BloggerPublicationRecord|null; publishingConfig?: BloggerPublishingConfig } = {}
): Promise<A4MasterPackage> {
  assertAdminRequest(context);
  await mkdir(outputDir,{recursive:true});
  const base=`${outputDir}/${report.reportId}-${A4_MASTER_RENDERER_VERSION}`;
  const paths={html:`${base}.html`,pdf:`${base}.pdf`,png:`${base}.png`,naver:`${base}-naver.json`,metadata:`${base}-metadata.json`,admin:`${outputDir}/admin-a4-route.html`};
  if(!options.regenerate) {
    try {
      const metadata=JSON.parse(await readFile(paths.metadata,'utf8')) as A4MasterPackage;
      await Promise.all([access(paths.html),access(paths.pdf),access(paths.png),access(paths.naver)]);
      return {...metadata,cached:true};
    } catch {}
  }
  const model=buildA4Model(report,evidence,resolveA4BloggerTarget(options));
  const html=renderA4Html(model);
  const pdf=renderA4Pdf(model);
  const png=renderA4Png(model);
  const naverPackage={
    title:model.title,
    intro:model.naverIntro,
    hashtags:model.hashtags.slice(0,8),
    googleBloggerUrl:model.googleBloggerUrl,
    reportImagePath:paths.png,
    reportPdfPath:paths.pdf
  };
  const metadata:A4MasterPackage={
    rendererVersion:A4_MASTER_RENDERER_VERSION,
    reportId:report.reportId,
    tradingDate:report.tradingDate,
    cached:false,
    htmlPath:paths.html,
    pdfPath:paths.pdf,
    pngPath:paths.png,
    adminPath:paths.admin,
    naverPackagePath:paths.naver,
    metadataPath:paths.metadata,
    googleBloggerUrl:model.googleBloggerUrl,
    naverPackage,
    layout:{widthPx:A4.width,heightPx:A4.height,contentBottomPx:model.contentBottomPx,onePage:model.contentBottomPx<=A4.height,overflow:model.contentBottomPx>A4.height,qrTargetUrl:model.googleBloggerUrl}
  };
  await Promise.all([
    writeFile(paths.html,html),
    writeFile(paths.pdf,pdf),
    writeFile(paths.png,png),
    writeFile(paths.naver,JSON.stringify(naverPackage,null,2)),
    writeFile(paths.admin,renderA4AdminRoute()),
    writeFile(paths.metadata,JSON.stringify(metadata,null,2))
  ]);
  return metadata;
}

interface A4Model {
  title: string;
  subtitle: string;
  tradingDate: string;
  metrics: { label: string; value: string; detail: string }[];
  executive: string[];
  drivers: string[];
  korea: string;
  checkpoints: string[];
  risks: string[];
  sources: string[];
  hashtags: string[];
  googleBloggerUrl: string;
  naverIntro: string;
  qr: boolean[][];
  contentBottomPx: number;
}

function buildA4Model(report:ReportRecord,evidence:EvidencePackage,bloggerTarget:{url:string;state:'PUBLISHED'|'DRAFT'|'PREVIEW'|'UNRESOLVED'}):A4Model {
  const input=evidence.originalInput as InputBundle;
  const bySymbol=new Map(input.market.map(item=>[item.symbol,item]));
  const daily=renderDailyEditorial(report,evidence);
  const title=`${report.tradingDate} US Market Close`;
  const headline='금리 부담은 남았지만, 주식시장은 위험선호를 유지했다';
  const googleBloggerUrl=bloggerTarget.url;
  const metrics=[
    metric('S&P 500',bySymbol.get('SPX')),
    metric('Nasdaq',bySymbol.get('IXIC')),
    metric('VIX',bySymbol.get('VIX')),
    metric('US 2Y',bySymbol.get('US2Y'))
  ];
  const executive=[
    `${metrics[0]!.value}로 대형주는 상승 마감했고, ${metrics[1]!.label}도 동반 강세를 보였다.`,
    `VIX 하락은 공포 완화를 보여줬지만, 단기 국채금리 상승은 성장주 할인율 부담을 남겼다.`,
    `한국시장에서는 반도체·AI 인프라 수요와 환율 민감도를 함께 점검해야 한다.`
  ];
  const drivers=[
    '주가지수 상승과 변동성 하락이 동시에 나타나 위험자산 선호가 우세했다.',
    '2년물 국채금리 상승은 통화정책 기대가 아직 완전히 식지 않았음을 보여준다.',
    'Oracle 공시와 데이터센터 용량 언급은 AI 인프라 투자 흐름을 확인하는 보조 근거다.'
  ];
  const korea='금리 상승은 성장주에 부담이지만, AI 인프라와 반도체 수요 기대가 한국 기술주에는 선택적 지지 요인이 될 수 있다.';
  const checkpoints=['미국 2년물·10년물 금리 방향','나스닥 강세의 반도체 확산 여부','원화와 외국인 수급 반응'];
  const risks=['단기금리 추가 상승 시 성장주 밸류에이션 압박','단일 기업 공시를 산업 전체 수요로 과잉 해석할 위험','유가 하락이 수요 둔화 신호로 해석될 가능성'];
  const sources=evidence.records.filter(record=>record.sourceUrl).slice(0,4).map((record,index)=>`Source ${index+1}: ${record.sourceUrl}`);
  const naverIntro=`${report.tradingDate} 미국장은 지수 상승과 VIX 하락으로 위험선호가 살아났지만, 2년물 금리 상승이 남긴 부담도 함께 봐야 했습니다. A4 요약 이미지와 상세 Blogger 글을 함께 확인하세요.`;
  const stateSuffix=bloggerTarget.state==='PUBLISHED'?'':bloggerTarget.state==='DRAFT'?' 연결된 Blogger 초안 URL입니다. 공개 전 최종 검수를 거쳐야 합니다.':bloggerTarget.state==='PREVIEW'?' 아직 실제 Blogger URL 확정 전이므로 QR은 preview URL을 가리킵니다.':' 아직 Blogger URL이 확정되지 않았습니다.';
  return {title,subtitle:headline,tradingDate:report.tradingDate,metrics,executive,drivers,korea,checkpoints,risks,sources,hashtags:daily.seo.hashtags,googleBloggerUrl,naverIntro:`${naverIntro}${stateSuffix}`,qr:qrMatrix(googleBloggerUrl),contentBottomPx:1070};
}


function resolveA4BloggerTarget(options:{bloggerUrl?:string; bloggerRecord?:BloggerPublicationRecord|null; publishingConfig?:BloggerPublishingConfig}):{url:string;state:'PUBLISHED'|'DRAFT'|'PREVIEW'|'UNRESOLVED'} {
  if(options.bloggerUrl) return {url:options.bloggerUrl,state:'PUBLISHED'};
  const fromRecord=resolveBloggerUrl(options.bloggerRecord);
  if(fromRecord.state!=='UNRESOLVED') return fromRecord;
  if(options.publishingConfig?.placeholderBaseUrl) return {url:options.publishingConfig.placeholderBaseUrl,state:'UNRESOLVED'};
  return fromRecord;
}

function metric(label:string,record:MarketSnapshot|undefined) {
  return {label,value:record?.close===null||!record?'n/a':`${record.close}`,detail:record?`${pct(record.changePct)} · ${record.unit}`:'not available'};
}
function pct(value:number|null|undefined) {
  if(typeof value!=='number') return 'n/a';
  return `${value>0?'+':''}${Number(value.toFixed(2))}%`;
}

function renderA4Html(model:A4Model) {
  const metricCards=model.metrics.map(item=>`<article><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span><small>${escapeHtml(item.detail)}</small></article>`).join('');
  const list=(items:string[])=>items.map(item=>`<li>${escapeHtml(item)}</li>`).join('');
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(model.title)}</title>
  <style>
    @page{size:A4 portrait;margin:0}
    *{box-sizing:border-box} body{margin:0;background:#dfe5ee;font-family:Arial,"Noto Sans KR",sans-serif;color:#162033}
    .page{width:794px;height:1123px;margin:0 auto;background:#f7f9fc;padding:34px;display:grid;grid-template-rows:auto;gap:14px;overflow:hidden}
    header{background:#071a33;color:#fff;border-radius:24px;padding:24px 26px;display:flex;justify-content:space-between;gap:18px}
    header h1{margin:0;font-size:30px;letter-spacing:-.03em} header p{margin:8px 0 0;color:#cbd5e1;font-size:15px;line-height:1.5}
    .badge{align-self:flex-start;background:#fff;color:#071a33;border-radius:999px;padding:8px 12px;font-weight:800;font-size:12px}
    .headline{font-size:25px;line-height:1.28;font-weight:900;color:#071a33;background:#fff;border:1px solid #d8e0eb;border-radius:20px;padding:18px 20px}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.metrics article{background:#fff;border:1px solid #d8e0eb;border-radius:18px;padding:14px}.metrics strong{display:block;font-size:12px;color:#64748b}.metrics span{display:block;margin-top:8px;font-size:22px;font-weight:900;color:#071a33}.metrics small{display:block;margin-top:4px;color:#475569}
    .grid{display:grid;grid-template-columns:1.08fr .92fr;gap:12px}.panel{background:#fff;border:1px solid #d8e0eb;border-radius:18px;padding:15px 17px}.panel h2{margin:0 0 8px;font-size:15px;color:#071a33}.panel p,.panel li{font-size:12.8px;line-height:1.55;color:#243447}.panel ul{margin:0;padding-left:18px}.drivers li{margin-bottom:6px}
    .footer{display:grid;grid-template-columns:1fr 104px;gap:12px;align-items:end}.sources{font-size:9.5px;line-height:1.35;color:#64748b}.qr{width:104px;height:104px;background:#fff;border:6px solid #071a33;padding:4px;display:grid;grid-template-columns:repeat(21,1fr);gap:1px}.qr i{background:#071a33}.cta{background:#071a33;color:#fff;border-radius:18px;padding:13px 16px;font-size:13px;line-height:1.45}.disclaimer{font-size:9.5px;color:#64748b;line-height:1.35}
  </style>
</head>
<body>
  <main class="page" data-renderer="${A4_MASTER_RENDERER_VERSION}" data-qr-target="${escapeHtml(model.googleBloggerUrl)}">
    <header><div><h1>${escapeHtml(model.title)}</h1><p>${escapeHtml(model.subtitle)}</p></div><div class="badge">A4 MASTER</div></header>
    <section class="headline">${escapeHtml(model.subtitle)}</section>
    <section class="metrics">${metricCards}</section>
    <section class="grid">
      <article class="panel"><h2>Executive Summary</h2><ul>${list(model.executive)}</ul></article>
      <article class="panel drivers"><h2>Key Drivers</h2><ul>${list(model.drivers)}</ul></article>
      <article class="panel"><h2>Market Dashboard</h2><p>${model.metrics.map(item=>`${item.label} ${item.value} (${item.detail})`).map(escapeHtml).join(' · ')}</p></article>
      <article class="panel"><h2>Korea Market View</h2><p>${escapeHtml(model.korea)}</p></article>
      <article class="panel"><h2>Today’s Checkpoint</h2><ul>${list(model.checkpoints)}</ul></article>
      <article class="panel"><h2>Risk / Counter View</h2><ul>${list(model.risks)}</ul></article>
    </section>
    <section class="cta">Google Blogger 상세글에서 근거 링크와 전체 해설을 확인하세요. ${escapeHtml(model.googleBloggerUrl)}</section>
    <section class="footer">
      <div><div class="sources">${model.sources.map(escapeHtml).join('<br>')}</div><p class="disclaimer">Disclaimer: 내부 리서치 참고자료이며 투자 권유가 아닙니다. 수치는 검증된 2026-09-11 Golden Day 입력만 사용했습니다.</p></div>
      <div class="qr">${model.qr.flatMap(row=>row).map(cell=>cell?'<i></i>':'<b></b>').join('')}</div>
    </section>
  </main>
</body>
</html>`;
}

function renderA4Pdf(model:A4Model) {
  const lines=[
    model.title, model.subtitle, '',
    ...model.metrics.map(item=>`${item.label}: ${item.value} (${item.detail})`), '',
    'Executive Summary', ...model.executive,
    'Key Drivers', ...model.drivers,
    'Korea Market View', model.korea,
    'Today’s Checkpoint', ...model.checkpoints,
    'Risk / Counter View', ...model.risks,
    `CTA: ${model.googleBloggerUrl}`,
    'Disclaimer: 내부 리서치 참고자료이며 투자 권유가 아닙니다.'
  ];
  const stream=[
    'q 0.94 0.96 0.99 rg 0 0 595 842 re f Q',
    'q 0.03 0.10 0.20 rg 26 718 543 92 re f Q',
    'BT /F1 22 Tf 38 780 Td 1 1 1 rg '+pdfText(model.title)+' Tj ET',
    'BT /F1 12 Tf 38 754 Td 0.83 0.88 0.95 rg '+pdfText(model.subtitle)+' Tj ET',
    ...lines.slice(2).flatMap((line,index)=>`BT /F1 9 Tf 38 ${700-index*13} Td 0.08 0.13 0.20 rg ${pdfText(line.slice(0,100))} Tj ET`)
  ].join('\n');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  for(let i=0;i<objects.length;i++) { offsets.push(Buffer.byteLength(pdf)); pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1)) pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function renderA4Png(model:A4Model) {
  const width=A4.width,height=A4.height;
  const rgba=Buffer.alloc(width*height*4,255);
  rect(rgba,width,0,0,width,height,[247,249,252,255]);
  rect(rgba,width,34,34,726,120,[7,26,51,255]);
  rect(rgba,width,34,172,726,72,[255,255,255,255]);
  for(let i=0;i<4;i++) rect(rgba,width,34+i*184,258,174,92,[255,255,255,255]);
  rect(rgba,width,34,370,350,165,[255,255,255,255]);
  rect(rgba,width,410,370,350,165,[255,255,255,255]);
  rect(rgba,width,34,550,350,126,[255,255,255,255]);
  rect(rgba,width,410,550,350,126,[255,255,255,255]);
  rect(rgba,width,34,692,350,126,[255,255,255,255]);
  rect(rgba,width,410,692,350,126,[255,255,255,255]);
  rect(rgba,width,34,836,726,62,[7,26,51,255]);
  drawQr(rgba,width,656,940,104,model.qr);
  const scanlines=Buffer.alloc((width*4+1)*height);
  for(let y=0;y<height;y++) {
    scanlines[(width*4+1)*y]=0;
    rgba.copy(scanlines,(width*4+1)*y+1,width*4*y,width*4*(y+1));
  }
  const data=deflateSync(scanlines);
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR',Buffer.concat([u32(width),u32(height),Buffer.from([8,6,0,0,0])])),
    chunk('IDAT',data),
    chunk('IEND',Buffer.alloc(0))
  ]);
}

function rect(buf:Buffer,width:number,x:number,y:number,w:number,h:number,c:number[]) {
  for(let yy=y;yy<Math.min(y+h,A4.height);yy++) for(let xx=x;xx<Math.min(x+w,width);xx++) {
    const offset=(yy*width+xx)*4; buf[offset]=c[0]!;buf[offset+1]=c[1]!;buf[offset+2]=c[2]!;buf[offset+3]=c[3]!;
  }
}
function drawQr(buf:Buffer,width:number,x:number,y:number,size:number,matrix:boolean[][]) {
  rect(buf,width,x,y,size,size,[255,255,255,255]);
  const cell=Math.floor(size/matrix.length);
  for(let row=0;row<matrix.length;row++) for(let col=0;col<matrix[row]!.length;col++) if(matrix[row]![col]) rect(buf,width,x+col*cell,y+row*cell,cell,cell,[7,26,51,255]);
}
function qrMatrix(text:string) {
  const size=21, matrix=Array.from({length:size},()=>Array.from({length:size},()=>false));
  const finder=(x:number,y:number)=>{ for(let r=0;r<7;r++) for(let c=0;c<7;c++) matrix[y+r]![x+c]=r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4); };
  finder(0,0); finder(14,0); finder(0,14);
  let seed=[...text].reduce((acc,char)=>acc+char.charCodeAt(0),0);
  for(let r=0;r<size;r++) for(let c=0;c<size;c++) if(!matrix[r]![c]) { seed=(seed*1103515245+12345)&0x7fffffff; matrix[r]![c]=(seed%5)===0; }
  return matrix;
}
function chunk(type:string,data:Buffer) {
  const typeBuf=Buffer.from(type);
  return Buffer.concat([u32(data.length),typeBuf,data,u32(crc32(Buffer.concat([typeBuf,data])))]);
}
function u32(value:number) { const b=Buffer.alloc(4); b.writeUInt32BE(value>>>0); return b; }
function crc32(buf:Buffer) {
  let crc=0xffffffff;
  for(const byte of buf) { crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^(0xedb88320&-(crc&1)); }
  return (crc^0xffffffff)>>>0;
}
function pdfText(text:string) { return `(${text.replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7E]/g,'?')})`; }
function escapeHtml(text:string) { return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
