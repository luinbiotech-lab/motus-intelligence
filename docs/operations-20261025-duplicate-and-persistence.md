# Same-session duplicate guard and merge-only ops-data persistence (2026-10-25)

## Duplicate publication guard
A publication is a duplicate when the same category already has a published post for the same
market session (or AI event) date, regardless of the operationDate it ran under. Example: a manual
Korea close edition for session D (operationDate D) followed by the next-morning edition for the same
session D (operationDate D+1).

- Ledger (SSOT): `motus-publish-cli` scans every persisted `data/operations/*/<category>/publish-ledger.jsonl`
  for a `PUBLISHED` entry of the same category covering the unit's `observedDate` and finishes with
  `SKIP` / `ALREADY_PUBLISHED_SAME_SESSION` before any Blogger call. New entries record `sessionDate`;
  legacy entries are resolved from the persisted `live-unit.json` only when its content fingerprint
  equals the ledger fingerprint (a unit re-collected by a later rerun is never trusted).
- The remote check is unchanged (title / operationDate). Matching arbitrary dates in post bodies was
  rejected because charts and prior-session references contain older session dates (false HOLDs).
- In GitHub Actions, live publication HOLDs with `OPS_DATA_NOT_HYDRATED` unless the ops-data ledger was
  hydrated (marker `data/.ops-data-hydrated`, written after a successful fetch with up to 3 retries),
  so the ledger guard can never be silently skipped.

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
