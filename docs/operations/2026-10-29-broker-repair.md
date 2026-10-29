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
