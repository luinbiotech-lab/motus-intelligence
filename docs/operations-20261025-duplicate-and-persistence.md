# Same-session duplicate guard and merge-only ops-data persistence (2026-10-25)

## Duplicate publication guard
A publication is a duplicate when the same category already has a published post for the same
market session (or AI event) date, regardless of the operationDate it ran under. Example: a manual
Korea close edition for session D (operationDate D) followed by the next-morning edition for the same
session D (operationDate D+1).

- Ledger: `motus-publish-cli` scans every persisted `data/operations/*/<category>/publish-ledger.jsonl`
  for a `PUBLISHED` entry of the same category whose `sessionDate` (new entries) or persisted
  `live-unit.json` `observedDate` (legacy entries) equals the unit's `observedDate`, and finishes with
  `SKIP` / `ALREADY_PUBLISHED_SAME_SESSION` before any Blogger call.
- Remote: `findMatchingPosts` also treats a same-label post whose title/body contains the session date
  (ISO or Korean form) as a match, so both remote duplicate checks HOLD before insert/publish.
- New ledger entries record `sessionDate`.

## ops-data persistence
The persist job no longer overwrites ops-data with the runner bundle. It merges:
`*.jsonl` ledgers are unioned line by line, JSON arrays of records are unioned by
`idempotencyKey`/`publicationId`/`canonicalId`, other files are replaced. A stale or partially
hydrated runner can therefore never shrink the publish ledger or Library/Search registrations.
On a push race it re-fetches, re-merges and retries (5 attempts) and fails loudly otherwise.

## Scheduling
Production runs queue per category, so a delayed pending run of one category is no longer cancelled
when another category's schedule fires. Catch-up simulation uses its own queue.

## Transient source throttling
Yahoo Finance (US index secondary, Korea independent cross-check) requests retry up to twice on
HTTP 429/503 with bounded backoff against the same URL; all date/history/tolerance checks are unchanged.
