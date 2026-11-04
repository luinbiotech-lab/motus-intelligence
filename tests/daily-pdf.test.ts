import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirstSplitDailyProductionRun} from '../src/intelligence/split-daily-production.js';
import {buildDailyPdfHtml,multiLine,stockRows} from '../src/reports/daily-pdf.js';

test('the daily briefing PDF is two pages of real fields for every category, with no placeholder values', () => {
  for(const unit of createFirstSplitDailyProductionRun().units){
    const pdf=buildDailyPdfHtml(unit.viewModel as never,unit.category as never,'test');
    assert.equal((pdf.html.match(/<div class=page>/g)??[]).length,2,unit.category);
    assert.match(pdf.fileName,/^MOTUS_(AI|US|Korea)_Daily_\d{4}-\d{2}-\d{2}\.pdf$/);
    assert.doesNotMatch(pdf.html,/undefined|NaN|Infinity|15,612|Morgan Stanley|Goldman/);
  }
});

test('stock rows come from the article sentences, and the comparison chart rebases to 100', () => {
  const view={deepSections:[{key:'us-sectors-stocks',paragraphs:[{text:'알파벳(GOOG)은 251.20달러로 11.15% 급락했다(야후 파이낸스 검색 1위).'}]},{key:'korea-stocks',paragraphs:[{text:'검색 1위 삼성전자는 222,000원으로 3.06% 하락했다.'}]}]} as never;
  assert.deepEqual(stockRows(view),[{name:'알파벳(GOOG)',close:'$251.20',change:-11.15},{name:'삼성전자',close:'222,000원',change:-3.06}]);
  assert.deepEqual(stockRows({deepSections:[{key:'ai-stocks',paragraphs:[{text:'아마존 +2.20% · 알파벳 -0.30% · 오라클 -8.76%'}]}]} as never).map(row=>row.change),[2.2,-0.3,-8.76]);
  assert.match(multiLine([{label:'S&P 500',points:[100,101,102]},{label:'나스닥',points:[200,198,196]}]),/\+2\.0%[\s\S]*-2\.0%/);
});
