/**
 * Article format standard (owner 2026-11-16, MOT-052): an improvement made for one article format must not be
 * missing from another. The weekly post went a week without the representative image (#105) and the search-phrase
 * title that every daily post already had, because nothing tied the formats together. Every workflow that can write
 * to Blogger is listed here; one that creates articles must meet the shared standard, and a new workflow fails this
 * test until it is classified.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {articleKeywords} from '../src/operations/traffic.js';

const root=process.cwd();
const read=(path:string)=>readFileSync(join(root,path),'utf8');

/** Workflows that publish new articles, with the source that builds each format's post and its Blogger label. */
export const ARTICLE_FORMATS=[
  {workflow:'motus-daily-production.yml',source:'src/operations/internal-live-daily.ts',labels:['국내증시','미국증시','AI 인텔리전스']},
  {workflow:'motus-daily-report.yml',source:'src/motus-daily-report-cli.ts',labels:['리포트']},
  {workflow:'motus-weekly-production.yml',source:'src/motus-weekly-cli.ts',labels:['주간 증시']},
] as const;
/** Workflows that hold Blogger credentials but never create an article (connection check, pages, fixes, reading). */
export const NON_ARTICLE_WORKFLOWS=['motus-blogger-connection.yml','motus-blogger-privacy-page.yml','motus-existing-korea-close-title-correction.yml','motus-traffic-daily.yml'];

test('every workflow with Blogger credentials is classified as an article format or as non-article', () => {
  const withBlogger=readdirSync(join(root,'.github/workflows')).filter(file=>/\.ya?ml$/.test(file)&&read(join('.github/workflows',file)).includes('BLOGGER_REFRESH_TOKEN'));
  const known=new Set<string>([...ARTICLE_FORMATS.map(item=>item.workflow),...NON_ARTICLE_WORKFLOWS]);
  for(const file of withBlogger)assert.ok(known.has(file),`${file} writes to Blogger but is not in the format standard; add it to ARTICLE_FORMATS (and meet the standard) or NON_ARTICLE_WORKFLOWS`);
});

test('every article format carries a representative image', () => {
  for(const format of ARTICLE_FORMATS){
    assert.match(read(join('.github/workflows',format.workflow)),/MOTUS_HERO_IMAGE:\s*'on'/,`${format.workflow} must turn the representative image on`);
    assert.match(read(format.source),/prepareHeroImage|heroImage/,`${format.source} must attach a representative image`);
  }
});

test('every article format is measured with search phrases people type', () => {
  for(const format of ARTICLE_FORMATS)for(const label of format.labels){
    if(label==='리포트')continue; // the daily report is an internal-link hub, measured as such (#97 11/8 decision)
    const keywords=articleKeywords(label==='주간 증시'?'주간 증시 전망(11/16~11/20)｜엔비디아 실적 주목…지난주 S&P 500 2.5% 상승·코스피 4.6% 상승':'11월 13일 코스피 마감, 0.98% 내려 5,290.53',[label]);
    assert.ok(keywords.length>=1,label);
    assert.ok(keywords.every(item=>!/[\d%]/.test(item)),`${label}: ${keywords.join(', ')} must not carry figures`);
  }
  assert.deepEqual(articleKeywords('주간 증시 전망(11/16~11/20)｜엔비디아 실적 주목',['주간 증시']),['주간 증시 전망','이번주 증시 전망']);
});
