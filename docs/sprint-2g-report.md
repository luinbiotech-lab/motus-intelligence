# Sprint 2G Verification — Blogger Live Integration & Publishing Console

- Starting HEAD: `21c4dea74b2548e2432bbfd5f8bb6a914d173294`
- Golden Day: `2026-09-11`
- Report ID: `MANUAL-2026-09-11-7cb0ccf11f29`
- Blogger publication version: `2G.BLOGGER.1.0`

## Blogger adapter architecture

Sprint 2G adds a dedicated Blogger publication layer in `src/services/blogger.ts`.

- `BloggerPublicationRecord` stores publication state, preview URL, optional final post URL, SEO fields, labels, hashtags, glossary, related links, sources, error, dry-run flag, and state history.
- `BloggerAdapter` defines `hasCredential()` and `publish()` so a real Google Blogger adapter can be attached once credentials are configured.
- `DryRunBloggerAdapter` never fabricates a public URL. It is used for credential-less local operation and publish rehearsals.
- `ConfiguredBloggerAdapter` is the pluggable implementation seam used by tests to verify final URL propagation.

## State model

Supported states are `DRAFT`, `PREVIEW_READY`, `APPROVED`, `PUBLISHED`, and `FAILED`.

Allowed operational path:

1. Daily Editorial output → Blogger preview → `PREVIEW_READY`
2. Admin approval → `APPROVED`
3. Publish with credentialed adapter → `PUBLISHED` + final Blogger post URL
4. Missing credential, missing URL, or adapter error → `FAILED`

Duplicate publish and already-published report IDs are rejected.

## Generated artifacts

- Blogger preview HTML: `data/blogger/2026-09-11/MANUAL-2026-09-11-7cb0ccf11f29-preview.html`
- Blogger publication record: `data/blogger/2026-09-11/MANUAL-2026-09-11-7cb0ccf11f29-publication.json`
- Admin publishing console: `data/blogger/2026-09-11/MANUAL-2026-09-11-7cb0ccf11f29-publishing-console.html`
- A4 HTML: `data/a4-master/2026-09-11/MANUAL-2026-09-11-7cb0ccf11f29-2F.A4MASTER.1.0.html`
- A4 PDF: `data/a4-master/2026-09-11/MANUAL-2026-09-11-7cb0ccf11f29-2F.A4MASTER.1.0.pdf`
- A4 PNG: `data/a4-master/2026-09-11/MANUAL-2026-09-11-7cb0ccf11f29-2F.A4MASTER.1.0.png`
- Naver package: `data/a4-master/2026-09-11/MANUAL-2026-09-11-7cb0ccf11f29-2F.A4MASTER.1.0-naver.json`

## Preview and URL behavior

Configured preview URL:

`https://preview.local/us-market-daily/us-market-close-2026-09-11`

Configured pending placeholder base:

`https://pending.local/us-market-daily`

Because no real Blogger credential is configured, publish dry-run keeps the publication record at `APPROVED`, leaves `postUrl` as `null`, and does not create a fake public URL.

A4 QR and Naver package currently use the preview URL. Automated tests verify that once a credentialed adapter returns a final Blogger URL, regenerate updates the A4 QR target and Naver `googleBloggerUrl` to that final URL.

## Security and leakage checks

- Public Blogger preview HTML does not expose admin routes, publish actions, claim IDs, confidence values, verification statuses, or publication history.
- Admin publishing console is rendered only through server-side admin authorization checks.
- Production anonymous admin access is rejected until an authentication provider is explicitly supplied.
- The former example Blogger host is no longer hardcoded in source or generated public artifacts.

## Test coverage added

- Blogger preview output preserves SEO, labels, hashtags, glossary, related links, and source section.
- Blogger state transition and dry-run behavior.
- Missing credential handling without fake publish.
- Credentialed adapter URL storage.
- Duplicate publish prevention.
- Admin authorization denial for public audience and production anonymous mode.
- A4 QR replacement after final Blogger URL.
- Naver package Blogger URL propagation.
- Public leakage prevention.
