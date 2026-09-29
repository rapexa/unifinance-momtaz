#!/usr/bin/env bash
# Update the Momtaz server (built from source, no Docker).
#
#   ./deploy/momtaz/update.sh --check   only show what was found — changes nothing
#   ./deploy/momtaz/update.sh           update: pull, back up, build, restart, health check
#
# It finds by itself how the API runs (systemd / pm2 / plain process), which binary it runs and
# which folder nginx serves the web app from. Override when needed:
#   BRANCH=main  SERVICE=<systemd unit>  BIN_PATH=/path/to/backend/server  WEB_ROOT=/var/www/site
#   SKIP_WEB=1 (do not build the web app)   API_URL=http://127.0.0.1:8081
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"
CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1
BRANCH="${BRANCH:-main}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$APP_DIR/backups"
CFG="$APP_DIR/backend/config.yaml"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok() { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die() { printf '\n\033[31mخطا: %s\033[0m\n' "$*" >&2; exit 1; }
SUDO=""
[[ "$(id -u)" != "0" ]] && command -v sudo >/dev/null && SUDO="sudo"

# value of key inside a top-level YAML block of backend/config.yaml (e.g. cfg db pass)
cfg() {
  [[ -f "$CFG" ]] || return 0
  awk -v b="$1" -v k="$2" '
    $0 ~ "^"b":" {f=1; next}
    /^[^ #]/ {f=0}
    f && $1 == k":" {sub(/^[^:]*:[ ]*/, ""); gsub(/"/, ""); gsub(/\047/, ""); print; exit}' "$CFG"
}
cfg_top() { [[ -f "$CFG" ]] && awk -v k="$1" '$1 == k":" {sub(/^[^:]*:[ ]*/, ""); gsub(/"/, ""); print; exit}' "$CFG" || true; }

# ---------------------------------------------------------------- detect
detect_api() {
  API_PID="" API_EXE="" API_CWD="" API_MANAGER="" API_UNIT=""
  local p exe
  for p in /proc/[0-9]*; do
    exe="$(readlink "$p/exe" 2>/dev/null || true)"
    exe="${exe% (deleted)}"
    if [[ "$exe" == "$APP_DIR/backend/"* ]]; then
      API_PID="${p#/proc/}"; API_EXE="$exe"; API_CWD="$(readlink "$p/cwd" 2>/dev/null || true)"
      break
    fi
  done
  if [[ -z "$API_PID" ]] && command -v ss >/dev/null; then
    # Not under the project folder: find whoever listens on the API port.
    local port; port="$(api_url)"; port="${port##*:}"
    API_PID="$($SUDO ss -ltnpH "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)"
    if [[ -n "$API_PID" ]]; then
      API_EXE="$(readlink "/proc/$API_PID/exe" 2>/dev/null || true)"; API_EXE="${API_EXE% (deleted)}"
      API_CWD="$(readlink "/proc/$API_PID/cwd" 2>/dev/null || true)"
    fi
  fi
  if [[ -n "${SERVICE:-}" ]]; then
    API_MANAGER="systemd"; API_UNIT="$SERVICE"
  elif [[ -n "$API_PID" ]]; then
    API_UNIT="$(grep -oE '[^/]+\.service' "/proc/$API_PID/cgroup" 2>/dev/null | head -1 || true)"
    if [[ -n "$API_UNIT" && "$API_UNIT" != user@* && "$API_UNIT" != session-* ]]; then
      API_MANAGER="systemd"
    elif command -v pm2 >/dev/null && pm2 jlist 2>/dev/null | grep -q "\"pid\":$API_PID[,}]"; then
      API_MANAGER="pm2"
      API_UNIT="$(pm2 jlist 2>/dev/null | python3 -c "import json,sys; print(next((a['name'] for a in json.load(sys.stdin) if a.get('pid')==$API_PID),''))" 2>/dev/null || true)"
    else
      API_MANAGER="process"; API_UNIT=""
    fi
  fi
  BIN_PATH="${BIN_PATH:-${API_EXE:-$APP_DIR/backend/unifinance-server}}"
}

detect_web() {
  WEB_HOST="$(cfg_top frontend_url | sed -E 's#^https?://##; s#/.*$##')"
  if [[ -n "${WEB_ROOT:-}" ]]; then return; fi
  WEB_ROOT=""
  command -v nginx >/dev/null || return 0
  local pairs best=""
  pairs="$($SUDO nginx -T 2>/dev/null | awk '
    /server[ \t]*\{/ {names=""; root=""}
    $1 == "server_name" {sub(/;$/, ""); $1=""; names=names" "$0}
    $1 == "root" {r=$2; sub(/;$/, "", r); root=r}
    /^[ \t]*\}/ {if (root != "") print names "|" root; root=""}' || true)"
  while IFS='|' read -r names root; do
    [[ -z "$root" || ! -f "$root/index.html" ]] && continue
    if [[ -n "$WEB_HOST" && " $names " == *" $WEB_HOST "* ]]; then best="$root"; break; fi
    [[ -z "$best" && -d "$root/assets" ]] && best="$root"
  done <<<"$pairs"
  WEB_ROOT="$best"
}

api_url() {
  local addr; addr="$(cfg server addr)"; addr="${addr:-:8081}"
  echo "${API_URL:-http://127.0.0.1:${addr##*:}}"
}

IS_GIT=0
git rev-parse --git-dir >/dev/null 2>&1 && IS_GIT=1

report() {
  say "پوشه پروژه: $APP_DIR"
  if ((!IS_GIT)); then
    warn "این پوشه مخزن git نیست؛ به‌روزرسانی خودکار ممکن نیست (راهنما: بخش «سرور بدون git»)"
  else
    ok "شاخه: $(git rev-parse --abbrev-ref HEAD) — آخرین تغییر: $(git log -1 --format='%h %cr')"
    ok "مخزن: $(git remote get-url origin 2>/dev/null | sed -E 's#https://[^@]*@#https://#')"
  fi
  if ((IS_GIT)) && [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    warn "فایل‌های تغییرکرده روی سرور هست (git status). به‌روزرسانی متوقف می‌شود تا تکلیفشان روشن شود:"
    git status --short --untracked-files=no | sed 's/^/      /'
  fi
  [[ -f "$CFG" ]] && ok "تنظیمات: backend/config.yaml" || warn "backend/config.yaml پیدا نشد"
  if command -v go >/dev/null; then ok "Go: $(go version | awk '{print $3}')"; else warn "Go نصب نیست"; fi
  if command -v npm >/dev/null; then ok "Node: $(node -v 2>/dev/null) / npm $(npm -v)"; else warn "Node/npm نصب نیست (برای ساخت فرانت لازم است)"; fi
  if [[ -n "$API_PID" ]]; then
    ok "API در حال اجرا: PID $API_PID — $API_EXE"
    case "$API_MANAGER" in
      systemd) ok "مدیریت با systemd: $API_UNIT" ;;
      pm2) ok "مدیریت با pm2: ${API_UNIT:-?}" ;;
      *) warn "API بدون systemd/pm2 اجرا شده؛ اسکریپت خودش آن را متوقف و دوباره اجرا می‌کند (پوشه: $API_CWD)" ;;
    esac
  else
    warn "پروسه API پیدا نشد (باینری پیش‌فرض: $BIN_PATH)"
  fi
  if [[ -n "$WEB_ROOT" ]]; then
    ok "فرانت از این پوشه سرو می‌شود: $WEB_ROOT (دامنه: ${WEB_HOST:-?})"
  elif [[ "${SKIP_WEB:-0}" == "1" ]]; then
    warn "ساخت فرانت غیرفعال است (SKIP_WEB=1)"
  else
    warn "پوشه فرانت پیدا نشد؛ فقط dist/ ساخته می‌شود. اگر nginx از پوشه دیگری سرو می‌کند WEB_ROOT را بدهید."
  fi
  ok "آدرس بررسی سلامت: $(api_url)/health"
  ok "فضای خالی دیسک: $(df -h "$APP_DIR" | awk 'NR==2{print $4}')"
}

# ---------------------------------------------------------------- actions
backup_db() {
  if ! command -v mysqldump >/dev/null && ! command -v mariadb-dump >/dev/null; then
    warn "mysqldump نصب نیست؛ پشتیبان پایگاه داده گرفته نشد"; return
  fi
  local dump; dump="$(command -v mysqldump || command -v mariadb-dump)"
  local out="$BACKUP_DIR/db-$STAMP.sql.gz"
  MYSQL_PWD="$(cfg db pass)" "$dump" -h"$(cfg db host)" -P"$(cfg db port)" -u"$(cfg db user)" \
    --single-transaction --routines "$(cfg db name)" | gzip >"$out"
  ok "پشتیبان پایگاه داده: $out"
  find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +30 -delete 2>/dev/null || true
}

restart_api() {
  case "$API_MANAGER" in
    systemd) $SUDO systemctl restart "$API_UNIT" ;;
    pm2) pm2 restart "${API_UNIT:-$API_PID}" >/dev/null ;;
    process)
      kill "$API_PID" 2>/dev/null || true
      for _ in $(seq 1 20); do kill -0 "$API_PID" 2>/dev/null || break; sleep 0.5; done
      (cd "${API_CWD:-$APP_DIR/backend}" && nohup "$BIN_PATH" >>"${API_CWD:-$APP_DIR/backend}/server.log" 2>&1 &)
      ;;
    *)
      if [[ -f "$APP_DIR/backend/config.yaml" ]]; then
        (cd "$APP_DIR/backend" && nohup "$BIN_PATH" >>"$APP_DIR/backend/server.log" 2>&1 &)
      else
        die "نمی‌دانم API را چطور اجرا کنم؛ SERVICE=<نام سرویس> بدهید"
      fi
      ;;
  esac
}

wait_healthy() {
  local url; url="$(api_url)/health"
  for _ in $(seq 1 60); do
    curl -fsS "$url" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

# ---------------------------------------------------------------- main
detect_api
detect_web
report
if ((CHECK)); then
  echo
  echo "هیچ تغییری انجام نشد. اگر همه موارد بالا درست است، بدون --check اجرا کنید."
  exit 0
fi

((IS_GIT)) || die "این پوشه مخزن git نیست"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || die "روی سرور فایل تغییرکرده هست؛ اول تکلیف آن‌ها را روشن کنید (git status)"
command -v go >/dev/null || die "Go روی سرور نصب نیست"
mkdir -p "$BACKUP_DIR"

say "دریافت آخرین نسخه از GitHub ($BRANCH)"
git fetch origin "$BRANCH"
git checkout -q "$BRANCH"
git pull --ff-only origin "$BRANCH"
ok "$(git log -1 --format='%h %s')"

say "پشتیبان‌گیری"
backup_db
if [[ -f "$BIN_PATH" ]]; then cp -p "$BIN_PATH" "$BIN_PATH.bak-$STAMP"; ok "نسخه قبلی API: $BIN_PATH.bak-$STAMP"; fi

say "ساخت API"
(cd backend && go build -trimpath -o "$BIN_PATH.new" ./cmd)
mv -f "$BIN_PATH.new" "$BIN_PATH"   # rename works even while the old binary is running
ok "$BIN_PATH"

if [[ "${SKIP_WEB:-0}" != "1" ]]; then
  say "ساخت فرانت"
  command -v npm >/dev/null || die "Node/npm روی سرور نصب نیست (یا با SKIP_WEB=1 فقط API را به‌روز کنید)"
  npm ci --no-audit --no-fund >/dev/null
  npm run build >/dev/null
  ok "dist/ ساخته شد"
  if [[ -n "$WEB_ROOT" && "$(cd "$WEB_ROOT" && pwd -P)" != "$(cd dist && pwd -P)" ]]; then
    tar czf "$BACKUP_DIR/web-$STAMP.tar.gz" -C "$WEB_ROOT" . && ok "پشتیبان فرانت قبلی: $BACKUP_DIR/web-$STAMP.tar.gz"
    $SUDO cp -r dist/. "$WEB_ROOT/"
    ok "فرانت جدید در $WEB_ROOT کپی شد"
  fi
fi

say "راه‌اندازی مجدد API (تغییرات پایگاه داده خودکار اعمال می‌شود)"
restart_api
if wait_healthy; then
  ok "API سالم است: $(api_url)/health"
  echo
  echo "به‌روزرسانی با موفقیت انجام شد."
  exit 0
fi

warn "API بالا نیامد؛ برگرداندن نسخه قبلی ..."
if [[ -f "$BIN_PATH.bak-$STAMP" ]]; then
  cp -p "$BIN_PATH.bak-$STAMP" "$BIN_PATH"
  detect_api
  restart_api
  wait_healthy && warn "نسخه قبلی API دوباره فعال شد." || true
fi
die "به‌روزرسانی ناموفق بود. خروجی این دستور را برای پشتیبانی بفرستید: journalctl -u ${API_UNIT:-<service>} -n 80  (یا backend/server.log)"
