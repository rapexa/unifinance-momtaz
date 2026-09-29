#!/usr/bin/env bash
# Update the existing Momtaz server (built from source, no Docker):
# pull, back up the database, build the API and the web app, restart, health check.
#
# Settings (env vars or edit the defaults below):
#   BRANCH=main                  git branch to deploy
#   SERVICE=unifinance           systemd unit that runs the API (empty: print a reminder)
#   BIN=unifinance-server        API binary name inside backend/
#   WEB_ROOT=/var/www/momtaz     folder the web server serves the frontend from (empty: skip copy)
#   API_URL=http://127.0.0.1:8081
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BRANCH="${BRANCH:-main}"
SERVICE="${SERVICE:-}"
BIN="${BIN:-unifinance-server}"
WEB_ROOT="${WEB_ROOT:-}"
API_URL="${API_URL:-http://127.0.0.1:8081}"
cd "$APP_DIR"

echo "==> pulling $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> database backup"
cfg="backend/config.yaml"
if [[ -f "$cfg" ]] && command -v mysqldump >/dev/null; then
  val() { awk -v k="$1" '/^db:/{f=1;next} /^[^ #]/{f=0} f && $1==k":"{sub(/^[^:]*:[ ]*/,""); gsub(/"/,""); print; exit}' "$cfg"; }
  mkdir -p backups
  out="backups/db-$(date +%Y%m%d-%H%M%S).sql.gz"
  MYSQL_PWD="$(val pass)" mysqldump -h"$(val host)" -P"$(val port)" -u"$(val user)" --single-transaction "$(val name)" | gzip >"$out"
  echo "    $out"
  find backups -name 'db-*.sql.gz' -mtime +30 -delete
else
  echo "    skipped (no backend/config.yaml or mysqldump)"
fi

echo "==> building API"
(cd backend && go build -trimpath -o "$BIN" ./cmd)

echo "==> building web app"
npm ci --no-audit --no-fund
npm run build
if [[ -n "$WEB_ROOT" ]]; then
  mkdir -p "$WEB_ROOT"
  cp -r dist/. "$WEB_ROOT/"
  echo "    copied to $WEB_ROOT"
fi

echo "==> restarting API (migrations run automatically on start)"
if [[ -n "$SERVICE" ]]; then
  sudo systemctl restart "$SERVICE"
else
  echo "    SERVICE not set — restart the API process yourself (backend/$BIN)"
fi

for _ in $(seq 1 60); do
  if curl -fsS "$API_URL/health" >/dev/null 2>&1; then echo "==> healthy: $API_URL/health"; exit 0; fi
  sleep 2
done
echo "API did not answer $API_URL/health — check the service logs" >&2
exit 1
