# 2026-10-29 market article repair

## Causes

- The repeated broker/media notice caused the October 29 publisher to HOLD. Main PR 48 corrected that repeated notice; the successful Korea run then SKIPPED an already-published October 28 session. It was not a newly published October 29 article.
- Goldman intake fetched only an index title/date/link; KB intake fetched two card bullets. Neither was a full report-analysis pipeline.
- Date.parse on a timezone-free Goldman date shifted the calendar date on non-UTC hosts.
- The old US narrative inferred broad investor risk appetite from three index directions. Index directions do not establish constituent breadth or investor flows.
- Korea displayed changeRate/fluctuationsRatio without percent symbols and numeric USD/KRW without currency. Investor-flow data has no unit metadata; a currency unit cannot be assumed from an unlabeled JSON number.

## Changes in existing PR 28

- Preserve main through 81de370 (PRs 42 and 44–55), including ledger SKIP reporting and existing-post title correction, while retaining PR 28's evidence, PDF, search and editorial gates.
- Fetch actual public Morgan Stanley transcript and Hana Securities report abstract. Extract each report's own title, author, publication date and text, retain its normalized-text SHA-256 and short evidence-anchor offsets, then connect reviewed Korean paraphrases to the article body.
- Distinguish OFFICIAL_TRANSCRIPT from OFFICIAL_REPORT_ABSTRACT. No claim of reading the Hana PDF, accessing paid research, or verifying targets is made.
- Reject missing, stale (>7 days), unsupported, cross-host, or unrendered analysis at verification and again at the final auto-publish gate. Bind analysis metadata to the persisted verification fingerprint.
- Display institutional opinion, MOTUS interpretation, limitations and follow-up checks as separate paragraphs with the source author/date/link. Render substantive analysis before charts.
- Remove unsupported index-to-breadth/risk-appetite causality; retain verified close comparisons and source-attributed institutional analysis.
- Add known units to percent/currency fields. When a flow amount has no verified unit, display the verified direction and preserve the untouched raw figure internally.

## Scope of the source reader

This is a bounded, reviewed paraphrase reader, not an unrestricted automatic translation or research model. Current supported passages are Mike Wilson's October 26 correction discussion and Lee Kyung-soo's October 27/28 sector-rotation abstract. Each requires matching text within its own report card. New/unrecognized passages remain HOLD until a corresponding supported, reviewed interpretation exists. Paid LLM calls, credentials and schedules are unchanged.

## Verification

- Integrated local npm test: 576 passed, 0 failed (includes local theme tests).
- Real public HTTP pages parsed successfully: Morgan Stanley / Mike Wilson / October 26; Hana Securities / Lee Kyung-soo / October 27 22:38:17 KST.
- Parsed source hashes and article coverage results: 2026-10-29-broker-analysis-live-check.json. Source HTML was temporary development input; it is not republished.
- Regression cases cover missing passages, card mixing, stale/future dates, cross-host redirects, provider outages, missing body analysis, metadata tampering, structured product filtering and unknown flow units.
- Main deployment and real publication are separate from these checks. This document is not proof of a new published article. Live workflow verification is recorded after it runs.

## 20:01–20:10 KST — publication and existing-post corrections

- Restored browser access allowed an explicit controlled US run, 40861970832 at code 69d2d95. Collection was LIVE_READY / VERIFIED; remote duplicate checks passed. Blogger insert=1 / publish=1; post 6139790651642929216 was published at 2026-10-29T20:01:00+09:00, https://motusnova.blogspot.com/2026/10/s-500.html. Operations persistence completed. Public readback confirmed Morgan Stanley author/date, attributed substantive paragraphs, original source link, three charts and dated Treasury percent/bp units.
- The Blogger editor opened under a different Google account, and its account-switch menu returned a generic error. No credentials or accounts were changed. The existing configured Blogger API workflow was used for exact-post corrections instead.
- Korea same-post body correction: read-only preview 40862798214, guarded apply 40862953815. Exact post 310165270483019628, original permalink and 2026-10-28T21:51:35+09:00 publication timestamp retained. Added Hana/Lee Kyung-soo report-abstract analysis; removed leveraged ETF clutter and unitless flow amounts; rendered known %/KRW units. No new Korea post was created. Public readback confirmed the corrected body.
- US same-post correction: read-only preview 40863044632, apply 40863248268. Removed only the paragraph exposing internal search/SEO editing rationale. Public readback confirms the paragraph is absent and the broker analysis remains.
- Both correction modes require exact blog/post/title/date/URL identity, SHA-256 from preview and no concurrent content/etag change. The original post and proposed HTML are uploaded before PATCH; a second read verifies content, labels, permalink and publication date. No automatic push trigger, insert or publish is used for corrections.

## Search comparison defect and code correction

The original 20:01 US publication used four verified DataLab candidate groups, but each included the common alias “미국증시”; some also repeated case-equivalent query terms. Shared category traffic can obscure candidate-specific interest. The original record is retained as historical evidence and must not be described as a clean, market-wide keyword ranking.

Code 27ae6ea removes shared aliases and case/space-equivalent duplicates before live candidate comparison. Final publication rejects ranking evidence with cross-topic term overlap. The internal SEO explanation was also removed from US/Korea generation. Two new regressions cover shared aliases and legacy overlapping proof. Local typecheck/build and combined Node suite: 578 PASS / 0 FAIL. Exact-head remote CI 40863588259: SUCCESS.

## Remaining operating limits

This session did not merge PR 28 to main, alter schedules, restart AI/labor generation, change credentials or obtain Claude independent approval. Scheduled production still uses main and therefore does not yet use these PR 28 changes. The broker reader still supports the explicitly reviewed MS and Hana passages described above; unsupported or stale new reports HOLD until their analysis is implemented and reviewed. The Korean historical article has no newly established search-ranking selection history. These limits remain open; successful publication alone is not certification of a complete daily research newsroom.

## 20:14 KST — distinct candidate comparison verified

Read-only live run 40863732232 at 27ae6ea returned LIVE_READY / VERIFIED. The corrected 2026-10-28 DataLab comparison contains no common category term: Nasdaq 100; US 10Y 17.35838; S&P 500 16.86494; Dow 13.92625. Nasdaq remains the selected secondary topic. These ratios compare only the configured candidates, not all searches. The earlier ratio near 79 for other candidates is superseded for current comparison purposes; its historical publication record is retained. No second publication was requested: execute_publish=false, final simulated duplicate uncertainty HOLD, publishCallCount=0. This does not undo or replace the verified 20:01 publication. The original published article was corrected in place as recorded above.

Machine-readable run IDs, receipts, hashes, search terms and outstanding limits are stored in 2026-10-29-broker-remote-check.json.
