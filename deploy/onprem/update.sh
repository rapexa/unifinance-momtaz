#!/usr/bin/env bash
# Upgrade to a new version: put the new unifinance-image.tar.gz (and license.key, if renewed)
# next to this script and run ./update.sh. A backup is taken first; migrations run on start.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
./backup.sh
if [[ -f unifinance-image.tar.gz ]]; then
  gunzip -c unifinance-image.tar.gz | docker load
fi
docker compose up -d --force-recreate app
for _ in $(seq 1 90); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:8081/health >/dev/null 2>&1; then
    echo "به‌روزرسانی انجام شد."
    exit 0
  fi
  sleep 2
done
docker compose logs --tail 40 app >&2
exit 1
