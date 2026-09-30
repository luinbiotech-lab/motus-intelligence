import test from 'node:test';
import assert from 'node:assert/strict';
import { assessGoldenReview,createApprovedGoldenBloggerRecord,performGoldenHumanReview,verifyGoldenBloggerReadback } from '../src/intelligence/golden-review.js';
import type { BloggerPublishingConfig } from '../src/services/blogger.js';

const config:BloggerPublishingConfig={previewBaseUrl:'https://preview.local/motus',placeholderBaseUrl:'https://pending.local/motus',publicBaseUrl:'https://motusnova.blogspot.com/',blogId:'blog-id',publishAsDraft:true,publisher:{brand:'MOTUS',displayName:'MOTUS | What Moves the World',baseUrl:'https://motusnova.blogspot.com/',ctaText:'전체 분석은 MOTUS에서 확인하세요',categories:['Daily Market','AI & Industry','Global Company','Market / Investment Insight','Evergreen']}};

test('Sprint 4B records MODIFY then explicit human APPROVED after editorial corrections',()=>{
  const assessment=assessGoldenReview();assert.equal(assessment.status,'PENDING_HUMAN_APPROVAL');assert.equal(assessment.recommendation,'APPROVE');
  const review=performGoldenHumanReview('2026-09-30T19:00:00+09:00','APPROVED');assert.equal(review.decision,'APPROVED');assert.equal(review.reviewer,'human');assert.equal(review.checks.every(check=>check.status==='PASS'),true);assert.deepEqual(review.modificationHistory.map(item=>item.to),['MODIFY','APPROVED']);
  const record=createApprovedGoldenBloggerRecord(config,review);assert.equal(record.status,'APPROVED');assert.deepEqual(record.labels,['MOTUS Daily']);assert.equal(record.publicPostUrl,null);assert.equal(record.draftPostId,null);assert.doesNotMatch(record.html,/<h1\b|REVIEW_REQUIRED|claimId|eventId/i);
});

test('Sprint 4B actual Blogger readback gate covers layout, charts, links, mobile and leakage',()=>{
  const review=performGoldenHumanReview('2026-09-30T19:00:00+09:00','APPROVED');const record=createApprovedGoldenBloggerRecord(config,review);const article=record.html.match(/<article\b[^>]*>[\s\S]*<\/article>/i)?.[0]??'';
  const result=verifyGoldenBloggerReadback({postId:'DRAFT-1',status:'DRAFT',title:record.title,content:article,labels:['MOTUS Daily'],url:null});assert.equal(result.pass,true);assert.equal(result.svgCount,4);assert.equal(result.checks.internalTokens,true);assert.equal(result.checks.rawUrl,true);
});
