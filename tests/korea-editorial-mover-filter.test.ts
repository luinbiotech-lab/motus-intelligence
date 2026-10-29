import test from 'node:test';
import assert from 'node:assert/strict';
import {isStructuredLeveragedProduct} from '../src/publishers/editorial-article.js';

test('structured leveraged and inverse products cannot dominate Korean stock mover analysis',()=>{
 for(const label of ['1Q SK하이닉스선물단일종목레버리지','RISE SK하이닉스단일종목레버리지','KODEX 인버스','삼성 ETN','ACE 반도체 ETF'])assert.equal(isStructuredLeveragedProduct(label),true,label);
 for(const label of ['삼성전자','SK하이닉스','현대차','반도체장비','소프트웨어'])assert.equal(isStructuredLeveragedProduct(label),false,label);
});

test('units reflect known source fields and untyped flow amounts are never displayed as currency',async()=>{const {koreaMetricWithUnit}=await import('../src/publishers/editorial-article.js');assert.equal(koreaMetricWithUnit({group:'SECTOR',label:'반도체',displayValue:'+11.24',direction:'UP'}).displayValue,'+11.24%');assert.equal(koreaMetricWithUnit({group:'FX',label:'USD/KRW 수집 시점 현재가',displayValue:'1,341',direction:'UP'}).displayValue,'1,341원');assert.equal(koreaMetricWithUnit({group:'FLOW',label:'외국인',displayValue:'+7,677',direction:'UP'}).displayValue,'순매수');assert.equal(koreaMetricWithUnit({group:'FLOW',label:'기관',displayValue:'+1,000억원',direction:'UP'}).displayValue,'+1,000억원')});
