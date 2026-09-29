#!/usr/bin/env bash
# UniFinance SaaS operator tool — host many customers (tenants) on one server.
# Every tenant has its own container, database, domain, admin and license.
#
#   ./uf.sh setup                      first-time setup (.env, license keys, image, db + caddy)
#   ./uf.sh build                      (re)build the image from this repository
#   ./uf.sh create <slug> [options]    new customer
#   ./uf.sh list                       all customers
#   ./uf.sh license <slug> [options]   renew / upgrade a customer's license
#   ./uf.sh suspend|resume <slug>      stop / restart a customer (site shows a notice)
#   ./uf.sh restart <slug>             restart after editing tenants/<slug>/tenant.env
#   ./uf.sh update [<slug>|--all]      rebuild image, back up and restart (migrations run automatically)
#   ./uf.sh backup [<slug>|--all]      database + uploads backup to backups/
#   ./uf.sh restore <slug> <file.sql.gz>
#   ./uf.sh logs <slug>
#   ./uf.sh remove <slug> [--purge]    delete container (and with --purge: database + files)
#   ./uf.sh install-cron               nightly backups at 03:30
#   ./uf.sh onprem-bundle <name> [license options]   package for a customer's own server
#
# create/license options:
#   --domain panel.customer.ir  --org "نام مجموعه"  --admin-email a@b.ir  --admin-phone 0912...
#   --plan basic|pro|enterprise  --trial DAYS  --free  --students N  --users N  --months N  --days N  --vendor
#   Plan limits (unless --students/--users are given): basic 100 students / 5 users,
#   pro and trial 400 / 15, enterprise, onprem, free and vendor unlimited.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$HERE"

TENANTS="$HERE/tenants"
SITES="$HERE/sites"
BACKUPS="$HERE/backups"
KEYS="$HERE/keys"

red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
die() { red "error: $*"; exit 1; }
rand() { # n random alphanumerics (no pipe into head: pipefail would trip on SIGPIPE)
  local n="${1:-24}" s=""
  while ((${#s} < n)); do s+="$(head -c 96 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"; done
  printf '%s' "${s:0:n}"
}

load_env() {
  [[ -f .env ]] || die ".env not found — run ./uf.sh setup first"
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  IMAGE="${IMAGE:-unifinance:latest}"
}

compose() { docker compose --env-file "$HERE/.env" -f "$HERE/docker-compose.yml" "$@"; }

sql() { compose exec -T db mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$@"; }

valid_slug() { [[ "$1" =~ ^[a-z][a-z0-9-]{1,30}$ ]] || die "slug must be lowercase letters/digits/dashes (e.g. ayandeh)"; }

tenant_dir() { echo "$TENANTS/$1"; }

require_tenant() {
  valid_slug "$1"
  [[ -f "$(tenant_dir "$1")/tenant.env" ]] || die "tenant '$1' not found"
}

env_get() { grep -E "^$2=" "$1" | tail -1 | cut -d= -f2-; }

env_set() { # file key value
  local f="$1" k="$2" v="$3" tmp
  tmp="$(mktemp)"
  grep -vE "^$k=" "$f" >"$tmp" || true
  printf '%s=%s\n' "$k" "$v" >>"$tmp"
  cat "$tmp" >"$f"
  rm -f "$tmp"
}

wait_db() {
  for _ in $(seq 1 60); do
    if sql -e "SELECT 1" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  die "database did not become ready"
}

reload_caddy() {
  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
    || compose restart caddy >/dev/null
}

license_cli() { docker run --rm -u "$(id -u):$(id -g)" -v "$KEYS:/keys:ro" --entrypoint /usr/local/bin/license "$IMAGE" "$@"; }

# ---------------------------------------------------------------- setup / build
cmd_setup() {
  if [[ ! -f .env ]]; then
    cp .env.example .env
    env_set .env MARIADB_ROOT_PASSWORD "$(rand 32)"
    chmod 600 .env
    green "created .env — edit BASE_DOMAIN and ACME_EMAIL, then run ./uf.sh setup again"
    exit 0
  fi
  load_env
  mkdir -p "$TENANTS" "$SITES" "$BACKUPS" "$KEYS"
  chmod 700 "$TENANTS" "$KEYS" "$BACKUPS"
  cmd_build
  compose up -d db caddy
  wait_db
  green "ready. create a customer with: ./uf.sh create <slug> --org \"...\" --admin-email ..."
}

ensure_keys() {
  [[ -f "$KEYS/license-private.key" ]] && return
  red "keys/license-private.key not found."
  red "Copy the license-private.key file you received (the vendor signing key) to:"
  red "  $KEYS/license-private.key   (then: chmod 600 keys/license-private.key)"
  exit 1
}

check_keys() {
  license_cli check -priv /keys/license-private.key >/dev/null \
    || die "keys/license-private.key does not match the public key built into the app"
}

cmd_build() {
  load_env
  mkdir -p "$KEYS"
  ensure_keys
  green "building $IMAGE ..."
  docker build -t "$IMAGE" \
    --build-arg VERSION="$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo dev)" \
    --build-arg NODE_IMAGE="${NODE_IMAGE:-node:22-alpine}" \
    --build-arg GO_IMAGE="${GO_IMAGE:-golang:1.24-alpine}" \
    --build-arg RUNTIME_IMAGE="${RUNTIME_IMAGE:-alpine:3.20}" \
    --build-arg NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org/}" \
    --build-arg GOPROXY="${GOPROXY:-https://proxy.golang.org,direct}" \
    "$REPO"
  check_keys
}

# ---------------------------------------------------------------- license options
parse_opts() {
  DOMAIN="" ORG="" ADMIN_EMAIL="" ADMIN_PHONE="" PLAN="pro" STUDENTS="" USERS="" MONTHS=12 DAYS=0 VENDOR=false PURGE=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain) DOMAIN="$2"; shift 2 ;;
      --org) ORG="$2"; shift 2 ;;
      --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
      --admin-phone) ADMIN_PHONE="$2"; shift 2 ;;
      --plan) PLAN="$2"; shift 2 ;;
      --students) STUDENTS="$2"; shift 2 ;;
      --users) USERS="$2"; shift 2 ;;
      --months) MONTHS="$2"; shift 2 ;;
      --days) DAYS="$2"; shift 2 ;;
      --trial) PLAN="trial"; MONTHS=0; DAYS="$2"; shift 2 ;;
      --free) PLAN="free"; MONTHS=1200; DAYS=0; shift ;;
      --vendor) VENDOR=true; shift ;;
      --purge) PURGE=true; shift ;;
      *) die "unknown option $1" ;;
    esac
  done
  # Plan limits (keep in sync with src/config/saas.ts); explicit --students/--users win.
  case "$PLAN" in
    basic) : "${STUDENTS:=100}" "${USERS:=5}" ;;
    pro | trial) : "${STUDENTS:=400}" "${USERS:=15}" ;;
    *) : "${STUDENTS:=0}" "${USERS:=0}" ;;
  esac
}

issue_license() { # slug
  license_cli issue -priv /keys/license-private.key -customer "${ORG:-$1}" -plan "$PLAN" \
    -students "$STUDENTS" -users "$USERS" -months "$MONTHS" -days "$DAYS" -domain "$DOMAIN"
}

write_site() { # slug domain
  cat >"$SITES/$1.caddy" <<EOF
$2 {
	encode zstd gzip
	reverse_proxy uf-$1:8081
}
EOF
}

write_suspended_site() { # slug domain
  cat >"$SITES/$1.caddy" <<EOF
$2 {
	header Content-Type "text/html; charset=utf-8"
	respond "<html dir=rtl><body style='font-family:tahoma;text-align:center;padding:60px'><h2>سرویس این مجموعه موقتاً غیرفعال است</h2><p>برای فعال‌سازی با پشتیبانی تماس بگیرید.</p></body></html>" 503
}
EOF
}

run_tenant() { # slug
  local d; d="$(tenant_dir "$1")"
  docker rm -f "uf-$1" >/dev/null 2>&1 || true
  docker run -d --name "uf-$1" --network unifinance --restart unless-stopped \
    --env-file "$d/tenant.env" -v "uf-$1-uploads:/app/uploads" \
    --label unifinance.tenant="$1" "$IMAGE" >/dev/null
}

wait_healthy() { # slug
  for _ in $(seq 1 90); do
    if docker exec "uf-$1" wget -qO- http://127.0.0.1:8081/health >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  docker logs --tail 30 "uf-$1" >&2 || true
  die "uf-$1 did not become healthy"
}

# ---------------------------------------------------------------- tenants
cmd_create() {
  local slug="${1:-}"; [[ -n "$slug" ]] || die "usage: ./uf.sh create <slug> [options]"
  shift; valid_slug "$slug"; parse_opts "$@"; load_env
  ensure_keys
  local d; d="$(tenant_dir "$slug")"
  [[ -e "$d" ]] && die "tenant '$slug' already exists"
  [[ -n "$ADMIN_EMAIL" ]] || die "--admin-email is required"
  DOMAIN="${DOMAIN:-$slug.$BASE_DOMAIN}"
  ORG="${ORG:-$slug}"
  if $VENDOR; then PLAN="vendor"; STUDENTS=0; USERS=0; MONTHS=1200; fi

  compose up -d db caddy >/dev/null
  wait_db
  mkdir -p "$d"; chmod 700 "$d"
  local db="uf_${slug//-/_}" dbpass jwt adminpass key
  dbpass="$(rand 28)"; jwt="$(rand 48)"; adminpass="$(rand 12)"
  sql -e "CREATE DATABASE \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
          CREATE USER '$db'@'%' IDENTIFIED BY '$dbpass';
          GRANT ALL PRIVILEGES ON \`$db\`.* TO '$db'@'%'; FLUSH PRIVILEGES;"
  key="$(issue_license "$slug")"

  cat >"$d/tenant.env" <<EOF
# Customer: $ORG — created $(date -Iseconds)
UNIFINANCE_DB_HOST=db
UNIFINANCE_DB_PORT=3306
UNIFINANCE_DB_USER=$db
UNIFINANCE_DB_PASS=$dbpass
UNIFINANCE_DB_NAME=$db
UNIFINANCE_JWT_SECRET=$jwt
UNIFINANCE_FRONTEND_URL=https://$DOMAIN
UNIFINANCE_CORS_ALLOW_ORIGINS=https://$DOMAIN
UNIFINANCE_ZARINPAL_CALLBACK_URL=https://$DOMAIN/payment/callback
UNIFINANCE_ZARINPAL_SANDBOX=false
UNIFINANCE_ZARINPAL_MERCHANT_ID=
UNIFINANCE_MELIPAYAMAK_USERNAME=${MELIPAYAMAK_USERNAME:-}
UNIFINANCE_MELIPAYAMAK_API_KEY=${MELIPAYAMAK_API_KEY:-}
UNIFINANCE_MELIPAYAMAK_FROM=${MELIPAYAMAK_FROM:-}
UNIFINANCE_BOOTSTRAP_ORG_NAME=$ORG
UNIFINANCE_BOOTSTRAP_ADMIN_EMAIL=$ADMIN_EMAIL
UNIFINANCE_BOOTSTRAP_ADMIN_PASSWORD=$adminpass
UNIFINANCE_BOOTSTRAP_ADMIN_PHONE=$ADMIN_PHONE
UNIFINANCE_SAAS_VENDOR=$VENDOR
UNIFINANCE_LICENSE_KEY=$key
EOF
  chmod 600 "$d/tenant.env"
  printf 'DOMAIN=%s\nORG=%s\nPLAN=%s\nCREATED=%s\n' "$DOMAIN" "$ORG" "$PLAN" "$(date -I)" >"$d/meta"

  run_tenant "$slug"
  wait_healthy "$slug"
  write_site "$slug" "$DOMAIN"
  reload_caddy

  cat >"$d/credentials.txt" <<EOF
آدرس پنل:   https://$DOMAIN
ایمیل ورود: $ADMIN_EMAIL
رمز اولیه:  $adminpass
(پس از اولین ورود، رمز را از بخش پروفایل تغییر دهید)
EOF
  chmod 600 "$d/credentials.txt"
  green "customer '$slug' is ready"
  cat "$d/credentials.txt"
  echo "DNS: point $DOMAIN (A record) to this server; HTTPS is issued automatically."
}

cmd_list() {
  load_env
  printf '%-16s %-32s %-11s %-10s %s\n' SLUG DOMAIN PLAN STATUS EXPIRES
  shopt -s nullglob
  for d in "$TENANTS"/*/; do
    local slug; slug="$(basename "$d")"
    [[ -f "$d/meta" ]] || continue
    local domain plan status exp key
    domain="$(env_get "$d/meta" DOMAIN)"; plan="$(env_get "$d/meta" PLAN)"
    status="$(docker inspect -f '{{.State.Status}}' "uf-$slug" 2>/dev/null || echo missing)"
    [[ -f "$d/suspended" ]] && status="suspended"
    key="$(env_get "$d/tenant.env" UNIFINANCE_LICENSE_KEY)"
    exp="$(license_cli inspect -pub /keys/license-public.key "$key" 2>/dev/null | awk '/^expires:/{print substr($2,1,10)}')"
    printf '%-16s %-32s %-11s %-10s %s\n' "$slug" "$domain" "$plan" "$status" "${exp:--}"
  done
}

cmd_license() {
  local slug="${1:-}"; [[ -n "$slug" ]] || die "usage: ./uf.sh license <slug> [--plan --students --users --months --days]"
  shift; require_tenant "$slug"; parse_opts "$@"; load_env
  ensure_keys
  local d; d="$(tenant_dir "$slug")"
  DOMAIN="$(env_get "$d/meta" DOMAIN)"; ORG="$(env_get "$d/meta" ORG)"
  local key db
  key="$(issue_license "$slug")"
  env_set "$d/tenant.env" UNIFINANCE_LICENSE_KEY "$key"
  env_set "$d/meta" PLAN "$PLAN"
  # A key saved in the app wins over the env var, so store it there too.
  db="$(env_get "$d/tenant.env" UNIFINANCE_DB_NAME)"
  sql "$db" -e "REPLACE INTO app_settings (\`key\`, value, updated_at) VALUES ('license_key', '$key', NOW());" || true
  run_tenant "$slug"
  wait_healthy "$slug"
  green "license renewed for $slug"
  license_cli inspect -pub /keys/license-public.key "$key"
}

cmd_suspend() {
  require_tenant "${1:-}"; load_env
  local d; d="$(tenant_dir "$1")"
  docker stop "uf-$1" >/dev/null 2>&1 || true
  touch "$d/suspended"
  write_suspended_site "$1" "$(env_get "$d/meta" DOMAIN)"
  reload_caddy
  green "suspended $1 (data kept)"
}

cmd_resume() {
  require_tenant "${1:-}"; load_env
  local d; d="$(tenant_dir "$1")"
  rm -f "$d/suspended"
  run_tenant "$1"; wait_healthy "$1"
  write_site "$1" "$(env_get "$d/meta" DOMAIN)"
  reload_caddy
  green "resumed $1"
}

cmd_restart() {
  require_tenant "${1:-}"; load_env
  run_tenant "$1"; wait_healthy "$1"; green "restarted $1"
}

each_tenant() { # fn — call fn for every active tenant
  shopt -s nullglob
  for d in "$TENANTS"/*/; do
    local slug; slug="$(basename "$d")"
    [[ -f "$d/tenant.env" && ! -f "$d/suspended" ]] && "$1" "$slug"
  done
}

backup_one() { # slug
  local d db out stamp
  d="$(tenant_dir "$1")"; db="$(env_get "$d/tenant.env" UNIFINANCE_DB_NAME)"
  stamp="$(date +%Y%m%d-%H%M%S)"; out="$BACKUPS/$1"; mkdir -p "$out"
  compose exec -T db mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction --routines "$db" | gzip >"$out/$stamp.sql.gz"
  docker run --rm -u 0 --entrypoint tar -v "uf-$1-uploads:/u:ro" -v "$out:/b" "$IMAGE" czf "/b/$stamp-uploads.tar.gz" -C /u .
  find "$out" -type f -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  echo "backup $1 -> $out/$stamp.sql.gz"
}

cmd_backup() {
  load_env
  if [[ "${1:-}" == "--all" || -z "${1:-}" ]]; then each_tenant backup_one; else require_tenant "$1"; backup_one "$1"; fi
}

cmd_restore() {
  local slug="${1:-}" file="${2:-}"
  require_tenant "$slug"; [[ -f "$file" ]] || die "usage: ./uf.sh restore <slug> <file.sql.gz>"
  load_env
  local db; db="$(env_get "$(tenant_dir "$slug")/tenant.env" UNIFINANCE_DB_NAME)"
  read -r -p "restore $file into $db (current data will be replaced)? type yes: " ok
  [[ "$ok" == "yes" ]] || die "cancelled"
  backup_one "$slug"
  docker stop "uf-$slug" >/dev/null
  sql -e "DROP DATABASE \`$db\`; CREATE DATABASE \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  gunzip -c "$file" | sql "$db"
  docker start "uf-$slug" >/dev/null; wait_healthy "$slug"
  green "restored $slug"
}

update_one() { backup_one "$1"; run_tenant "$1"; wait_healthy "$1"; green "updated $1"; }

cmd_update() {
  load_env
  if [[ "${SKIP_BUILD:-0}" != "1" ]]; then cmd_build; fi
  if [[ "${1:-}" == "--all" || -z "${1:-}" ]]; then each_tenant update_one; else require_tenant "$1"; update_one "$1"; fi
}

cmd_logs() { require_tenant "${1:-}"; docker logs --tail "${2:-200}" -f "uf-$1"; }

cmd_remove() {
  local slug="${1:-}"; [[ -n "$slug" ]] || die "usage: ./uf.sh remove <slug> [--purge]"
  shift; require_tenant "$slug"; parse_opts "$@"; load_env
  local d; d="$(tenant_dir "$slug")"
  read -r -p "remove customer $slug$($PURGE && echo ' AND ALL ITS DATA')? type the slug to confirm: " ok
  [[ "$ok" == "$slug" ]] || die "cancelled"
  backup_one "$slug" || true
  docker rm -f "uf-$slug" >/dev/null 2>&1 || true
  rm -f "$SITES/$slug.caddy"; reload_caddy
  if $PURGE; then
    local db; db="$(env_get "$d/tenant.env" UNIFINANCE_DB_NAME)"
    sql -e "DROP DATABASE IF EXISTS \`$db\`; DROP USER IF EXISTS '$db'@'%';"
    docker volume rm "uf-$slug-uploads" >/dev/null 2>&1 || true
    rm -rf "$d"
    green "purged $slug (last backup kept in backups/$slug)"
  else
    touch "$d/suspended"
    green "removed container for $slug (database kept; ./uf.sh resume $slug brings it back)"
  fi
}

cmd_install_cron() {
  local line="30 3 * * * cd $HERE && ./uf.sh backup --all >> $HERE/backups/cron.log 2>&1"
  (crontab -l 2>/dev/null | grep -v 'uf.sh backup'; echo "$line") | crontab -
  green "nightly backup installed: $line"
}

cmd_onprem_bundle() {
  local name="${1:-}"; [[ -n "$name" ]] || die "usage: ./uf.sh onprem-bundle <name> [--org --plan --students --users --months]"
  shift; parse_opts "$@"; load_env
  ensure_keys
  ORG="${ORG:-$name}"; PLAN="${PLAN:-onprem}"
  local out="$HERE/dist/onprem-$name" key
  rm -rf "$out"; mkdir -p "$out"
  key="$(issue_license "$name")"
  echo "$key" >"$out/license.key"
  cp "$REPO/deploy/onprem/"{docker-compose.yml,Caddyfile,install.sh,update.sh,backup.sh,.env.example,README.md} "$out/"
  sed -i "s|^IMAGE=.*|IMAGE=$IMAGE|; s|^MARIADB_IMAGE=.*|MARIADB_IMAGE=${MARIADB_IMAGE:-mariadb:11}|; s|^CADDY_IMAGE=.*|CADDY_IMAGE=${CADDY_IMAGE:-caddy:2-alpine}|" "$out/.env.example"
  green "saving image (this takes a minute) ..."
  docker save "$IMAGE" | gzip >"$out/unifinance-image.tar.gz"
  tar czf "$HERE/dist/onprem-$name.tar.gz" -C "$HERE/dist" "onprem-$name"
  green "bundle: dist/onprem-$name.tar.gz (send it to the customer; they run ./install.sh)"
}

case "${1:-}" in
  setup) shift; cmd_setup "$@" ;;
  build) shift; cmd_build "$@" ;;
  create) shift; cmd_create "$@" ;;
  list) shift; cmd_list "$@" ;;
  license) shift; cmd_license "$@" ;;
  suspend) shift; cmd_suspend "$@" ;;
  resume) shift; cmd_resume "$@" ;;
  restart) shift; cmd_restart "$@" ;;
  update) shift; cmd_update "$@" ;;
  backup) shift; cmd_backup "$@" ;;
  restore) shift; cmd_restore "$@" ;;
  logs) shift; cmd_logs "$@" ;;
  remove) shift; cmd_remove "$@" ;;
  install-cron) shift; cmd_install_cron "$@" ;;
  onprem-bundle) shift; cmd_onprem_bundle "$@" ;;
  *) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
