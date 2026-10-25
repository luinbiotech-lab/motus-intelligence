# MOTUS operations checkpoint — 2026-10-25 KST

- User registered BLOGGER_BLOG_ID, BLOGGER_CLIENT_ID, rotated BLOGGER_CLIENT_SECRET and BLOGGER_REFRESH_TOKEN in repository Actions secrets, then enabled Blogger API in the OAuth client's project. Never copy values to source or logs.
- Main connection run 40196568557: OAuth refresh PASS, exact MOTUS blog and account membership PASS, publishCallCount 0.
- US production run 40196610570: operationDate 2026-10-25, sessionDate 2026-10-23, VERIFIED/PUBLISHED, insertCallCount 1, publishCallCount 1, both remote duplicate checks PASS, post readback and public HTTP validation PASS, ops-data ledger persisted. Post 2224110527358191460: https://motusnova.blogspot.com/2026/10/dow-jones.html
- AI run 40196761026: SKIP, AI_VERIFIED_EVENTS_INSUFFICIENT, no Blogger writes. Four OpenAI article fetches returned HTTP 403; two fetched NVIDIA events did not match the currently supported Korean synthesis rules. This is not successful AI publication. Broader evidence-backed synthesis/source access remains unfinished. Do not fabricate content or relax source checks.
- Korea run 40196838286: SKIP, KOREA_OPERATION_DATE_HOLIDAY (Sunday), no Blogger writes. Scheduled weekday publication is enabled, but a real eligible-session publication remains unverified after credential setup.
- PRs 21–23 merged after exact-head CI succeeded. Full suite before chart fix: 488 PASS.
- Live public US article revealed the renderer required optional Russell alongside three core indices. Chart validation now accepts exact ordered three-core or four-index histories; missing/invalid core data still falls back. This applies to future rendering.
- Already-published US content has not been modified. Existing assertMaintenanceWriteAllowed blocks maintenance paths in GITHUB_ACTIONS; do not bypass this guard. The published chart correction remains unfinished pending an authorized supported maintenance execution path.
- GitHub cron is configured; exact on-time delivery and the next eligible scheduled cycle are not yet verified. Workflow success alone must never be reported as publication success.
- The old client secret was deleted by the user. The separately operated Blogger Manager may also need its configured secret rotated; its runtime authentication has not been verified in this repository.
