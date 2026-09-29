#!/usr/bin/env bash
# Backup database + uploaded files to ./backups (kept 14 days).
#   ./backup.sh                 run now
#   ./backup.sh --install-cron  nightly at 03:30
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
if [[ "${1:-}" == "--install-cron" ]]; then
  line="30 3 * * * cd $PWD && ./backup.sh >> $PWD/backups/cron.log 2>&1"
  mkdir -p backups
  (crontab -l 2>/dev/null | grep -v 'backup.sh'; echo "$line") | crontab -
  echo "installed: $line"
  exit 0
fi
root_pw="$(grep -E '^DB_ROOT_PASSWORD=' .env | cut -d= -f2-)"
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
docker compose exec -T db mariadb-dump -uroot -p"$root_pw" --single-transaction --routines unifinance | gzip >"backups/$stamp.sql.gz"
docker compose exec -T -u 0 app tar czf - -C /app/uploads . >"backups/$stamp-uploads.tar.gz"
find backups -type f -name '*.gz' -mtime +14 -delete
echo "backup: backups/$stamp.sql.gz"
