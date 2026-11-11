// 2026-11-11 traffic review: section chart images and a fuller daily report post.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {attachChartImages,chartCardHtml,chartFileName} from '../src/publishers/hero-card.js';
import {renderDailyReportArticle} from '../src/publishers/editorial-article.js';
import {dailyReportSection} from '../src/reports/daily-pdf.js';

const png=()=>{const bytes=new Uint8Array(9000);bytes.set([0x89,0x50,0x4e,0x47]);return bytes};
const rows=[{label:'삼성전자',value:5},{label:'SK하이닉스',value:7.13},{label:'한화오션',value:-6.1}];

test('chart card markup is deterministic and carries every row',()=>{
  const input={category:'korea' as const,issueDate:'2026-11-10',storeDate:'2026-11-11',title:'업종과 종목: 투자자 검색 상위',rows};
  assert.equal(chartCardHtml(input),chartCardHtml(input));
  assert.match(chartFileName(input),/^chart-[0-9a-f]{12}\.png$/);
  for(const text of ['삼성전자','+5.00%','SK하이닉스','+7.13%','한화오션','−6.10%'])assert.ok(chartCardHtml(input).includes(text),text);
});

test('charted sections get a stored PNG and an alt text with the same figures; off by default',async()=>{
  const root=await mkdtemp(join(tmpdir(),'motus-chart-'));
  const sections:Array<{title:string;bars?:Array<{label:string;value:number}>;image?:{url:string;alt:string;width:number;height:number}}>=[{title:'업종과 종목',bars:rows},{title:'두 줄',bars:rows.slice(0,2)},{title:'막대 없음'}];
  assert.equal(await attachChartImages(sections,{category:'korea',issueDate:'2026-11-10',storeDate:'2026-11-11'},{root,render:async()=>png()}),0);
  assert.equal(await attachChartImages(sections,{category:'korea',issueDate:'2026-11-10',storeDate:'2026-11-11'},{root,enabled:true,render:async()=>png()}),1);
  assert.match(sections[0]!.image!.url,/^https:\/\/raw\.githubusercontent\.com\/luinbiotech-lab\/motus-intelligence\/ops-data\/data\/operations\/2026-11-11\/korea\/chart-[0-9a-f]{12}\.png$/);
  assert.match(sections[0]!.image!.alt,/삼성전자 \+5\.00%, SK하이닉스 \+7\.13%, 한화오션 −6\.10%/);
  assert.equal(sections[1]!.image,undefined);
  const files=await readdir(join(root,'data','operations','2026-11-11','korea'));
  assert.equal(files.length,1);assert.equal((await readFile(join(root,'data','operations','2026-11-11','korea',files[0]!))).length,9000);
  // A failed render adds nothing and never throws.
  const again=[{title:'x',bars:rows}] as typeof sections;
  assert.equal(await attachChartImages(again,{category:'korea',issueDate:'2026-11-10',storeDate:'2026-11-11'},{root,enabled:true,render:async()=>null}),0);
  assert.equal(again[0]!.image,undefined);
});

test('daily report section carries the stock table (largest moves first), broker quotes and checkpoints',()=>{
  const view={issueDate:'2026-11-10',marketSummary:'코스피가 4.39% 올랐다. 외국인이 돌아왔다.',deepSections:[
    {key:'korea-stocks',title:'업종과 종목',role:'data',bars:[{label:'삼성전자',value:5},{label:'한진칼',value:12.77},{label:'카카오',value:-1}],paragraphs:[{text:'검색 1위 삼성전자는 199,400원으로 5.00% 상승했다(코스피 대비 +0.61%p).'}]},
    {key:'korea-causes',title:'요인',role:'broker',paragraphs:[{text:'A증권은 “반도체 강세”라고 진단했다.',source:{label:'A증권',url:'https://example.com/a'}}]},
    {key:'korea-risks',title:'위험',role:'watch',paragraphs:[{text:'환율이 확인 대상이다.'}]}]} as never;
  const section=dailyReportSection({key:'daily-report-korea',title:'국내 증시',view,link:{label:'기사',url:'https://motusnova.blogspot.com/2026/11/x.html',meta:'기사 전문'}});
  assert.deepEqual(section.table!.rows,[['한진칼','-','+12.77%'],['삼성전자','199,400원','+5.00%'],['카카오','-','-1.00%']]);
  assert.equal(section.paragraphs!.length,2);
  assert.match(section.paragraphs![1]!.text,/^다음 확인: 환율/);
  const html=renderDailyReportArticle({date:'2026-11-11',title:'[데일리 리포트] 2026년 11월 11일 국내 증시 핵심 정리',subtitle:'s',lead:'리포트입니다.',sections:[section],sources:[]}).html;
  assert.match(html,/한진칼[\s\S]*\+12\.77%/);
});
