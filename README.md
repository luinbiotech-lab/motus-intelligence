# 미국 주식시장 마감 리포트 — Sprint 2H

미국 마감 자료를 수동 입력하거나 일부 공식 어댑터로 수집하여 검증 → claim 단위 교차검증 → 조건부 한국시장 영향 → 사람 검수표 → publish-ready 초안 → 공개용 editorial 출력 → 내부 관리자용 A4 MASTER 리서치 포스터까지 만드는 **비공개 로컬 CLI**입니다. 공개 채널은 `MOTUS | What Moves the World`이며 `https://motusnova.blogspot.com/`을 사용합니다. Engine과 MOTUS Blog Publisher는 공통 content schema만 공유하고 Publisher는 별도 계층으로 유지합니다. 실제 Blogger 쓰기는 preview와 사람 승인을 거친 뒤, blogId와 OAuth credential이 모두 환경 변수에 있을 때만 실행합니다.

## 실행

Node.js 24 이상과 npm이 필요합니다. 개발 의존성은 lockfile로 고정합니다.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run sample
npm.cmd run motus:daily -- --date 2026-10-01 --all --dry-run --review-package
npm.cmd run motus:search -- --provider google --date-range 28d --dry-run --audit
npm.cmd run motus:report -- --type us-market-daily --date 2026-09-30 --generate --validate --dry-run
npm.cmd run motus:library -- --search OpenAI
```

실제 수동 자료는 [수동 입력 안내](docs/manual-input.md)에 따라 준비한 뒤 실행합니다.

## MOTUS Content Library

`npm run motus:library`는 기본적으로 읽기 전용 dry-run으로 동작합니다. 검증된 2026-09-29/30 production record를 로컬 영속 저장소에 반영할 때만 `npm run motus:library -- --ingest`를 사용합니다. 이 명령은 `data/library/` 아래에 schema-versioned registry, event, research, relationship, history, evergreen, audit 및 operator package JSON을 기록하며 Blogger·Drive·PDF 공개 작업은 호출하지 않습니다.

`--company`, `--theme`, `--institution`, `--market`, `--period`, `--evergreen`, `--audit` 조회를 지원합니다. `--dry-run`은 `--ingest`와 함께 주어도 파일을 쓰지 않습니다. Canonical alias가 여러 entity 후보와 일치하면 자동 병합하지 않고 `REVIEW_REQUIRED`로 남깁니다. 검색 성과는 audience signal로만 저장하며 entity 중요도나 검증 상태를 바꾸지 않습니다.

`npm run motus:retrieve`는 Content Library를 canonical ID와 relationship graph로 조회합니다. `--company`, `--theme`, `--event`, `--institution`, `--sector`, `--market`, `--from`, `--to`와 `--timeline`, `--retrospective`, `--precedents`, `--prior-coverage`, `--memory`를 조합할 수 있습니다. `--audit`은 샘플 retrieval과 Editorial Memory를 `data/retrieval/YYYY-MM-DD/` 및 `data/library/memory/`에 로컬 저장하지만 Blogger·Drive·공개 PDF 작업은 호출하지 않습니다. 비교 기간이 없으면 trend나 변화 결론을 생성하지 않습니다.

`npm run motus:editorial-cycle`은 Content Library와 Editorial Memory를 조회해 카테고리별 `DailyEditorialPlan`과 로컬 preview를 생성합니다. 후보는 `NEW`, `FOLLOW_UP`, `RELATED`, `DUPLICATE`로 분류하고 점수나 임의 순위 없이 `LEAD`, `STANDARD`, `BRIEF`, `FOLLOW_UP`, `DEFER`, `REJECT`를 기록합니다. `--execute-drafts`를 명시하면 원격 중복 조회 후 품질 게이트를 통과한 항목만 Blogger Draft로 생성하며 publish는 호출하지 않습니다. post-publish Content Library, Weekly feed, Search registration은 Human Review `APPROVED`와 실제 공개 URL 확인 뒤에만 활성화합니다.

```powershell
npm.cmd run report -- --input data/manual/day.json
npm.cmd run report -- --input data/manual/2026-09-11/input.json
npm.cmd run build
node scripts/build-golden-day.mjs
node scripts/build-golden-claims.mjs
npm.cmd run report -- --input data/manual/2026-09-11/input-api.json
node dist/src/cli.js --review data/evidence/<reportId>.json
node dist/src/cli.js --apply-review-actions data/evidence/<reportId>.json data/reports/<reportId>.json data/reviews/YYYY-MM-DD/actions.json
node dist/src/cli.js --editorial data/reports/<reportId>.json data/evidence/<reportId>.json
node dist/src/cli.js --brokerage-report data/reports/<reportId>.json data/evidence/<reportId>.json
node dist/src/cli.js --a4-master data/reports/<reportId>.json data/evidence/<reportId>.json
node dist/src/cli.js --a4-master data/reports/<reportId>.json data/evidence/<reportId>.json --regenerate
node dist/src/cli.js --blogger-preview data/reports/<reportId>.json data/evidence/<reportId>.json
node dist/src/cli.js --blogger-approve data/blogger/YYYY-MM-DD/<reportId>-publication.json
Set-Item Env:BLOGGER_BLOG_ID '<Google Blogger blog ID>'
Set-Item Env:BLOGGER_CLIENT_ID '<Google Desktop OAuth client ID>'
Set-Item Env:BLOGGER_CLIENT_SECRET '<Google Desktop OAuth client secret>'
npm.cmd run blogger:oauth
node dist/src/cli.js --blogger-publish data/blogger/YYYY-MM-DD/<reportId>-publication.json
node dist/src/cli.js --blogger-update-draft data/blogger/YYYY-MM-DD/<reportId>-publication.json preview.html preview.json <draftPostId>
```

`blogger:oauth`는 `127.0.0.1`의 임시 callback 서버를 열고 기본 브라우저에서 Google 동의 화면을 표시합니다. 요청 scope는 `https://www.googleapis.com/auth/blogger` 하나이며 offline access와 명시적 consent를 사용합니다. Authorization code 교환으로 받은 refresh token은 저장 전에 같은 client credential로 즉시 access token 교환을 검증합니다. 이 self-test가 통과한 경우에만 프로그램이 원본 토큰을 표준입력으로 별도 Windows 프로세스에 전달해 사용자 환경변수 `BLOGGER_REFRESH_TOKEN`에 직접 저장합니다. 저장값을 다시 읽어 원본과 8자리 SHA-256 fingerprint를 비교하며 CR/LF와 둘레 따옴표 오염도 검사합니다. 토큰은 클립보드·파일·명령행·로그에 기록하지 않습니다. 사용자 거부, callback 검증 실패, refresh token 미발급 또는 self-test 실패 시 credential을 저장하거나 게시하지 않습니다. 기존 `BLOGGER_OAUTH_TOKEN`은 짧게 유효한 access token을 직접 주입할 때만 쓰는 deprecated fallback입니다.

`--blogger-update-draft`는 publication record의 기존 `draftPostId`와 원격 `DRAFT` 상태를 먼저 확인한 뒤 Blogger `posts.patch`로 title과 content만 갱신합니다. 작업 전후 draft 목록 수와 동일 post ID를 재검증하며 publish endpoint나 `posts.insert`는 호출하지 않습니다.

`report`는 빌드된 CLI를 사용합니다. 코드 수정 후 `npm.cmd run build`를 실행하세요. `sample`과 `test`는 자동으로 빌드합니다. 경로는 프로젝트 루트 기준입니다.

결과는 `data/reports/<reportId>.md`, `data/reports/<reportId>.json`, `data/evidence/<reportId>.json`에 저장됩니다. Review Sheet는 `data/reviews/YYYY-MM-DD/`, publish-ready 초안·diff·reviewed evidence는 `data/publish-ready/YYYY-MM-DD/`에 저장됩니다. Editorial 출력은 `data/editorial/YYYY-MM-DD/`, 내부 A4 MASTER는 `data/a4-master/YYYY-MM-DD/`, 이전 내부 요약은 `data/brokerage/YYYY-MM-DD/`에 저장됩니다. 같은 입력·출처 설정·규칙은 같은 reportId를 사용하며 다시 실행하면 파생 출력이 갱신됩니다. A4 MASTER는 `reportId + rendererVersion` 기준으로 캐시하고 `--regenerate`를 지정할 때만 새로 씁니다. `data/reports`와 `data/evidence` 출력 파일은 Git에서 제외합니다.

## 결과 해석

| CLI 상태 | 의미 | 종료 코드 |
| --- | --- | --- |
| PASS | 입력 처리 및 생성 검증 통과. 발행 승인 아님 | 0 |
| REVIEW_REQUIRED | 누락·충돌·지연·저신뢰·중복 등 검수 필요 | 0 |
| FAILED | 개별 입력에 잘못된 타입·수치 등이 있음. 유효 자료는 계속 처리 | 2 |
| BLOCKED | 입력 envelope·설정·거래일 정보가 유효하지 않음 | 3 |

검수 목록이 원고와 CLI에서 먼저 표시됩니다. 근거 패키지는 `manualReviewStatus=PENDING`, `publishStatus=BLOCKED`가 기본입니다. `approvalStatus=AUTO_VALIDATED|REVIEW_REQUIRED|APPROVED|BLOCKED|PUBLISHED`를 별도로 보존하며, APPROVED 전 발행은 차단합니다. Sprint 2D부터 수동 action이 없으면 `AUTO_VALIDATED`를 자동으로 `APPROVED`로 승격하지 않습니다. 샘플의 PASS는 테스트 성공만 뜻하며 샘플 발행은 금지합니다.

공개 Blogger/Naver 출력에는 내부 `claimId`, `reportId`, approval status, pipeline status를 표시하지 않습니다. B/C/D 콘텐츠는 Daily A와 달리 항상 생성하지 않고 opportunity 판단 결과로 추천 여부만 기록합니다. 금융용어 해설은 공개 본문에 실제 등장한 용어만 3~8개로 제한하고 Evergreen 연결 키를 함께 보존합니다.

MOTUS Intelligence 공통 연구 계약은 `config/motus-intelligence.schema.v1.json`과 `src/intelligence/schema.ts`에 정의합니다. AI Intelligence, Wall Street Intelligence, Korea Market Intelligence, 기존 US Market Daily가 같은 company/theme/event ID와 Claim/Evidence provenance를 사용합니다. 기관 원문 관점인 `institutionView`와 MOTUS 해석인 `aiInterpretation`은 독립 필드이며 서로 대체하지 않습니다. 기존 Daily 파이프라인은 `adaptDailyReportToIntelligence`라는 순수 compatibility adapter로 연결하므로 기존 report/evidence, 검증 상태, Blogger/A4 출력은 변경되지 않습니다.

AI Intelligence intake는 `src/intelligence/ai-intake.ts`에서 별도 계층으로 운영합니다. OFFICIAL, COMPANY_IR, REGULATORY, PRIMARY_MEDIA, SECONDARY_MEDIA, MANUAL 출처를 구분하고 원래 출처 종류를 provenance에 보존합니다. URL, headline fingerprint, company/theme/time-window 중복을 차단하며 같은 `eventId`의 독립 출처는 Claim/Evidence provenance를 합쳐 하나의 event item으로 묶습니다. URL이나 source published time이 없으면 대체값을 만들지 않고 해당 입력을 거부합니다.

하나의 AI event는 여러 theme에 연결할 수 있습니다. 기존 `themeId`는 primary theme로 유지하고 선택적 `relatedThemeIds`에 추가 canonical theme를 보존합니다. Alias는 canonical theme ID로 합치며, `provenance.themeLinks`가 theme별 evidence/source 연결을 추적합니다. 기존 단일-theme item과 US Market compatibility output은 새 선택 필드 없이도 계속 유효합니다.

MOTUS Daily Intelligence newsletter는 기존 Daily Market 게시물을 대체하지 않는 별도 presentation layer입니다. `NewsletterViewModel`이 Today at a Glance, Market Snapshot, AI/Wall Street/Korea/Cross Intelligence, Investment Map, What to Watch, Sources를 고정 순서로 구성하며 빈 section은 만들지 않습니다. Blogger renderer는 기존 inline-style 톤과 검증된 미국 주요지수 2×2 차트를 재사용하고, 기관 의견·MOTUS 해석·source fact를 서로 다른 공개 필드로 렌더링합니다. DAILY/TOPIC/WEEKLY/EVERGREEN asset metadata와 Google Alerts, Gmail, RSS, 공식 자료, 기존 수집, content library용 adapter boundary만 정의하며 기존 Apps Script는 변경하지 않습니다.

한국시장 Market Fact intake는 `src/intelligence/korea-market.ts`에서 별도 계층으로 운영합니다. KOSPI, KOSDAQ, USD/KRW와 투자자 수급, 거래대금, 프로그램 매매, 업종, 등락 종목 및 시장 폭을 정규화하며 출처 URL과 관측·수집 시각이 없으면 입력을 거부합니다. 투자자 구분은 `FOREIGN|INSTITUTION|RETAIL`, 금액은 내부 `KRW_MILLION`으로 통일하고 업종 ID와 표시명을 분리합니다. Market Fact에는 기관 의견이나 MOTUS AI 해석을 넣을 수 없으며, 검증 가능한 fact가 없으면 Newsletter의 Korea Market section 자체를 생략합니다. `KoreaMarketAdapter`를 통해 KRX, BOK ECOS, 공식 시장 자료, 검증된 공개 자료 및 수동 검증 자료의 live adapter를 이후 추가할 수 있습니다.

국내 증권사 공개 리서치는 `src/intelligence/brokerage-research.ts`의 별도 intake 계약으로 처리합니다. 기관 registry가 증권사 이름과 alias를 canonical publisher로 변환하며 기관별 scraper를 포함하지 않습니다. 목표주가와 투자의견은 현재값·이전값·변경 방향을 구조화하고, 원문에 없는 값은 추정하지 않습니다. 동일 기관의 canonical URL 또는 기관·제목·발행시각·회사/테마가 같은 PDF/HTML은 하나로 병합하되 모든 원문 URL, 페이지·section, 추출 필드와 evidence provenance를 보존합니다. 검증된 리서치만 선택적 Korea Research Newsletter section에 연결하며 기관 원문 관점과 MOTUS AI 해석은 분리해 표시합니다.

Cross Intelligence Engine은 `src/intelligence/cross-intelligence.ts`에서 AI Intelligence, Wall Street/US Market, Korea Research, Korea Market Fact를 event → theme → company → sector → evidence/source 순으로 연결합니다. 서로 다른 명시적 event는 같은 theme만으로 합치지 않으며 시간 근접성은 기존 edge의 보조 provenance로만 기록합니다. 공통·차이 신호는 source의 명시적 stance, 투자의견·목표주가 변경, 시장 반응에서만 구성하고 history가 없으면 변화 신호를 만들지 않습니다. AI 연결 요약은 호출자가 provenance와 함께 제공한 경우에만 별도 필드로 보존하며 source fact나 기관 의견을 대체하지 않습니다. Newsletter는 검증된 chain의 존재하는 단계만 AI & Industry → Wall Street → Korea Research → Korea Market Reaction 순서로 표시합니다.

Investment Map v1은 `src/intelligence/investment-map.ts`에서 검증된 Wall Street research, Korea Brokerage Research, AI/industry theme와 Cross Intelligence chain을 집계합니다. 동일 research ID, 기관·제목·발행시각, canonical source, 기관·event 중복을 먼저 제거하고 deduped report 집합으로만 언급 수와 기관 수를 계산합니다. Market Fact는 관심도 count에서 제외하고 Cross chain에 연결된 시장 반응에만 사용합니다. 목표주가·투자의견 변경과 전략·risk는 원문 구조화 필드만 사용하며 추천, 점수, 별점이나 임의 ranking을 만들지 않습니다. Emerging/increased/decreased attention은 이전 deduped snapshot이 있을 때만 생성합니다. A4 compact view는 실제 언급·기관 수로 정렬하고 표시 한도 경계의 동률 그룹을 자르지 않습니다.

Sprint 3G production layer는 `src/intelligence/daily-production.ts`에서 검증된 AI, Wall Street, Korea Market, Korea Research, Cross Intelligence, Investment Map을 한 번만 조립해 단일 `NewsletterViewModel`과 content fingerprint를 만듭니다. Blogger, Email, A4 preview는 이 모델만 읽고 빈 section을 생략합니다. Preview는 Human Review 전에도 만들 수 있지만 Blogger publish, Email send, public A4 release는 공통 review가 `APPROVED`일 때만 허용합니다. Morning operator boundary는 collect → assemble → review-ready → preview까지만 수행하며 외부 발행·전송·배포를 자동 실행하지 않습니다. Compact 출력 경계의 동률은 `tiedBoundaryCounts`로 보존하고 “외 동일 관심도 N개”로 표시합니다.

Sprint 4D presentation layer는 `src/intelligence/daily-masters.ts`에서 기존 `NewsletterViewModel`을 AI 인텔리전스, 미국증시, 국내증시의 독립 Daily publication ViewModel로 나눕니다. 공통 검증 데이터를 다시 분석하지 않으며 기존 Daily Intelligence renderer와 공개 이력도 유지합니다. Blogger label용 canonical name과 한·영 display label을 분리하고, 시장 등락은 한국 관행에 따라 상승 빨강·하락 파랑·보합 슬레이트로 표시합니다. 미국 Daily는 실제 5거래일 4대 지수 차트에 종가와 등락을 결합하고 별도 중복 지수 카드를 만들지 않습니다. 국내 Daily는 검증된 history가 없으면 선형 차트를 만들지 않으며 투자자 수급과 실제 업종 등락을 방향형 시각화로 표시합니다. 용어해설과 PDF CTA는 조건을 충족할 때만 노출됩니다. Weekly/Monthly는 Cross Intelligence, Consensus/Divergence, Investment Map, 변화 추적을 위한 경계만 제공합니다. `npm run intelligence:editorial-ia-preview`는 첫 공개 글을 수정하지 않고 세 MASTER의 로컬 side-by-side preview를 생성합니다. Commerce는 이 계층에 포함되지 않으며 `enabled=false` 운영 조건을 유지합니다.

Sprint 4F production foundation은 `src/intelligence/periodic-production.ts`에서 검증된 Daily 구조와 intelligence record를 Weekly/Monthly ViewModel로 집계합니다. 단일 관측으로 변화 추세를 만들지 않으며, Consensus는 같은 주제와 방향을 명시한 독립 기관 2곳 이상 및 evidence가 있을 때만, Divergence는 같은 대상에 대한 실제 상반 관점과 evidence가 있을 때만 생성합니다. Event-to-Market review는 후속 시장 반응이 확인되지 않으면 `null`을 유지합니다. Weekly PDF는 3~5쪽 compact ViewModel, Monthly PDF는 long-form ViewModel로 Blogger HTML과 분리합니다. Reports Archive는 Daily/Weekly/Monthly 그룹 및 연·월·카테고리·report type 필터를 지원하고, HTTPS PDF와 실제 article URL이 확인된 경우에만 CTA를 표시합니다. `npm run intelligence:periodic-preview`는 로컬 preview와 review package만 생성하며 Blogger 원격 동작은 수행하지 않습니다.

MOTUS publication hierarchy:

```text
DAILY
├ AI Intelligence
├ U.S. Market
└ Korea Market
WEEKLY
└ Weekly Intelligence
MONTHLY
└ Monthly Intelligence
REPORTS
├ Daily PDFs
├ Weekly PDF
└ Monthly PDF
```

Blogger는 publishing channel이고, MOTUS Intelligence는 검증·집계·표현을 담당하는 product/system입니다.

Sprint 4G daily operations는 `src/operations/daily-orchestrator.ts`에서 AI Intelligence, U.S. Market, Korea Market을 독립적으로 collect → normalize → verify → dedupe → assemble → quality gate → preview → review package → audit 순서로 실행합니다. 각 stage는 시작·완료 시각과 입출력 fingerprint를 기록하며 한 category의 실패는 다른 category를 중단하지 않습니다. 동일 category·issueDate·input fingerprint는 `UNCHANGED`, 입력 변경은 `INPUT_CHANGED`, 명시적 재생성은 `REGENERATED`로 구분합니다. 일시적 network/rate-limit/upstream 5xx만 제한적으로 재시도하고 인증·파싱·검증 충돌은 자동 재시도하지 않습니다. 완료된 verified structured record만 Weekly/Monthly feed에 등록하며 public publish 여부와 분리합니다. 비용을 알 수 없으면 token usage와 cost는 `null`로 유지합니다.

`npm run motus:daily -- --date YYYY-MM-DD --all --dry-run --review-package`는 `data/operations/YYYY-MM-DD/` 아래에 category preview와 review, Morning Operator package, selection audit, source failure, periodic feed를 생성합니다. 입력이 같으면 `UNCHANGED`로 종료하며, 운영자가 명시적으로 다시 만들 때만 `--force`를 추가합니다. 기본 동작은 항상 dry-run이며 Sprint 4G에서는 Blogger insert·patch·publish 및 theme/menu 변경을 호출하지 않습니다.

MOTUS Audience Loop은 **Publish → Discover → Index → Search Impression → Click → Read → Related Content → Weekly/Monthly → Performance Learning** 순서로 추적합니다. `npm run motus:search -- --provider google|naver --date-range 7d|28d|90d --publication ID --dry-run --audit`는 기본적으로 read-only이며, 연결된 property와 credential이 없으면 0건으로 가장하지 않고 `NOT_CONFIGURED` 또는 `MANUAL_REQUIRED`를 기록합니다. Google Search Console과 Naver 측정치는 provider별로 유지하며 임의 합산하지 않습니다. 일반 기사에 Google Indexing API를 사용하지 않고, IndexNow도 검증된 key·key location·소유권·설정과 별도 승인이 있기 전까지 `enabled=false`입니다.

검색 성과는 Editorial Audit과 Content Library에 연결할 수 있지만 클릭 수만으로 기사 주제를 선정하지 않습니다. 출처 검증, 독자에게 필요한 설명, 편집 품질을 우선하고 검색 지표는 이후 성과 학습의 근거로만 사용합니다.

`npm run motus:report`는 검증된 publication ViewModel에서 Daily PDF를 독립 렌더링하고 `data/reports/` 아래에 `report.pdf`, `artifact.json`, `validation.json`, `review.json`을 생성합니다. 기본 저장소는 `LOCAL_ONLY`이며 Human Review `APPROVED`와 검증된 storage adapter가 없으면 `--upload`를 거부합니다. Weekly/Monthly foundation은 현재 `HOLD` 데이터를 `SAMPLE / PREVIEW`로만 취급합니다. PDF 다운로드 CTA는 publication이 `PUBLISHED`, artifact가 `PUBLIC_AVAILABLE`, HTTPS PDF URL이 검증된 경우에만 노출할 수 있습니다.

`--type`, `--date`, `--period`, `--generate`, `--validate`, `--dry-run`을 지원합니다. `--dry-run`은 선택된 verified ViewModel과 canonical 파일명만 출력하고 파일이나 외부 상태를 변경하지 않습니다.

`npm run motus:report-review`는 Daily PDF 3종의 PENDING Human Review package와 페이지 contact sheet를 만들고, Weekly HOLD ViewModel을 `SAMPLE · PREVIEW · NOT FOR PUBLICATION` 표시가 있는 4페이지 PDF로 렌더링합니다. Monthly PDF는 생성하지 않고 HOLD를 유지합니다.

`npm run motus:report-storage -- --provider google-drive --check`는 Drive 구성 상태와 folder registry, upload plan을 생성합니다. 기본 정책은 `WRITE_ENABLED=false`, `PUBLIC_SHARE_ENABLED=false`이며 실제 업로드·폴더 생성·권한 변경은 수행하지 않습니다.

A4 MASTER 생성은 관리자 전용 boundary를 통과해야 하며, 공개 route에서 호출할 수 없습니다. 개발환경에서는 `src/services/admin.ts`의 server-side authorization boundary와 `data/a4-master/YYYY-MM-DD/admin-a4-route.html`로 내부 route 화면을 분리합니다.

실제 Blogger 연결 설정은 `config/publishing.json`에 MOTUS 브랜드·공개 주소, 환경 변수 이름과 `publishAsDraft` 정책만 저장합니다. blogId, client secret, refresh token, access token 값은 저장소 파일에 기록하지 않습니다. Publisher는 `BLOGGER_REFRESH_TOKEN`으로 access token을 자동 갱신한 뒤 Google Blogger API v3의 `posts.insert?isDraft=true`를 호출합니다. refresh credential이 일부 누락되거나 갱신에 실패하면 게시 요청을 보내지 않습니다. Publication record는 초안 식별자인 `draftPostId`와 공개 글 주소인 `publicPostUrl`을 분리하며, `DRAFT`에서는 `publicPostUrl=null`을 유지합니다. 실제 게시 후 확인된 글 permalink만 A4 CTA/QR과 Naver package에 반영하고 Blogger 루트 URL이나 preview URL은 상세분석 링크로 사용하지 않습니다. 공개 CTA는 “전체 분석은 MOTUS에서 확인하세요”로 통일합니다.

## 중요한 파일

- `src/domain/models.ts`: 공통 엔터티 8종, 판단 필드, 사후 설명력 평가 모델
- `src/data/schemas.ts`: 수동 입력·출처·규칙의 엄격한 런타임 스키마
- `config/sources.json`: 실제/테스트 출처 registry. `US_TREASURY`, `BLS`, `SEC_EDGAR` 공식 어댑터 연결
- `config/us-korea-rules.v1.json`: 10개 대표 산업, 12개 전달경로를 다루는 13개 규칙
- `src/services/validation.ts`: 입력 검증, 중복·충돌 격리
- `src/services/analysis.ts`: 근거별 규칙 점수화
- `src/services/pipeline.ts`: 단계 상태, 부분 실패 처리, 근거 패키지
- `src/services/report.ts`: 9개 목차와 Markdown 생성
- `src/services/cross-verification.ts`: ClaimRecord, ConflictRecord, 지정학 검증, confidence score
- `src/services/review.ts`: review queue, review sheet, manual action, approval gate, publish-ready draft, machine/human diff
- `src/services/editorial.ts`: Blogger Daily renderer, B/C/D opportunity engine, dynamic glossary, Naver intro, on-demand A4 brokerage renderer
- `src/services/a4-visual.ts`: A4 MASTER HTML/PDF/PNG renderer, Naver posting package, cache metadata
- `src/services/admin.ts`: admin-only A4 generation boundary와 route HTML
- `src/services/blogger.ts`: Blogger publication state machine, dry-run adapter, Google Blogger API v3 draft adapter
- `src/services/blogger-oauth.ts`: Desktop OAuth authorization URL, loopback callback, authorization-code 교환
- `src/content/publisher-schema.ts`: Engine과 Publisher가 공유하는 글로벌 콘텐츠 metadata schema
- `src/intelligence/schema.ts`: MOTUS Intelligence 공통 타입과 런타임 validator
- `src/intelligence/compatibility.ts`: 기존 Daily report/evidence를 변경 없이 공통 schema로 연결하는 adapter
- `src/intelligence/ai-intake.ts`: AI source adapter 계약, guard, 정규화, dedupe와 event/theme grouping
- `src/intelligence/newsletter.ts`: NewsletterViewModel, content asset metadata, legacy AI News adapter boundary
- `src/intelligence/korea-market.ts`: 한국시장 Market Fact schema, adapter, guard, canonicalization과 Newsletter 변환
- `src/intelligence/brokerage-research.ts`: 국내 증권사 registry, 공개 리서치 intake, dedupe와 Newsletter 변환
- `src/intelligence/cross-intelligence.ts`: 공통 ID 연결, edge provenance, 합의·차이·변화 신호와 Newsletter 변환
- `src/intelligence/investment-map.ts`: 리서치 dedupe, 관심도·종목·변경·risk 집계, history 비교와 A4 compact view
- `src/intelligence/daily-production.ts`: single-source Daily assembler, Email/A4 preview, 공통 Human Review gate와 morning operator boundary
- `config/motus-intelligence.schema.v1.json`: 외부 소비자를 위한 JSON Schema 계약
- `src/publishers/motus.ts`: MOTUS 브랜드, 카테고리, Blogger HTML과 labels를 담당하는 독립 Publisher
- `src/publishers/motus-newsletter.ts`: 별도 MOTUS Daily Intelligence Blogger-safe newsletter renderer
- `config/publishing.json`: Blogger URL 정책, 환경 변수 이름, draft-first 설정
- `data/fixtures/sample-day.json`: 실행 가능한 통합 샘플. 분리된 sample-*.json은 각 입력 영역의 예시
- `data/manual/2026-09-11/input.json`: 2026-09-11 실제 정규 거래일 수동 검증 리허설 입력
- `data/manual/2026-09-11/input-api.json`: Treasury/BLS/SEC 어댑터 산출물을 일부 투입한 golden day 입력
- `data/golden/2026-09-11/`: 원본 source snapshot, expected normalized result, manual/API 비교표, claim 검증 결과
- `tests/pipeline.test.ts`: 요구 시나리오와 회귀 테스트
- `tests/intelligence.test.ts`: AI/Wall Street/Korea validation, 공통 ID, provenance, Daily/Blogger/A4 호환성 회귀 테스트
- `tests/ai-intake.test.ts`: AI source type, dedupe, multi-source merge, provenance 및 기존 출력 회귀 테스트
- `tests/newsletter.test.ts`: newsletter validation, section omission, rendering hierarchy, mobile/chart 및 publication 회귀 테스트
- `tests/korea-market.test.ts`: 한국 지수·환율·수급·단위·업종·provenance·Newsletter 연결 테스트
- `tests/brokerage-research.test.ts`: 증권사 리서치 유형·목표주가·투자의견·mirror 병합·provenance 테스트
- `tests/cross-intelligence.test.ts`: event/theme/company/sector 연결, 신호 구조, history와 공개 렌더링 테스트
- `tests/investment-map.test.ts`: dedupe count, focus·종목·변경·risk·history 집계와 Newsletter/A4 테스트
- `tests/daily-production.test.ts`: full/partial assembly, 채널 일관성, review gate, tie metadata, chart·leakage 테스트
- `npm run intelligence:golden-rehearsal`: 2026-09-29 실제 공개자료를 기존 intake와 Daily production layer에 통과시켜 Blogger·Email·A4 비공개 preview 및 PENDING Human Review package를 생성한다. 외부 publish/send/release는 수행하지 않는다.

[구조](docs/architecture.md) · [수동 입력](docs/manual-input.md) · [규칙](docs/rules.md) · [출처 운영](docs/data-sources.md) · [문제 및 회귀 방지](docs/issues.md) · [Sprint 1 완료 보고](docs/sprint-report.md) · [Sprint 2A 완료 보고](docs/sprint-2a-report.md) · [Sprint 2B 완료 보고](docs/sprint-2b-report.md) · [Sprint 2C 완료 보고](docs/sprint-2c-report.md) · [Sprint 2D 완료 보고](docs/sprint-2d-report.md) · [Sprint 2E 완료 보고](docs/sprint-2e-report.md) · [Sprint 2F 완료 보고](docs/sprint-2f-report.md) · [Sprint 2G 완료 보고](docs/sprint-2g-report.md) · [Sprint 2H 진행 보고](docs/sprint-2h-report.md)
## Search Intelligence / Audience Demand

`npm run search:intelligence`는 발행 전 검색 수요 계층을 로컬 dry-run으로 실행한다. 기존 Search Console 성과 측정은 재사용하고, Naver DataLab은 `NAVER_DATALAB_CLIENT_ID`와 `NAVER_DATALAB_CLIENT_SECRET`이 있을 때만 연결한다. Search Console live adapter는 `https://www.googleapis.com/auth/webmasters.readonly` 범위와 검증된 property를 사용하는 구현을 주입한다.

운영 순서는 “검증된 사실 → 검색·독자 수요 → 편집 관점 → 심층 기사 → SEO → 발행 게이트”다. 수요 신호는 VERIFIED 주제와 연결된 경우에만 제목·본문 후보로 사용할 수 있으며, Human Review 상태와 HOLD를 바꾸지 않는다. 공급자 장애는 경고로 격리하고 정상 Daily를 중단하지 않는다. 내부 ratio, click, impression과 signal ID는 공개 renderer 입력에서 제외한다. 미국 주요지수 차트의 목표 창은 실제 63거래일이며, 검증된 이력이 부족하면 현재 실제 구간을 그대로 유지하고 값을 합성하지 않는다. 자동 발행은 production workflow의 명시적 arm 전까지 기본 비활성이고 Commerce는 계속 비활성이다. live Search 실행은 같은 날짜·카테고리의 검증된 `live-unit.json`에서만 주제를 가져오며, unit이나 provider가 없으면 경고만 남기고 core Daily gate를 바꾸지 않는다.

## Phase 2 live production boundary

`npm run motus:live -- --date YYYY-MM-DD --category ai|us|korea --source internal`은 repository 내부 source adapters를 production 기본값으로 실행한다. `--source http`는 선택적 외부 통합, `--source snapshot`은 regression 전용이다. 미완료·휴장·stale·불완전 source는 fallback 없이 HOLD artifact를 기록한다. U.S. Market은 FRED와 Twelve Data의 실제 관측치로 4개 지수 63거래일 close/provenance와 VIX, 미국 10년물, DXY, Brent를 요구한다. Korea Market은 Naver primary fact를 KRX 공식 KOSPI/KOSDAQ 종가와 같은 기준일로 비교하고 실제 허용오차를 통과해야 하며, BOK ECOS 환율은 설정된 경우 추가 공식 비교로 사용한다. 결과는 `cross-verification.json`에 보존한다. AI 공식 이벤트가 2건 미만인 날은 오류성 HOLD가 아니라 정상 `SKIP`으로 분류한다.

`npm run motus:publish -- --date YYYY-MM-DD --category ai|us|korea`는 기본적으로 gate simulation만 수행한다. 실제 Blogger 쓰기는 `--execute`와 `MOTUS_LIVE_PUBLISH_ENABLED=true`가 함께 있을 때만 가능하다. 공통 gate는 VERIFIED, 충돌·중복 불확실성 없음, provenance/source/mobile/editorial/fingerprint 검증, Commerce disabled를 모두 요구하며 Search demand는 HOLD를 해제하지 않는다. `.github/workflows/motus-daily-production.yml`은 controlled publish 검증을 마친 AI 정규 schedule만 live publication을 활성화한다. US와 Korea schedule은 credential·provider 검증이 끝날 때까지 simulation-only이며, 수동 발행은 `execute_publish=true`를 명시한 workflow dispatch에서만 활성화된다. Source inventory는 [docs/live-source-inventory.md](docs/live-source-inventory.md)에 기록한다.
