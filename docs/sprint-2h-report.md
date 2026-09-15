# Sprint 2H Verification — Live Blogger Setup & First Publication

- Starting HEAD: `c98b613a32cf220c2514efc5f001f3cb8233d59b`
- Golden Day: `2026-09-11`
- Report ID: `MANUAL-2026-09-11-7cb0ccf11f29`
- Blogger publication version: `2G.BLOGGER.1.0` (preserved)
- Google API adapter version: `2H.GOOGLEBLOGGER.1.0`

## Actual Blogger config method

`config/publishing.json` stores only the names of `BLOGGER_BLOG_ID` and `BLOGGER_OAUTH_TOKEN`, plus `publishAsDraft=true`. The actual blog ID and OAuth 2.0 access token are read from the process environment and are never written to repository files or command output. The token must include `https://www.googleapis.com/auth/blogger` scope.

The adapter calls `POST https://www.googleapis.com/blogger/v3/blogs/{blogId}/posts?isDraft=true`. It sends the approved title, article HTML, labels, and JSON custom metadata containing the SEO description and slug. Missing blog ID or credential prevents the network request. API errors are sanitized before being stored.

## Current external result

The local environment contains neither `BLOGGER_BLOG_ID` nor `BLOGGER_OAUTH_TOKEN`. The Blogger browser reached the Google sign-in page and has no authenticated session. Therefore no live API request was sent, no fake URL was created, and no draft/test post exists yet.

The Golden Day publication record remains `APPROVED`, `postUrl=null`, and ready for the credentialed draft insert. Its existing preview and human approval history are preserved. Once Google returns a real post URL, the record transitions to `DRAFT`, stores the provider post ID and URL, and A4 regeneration propagates that URL to its CTA/QR and the Naver package.

## Verification

- TypeScript typecheck: PASS
- Build: PASS
- Node tests: 75/75 PASS
- Google adapter request shape, draft-first behavior, no-request guard, metadata/labels/article payload: PASS
- Draft URL propagation to A4 QR and Naver package: PASS
- Actual Blogger publication: BLOCKED by missing user authentication and environment credentials
