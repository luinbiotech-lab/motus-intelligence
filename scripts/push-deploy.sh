#!/usr/bin/env bash
# Deploy the MOTUS briefing push Worker and provision its VAPID key pair (luin RB-8ad8a2a / RB-82188c7).
# Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, WORKER_NAME, KV_TITLE, INJECT (none|stop-before-kv; test only).
# Exit 0 ready, 1 failed/refused, 3 injected stop. Prints no key material: only the public key's SHA-256 prefix.
# Writes PUSH_URL, VAPID_PUBLIC, NEW_KEY to $GITHUB_ENV when set.
set -euo pipefail
: "${WORKER_NAME:?}" "${KV_TITLE:?}" "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}"
INJECT=${INJECT:-none}
DIR=$(cd "$(dirname "$0")/../workers/briefing-push" && pwd)
ACC="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID"
AUTH="authorization: Bearer $CLOUDFLARE_API_TOKEN"
WR=(npx --yes wrangler@4.20.0)
fp(){ printf %s "$1" | sha256sum | cut -c1-12; }
# Key values go only to $GITHUB_ENV (needed by the smoke step); stdout gets a fingerprint (luin RB-cb9258d).
out(){ [ -n "${GITHUB_ENV:-}" ] && echo "$1=$2" >> "$GITHUB_ENV"; case "$1" in VAPID_*) echo "RESULT $1=fp:$(fp "$2")";; *) echo "RESULT $1=$2";; esac; }

KV_ID=$(curl -fsS -H "$AUTH" "$ACC/storage/kv/namespaces?per_page=100" | jq -r --arg t "$KV_TITLE" '.result[]|select(.title==$t)|.id' | head -1)
if [ -z "$KV_ID" ]; then KV_ID=$(curl -fsS -X POST -H "$AUTH" -H 'content-type: application/json' --data "{\"title\":\"$KV_TITLE\"}" "$ACC/storage/kv/namespaces" | jq -r '.result.id'); echo "created KV namespace $KV_TITLE"; fi
[ -n "$KV_ID" ] && [ "$KV_ID" != null ] || { echo "::error::KV namespace unavailable"; exit 1; }
KVAPI="$ACC/storage/kv/namespaces/$KV_ID"
CFG="$DIR/wrangler.ci.toml"; trap 'rm -f "$CFG"' EXIT
sed -e "s/^name = .*/name = \"$WORKER_NAME\"/" -e "s/^id = \"REPLACE_AT_DEPLOY\"/id = \"$KV_ID\"/" "$DIR/wrangler.toml" > "$CFG"
SUB=$(curl -fsS -H "$AUTH" "$ACC/workers/subdomain" | jq -r '.result.subdomain')
[ -n "$SUB" ] && [ "$SUB" != null ] || { echo "::error::workers.dev subdomain unavailable"; exit 1; }
URL="https://$WORKER_NAME.$SUB.workers.dev/"; out PUSH_URL "$URL"
deploy(){ (cd "$DIR" && "${WR[@]}" deploy -c "$CFG" --var "VAPID_PUBLIC_KEY:$1" >/dev/null); }
ready(){ for _ in 1 2 3 4 5 6 7 8; do sleep 5; [ "$(curl -fsS "${URL}health" 2>/dev/null | jq -r '.vapidPairReady' 2>/dev/null)" = true ] && return 0; done; return 1; }

RESP=$(curl -sS -H "$AUTH" -w '\n%{http_code}' "$KVAPI/values/meta:vapid-public"); CODE=$(echo "$RESP" | tail -1); PUB=$(echo "$RESP" | head -n -1)
if [ "$CODE" = 200 ] && [ -n "$PUB" ]; then
  deploy "$PUB"
  if ready; then echo "existing key pair verified (pub $(fp "$PUB"))"; out VAPID_PUBLIC "$PUB"; out NEW_KEY 0; exit 0; fi
  SUBS=$(curl -fsS -H "$AUTH" "$KVAPI/keys?prefix=sub:&limit=10" | jq '.result|length')
  if [ "$SUBS" != 0 ]; then echo "::error title=VAPID pair broken with live subscribers::refusing to rotate ($SUBS+ subscriptions would break); owner decision needed"; out NEW_KEY refused; exit 1; fi
  echo "stored public key has no matching private key and no subscribers: rotating"
fi
KEYDIR=$(umask 077; mktemp -d); trap 'rm -rf "$KEYDIR"; rm -f "$CFG"' EXIT
node -e "const c=require('crypto');const e=c.createECDH('prime256v1');e.generateKeys();const f=require('fs');f.writeFileSync(process.argv[1]+'/priv',e.getPrivateKey().toString('base64url'),{mode:0o600});f.writeFileSync(process.argv[1]+'/pub',e.getPublicKey().toString('base64url'))" "$KEYDIR"
PUB=$(cat "$KEYDIR/pub")
deploy "$PUB"
(cd "$DIR" && "${WR[@]}" secret put VAPID_PRIVATE_KEY -c "$CFG" < "$KEYDIR/priv" >/dev/null)
rm -f "$KEYDIR/priv"
ready || { echo "::error title=VAPID pair not ready::Worker did not confirm the key pair; KV left unchanged"; exit 1; }
[ "$INJECT" = stop-before-kv ] && { echo "INJECTED stop before KV write"; exit 3; }
curl -fsS -X PUT -H "$AUTH" --data-binary "$PUB" "$KVAPI/values/meta:vapid-public" >/dev/null
echo "new key pair provisioned and verified (pub $(fp "$PUB"))"; out VAPID_PUBLIC "$PUB"; out NEW_KEY 1
