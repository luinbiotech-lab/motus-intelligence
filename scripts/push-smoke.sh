#!/usr/bin/env bash
# Fail-closed smoke test for a deployed push Worker. Env: PUSH_URL, VAPID_PUBLIC. Prints no key material.
set -euo pipefail
: "${PUSH_URL:?}" "${VAPID_PUBLIC:?}"
ORIGIN=https://luinbiotech-lab.github.io
[ "$(curl -fsS "${PUSH_URL}vapid-public-key")" = "$VAPID_PUBLIC" ] || { echo "::error::public key mismatch"; exit 1; }
[ "$(curl -fsS "${PUSH_URL}health" | jq -r .vapidPairReady)" = true ] || { echo "::error::key pair not ready"; exit 1; }
H=$(curl -sS -D - -o /dev/null -X OPTIONS -H "origin: $ORIGIN" "${PUSH_URL}subscribe")
echo "$H" | head -1 | grep -q ' 204' || { echo "::error::CORS preflight not 204"; exit 1; }
echo "$H" | tr -d '\r' | grep -qi "^access-control-allow-origin: $ORIGIN$" || { echo "::error::CORS origin not allowed"; exit 1; }
BAD=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H 'origin: https://evil.example' -H 'content-type: application/json' --data '{}' "${PUSH_URL}subscribe")
[ "$BAD" = 403 ] || { echo "::error::foreign origin not rejected ($BAD)"; exit 1; }
echo "SMOKE PASS: key match, pair ready, CORS 204+allow-origin, foreign origin 403"
