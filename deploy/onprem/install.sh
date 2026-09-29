#!/usr/bin/env bash
# First-time install on your own server (needs Docker with the compose plugin).
#   ./install.sh                     asks a few questions
#   ./install.sh --domain panel.example.ir --org "مؤسسه ..." --admin-email admin@example.ir
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

rand() { local n="${1:-24}" s=""; while ((${#s} < n)); do s+="$(head -c 96 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"; done; printf '%s' "${s:0:n}"; }
set_env() { local k="$1" v="$2" t; t="$(mktemp)"; grep -vE "^$k=" .env >"$t" || true; printf '%s=%s\n' "$k" "$v" >>"$t"; cat "$t" >.env; rm -f "$t"; }
get_env() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }

DOMAIN="" ORG="" ADMIN_EMAIL="" ACME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --org) ORG="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --acme-email) ACME="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 1 ;;
  esac
done

command -v docker >/dev/null || { echo "Docker is not installed: https://docs.docker.com/engine/install/" >&2; exit 1; }
docker compose version >/dev/null || { echo "docker compose plugin is required" >&2; exit 1; }
[[ -f license.key ]] || { echo "license.key not found next to install.sh (you receive it with your purchase)" >&2; exit 1; }

if [[ -f .env && -n "$(get_env JWT_SECRET)" ]]; then
  echo ".env already exists — this server is installed. Use ./update.sh to upgrade." >&2
  exit 1
fi
cp .env.example .env
chmod 600 .env

[[ -n "$DOMAIN" ]] || read -r -p "Domain (e.g. panel.example.ir, empty for LAN/IP access): " DOMAIN
[[ -n "$ORG" ]] || read -r -p "Organization name: " ORG
[[ -n "$ADMIN_EMAIL" ]] || read -r -p "Admin email: " ADMIN_EMAIL
[[ -n "$ADMIN_EMAIL" ]] || { echo "admin email is required" >&2; exit 1; }

if [[ -n "$DOMAIN" ]]; then
  set_env DOMAIN "$DOMAIN"
  set_env SITE_ADDRESS "$DOMAIN"
  set_env SITE_URL "https://$DOMAIN"
  set_env ACME_EMAIL "${ACME:-$ADMIN_EMAIL}"
else
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  set_env SITE_ADDRESS ":80"
  set_env SITE_URL "http://${ip:-localhost}"
fi
ADMIN_PASSWORD="$(rand 12)"
set_env ORG_NAME "$ORG"
set_env ADMIN_EMAIL "$ADMIN_EMAIL"
set_env ADMIN_PASSWORD "$ADMIN_PASSWORD"
set_env DB_PASSWORD "$(rand 28)"
set_env DB_ROOT_PASSWORD "$(rand 28)"
set_env JWT_SECRET "$(rand 48)"

if [[ -f unifinance-image.tar.gz ]]; then
  echo "loading application image ..."
  gunzip -c unifinance-image.tar.gz | docker load
fi

docker compose up -d
echo "waiting for the application to start ..."
for _ in $(seq 1 90); do
  if docker compose exec -T app wget -qO- http://127.0.0.1:8081/health >/dev/null 2>&1; then
    url="$(get_env SITE_URL)"
    cat <<MSG

نصب کامل شد.
آدرس:        $url
ایمیل ورود:  $ADMIN_EMAIL
رمز اولیه:   $ADMIN_PASSWORD
پس از اولین ورود رمز را تغییر دهید. پشتیبان‌گیری شبانه: ./backup.sh --install-cron
MSG
    exit 0
  fi
  sleep 2
done
docker compose logs --tail 40 app >&2
echo "the application did not start; see the log above" >&2
exit 1
