#!/usr/bin/env bash
# Turn a fresh Ubuntu/Debian box into your vertical video server.
#
# On the server, as root:
#
#   # with a domain you own (point its A record at this box first):
#   curl -fsSL <raw-url-of-this-file> | bash -s -- --domain video.example.com
#
#   # no domain: uses <your-ip>.sslip.io, still real HTTPS, nothing to buy
#   curl -fsSL <raw-url-of-this-file> | bash -s -- --auto
#
#   # plain HTTP on the IP, no certificate
#   curl -fsSL <raw-url-of-this-file> | bash -s -- --http
#
# It installs Docker if missing, fetches the code, generates a real password
# and secret key, brings the stack up and prints the link to open.
#
# Re-running it updates the code and restarts; it never overwrites an existing
# .env, so your password and API keys survive.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Olajideolatubji/olajideolatubji.git}"
BRANCH="${BRANCH:-claude/vertical-video-server-w1hj73}"
SUBDIR="${SUBDIR:-vertical-video-server}"
INSTALL_DIR="${INSTALL_DIR:-/opt/vertical-video-server}"
ACME_EMAIL="${ACME_EMAIL:-}"
SITE_ADDRESS=""
MODE=""

say()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m x\033[0m %s\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------------- arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) MODE=domain; SITE_ADDRESS="${2:?--domain needs a hostname}"; shift 2 ;;
    --auto)   MODE=auto;   shift ;;
    --http)   MODE=http;   shift ;;
    --email)  ACME_EMAIL="${2:?--email needs an address}"; shift 2 ;;
    --dir)    INSTALL_DIR="${2:?--dir needs a path}"; shift 2 ;;
    --branch) BRANCH="${2:?--branch needs a name}"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done
[[ -n "$MODE" ]] || die "pick one of --domain <host>, --auto, or --http (see --help)"
[[ $EUID -eq 0 ]] || die "run this as root (sudo -i)"

# ---------------------------------------------------------------- dependencies
say "Checking dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates openssl >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required; update Docker."

COMPOSE_VERSION="$(docker compose version --short 2>/dev/null || echo 0)"
case "$COMPOSE_VERSION" in
  0|1.*|2.[0-9].*|2.1[0-9].*|2.2[0-3].*)
    warn "Docker Compose $COMPOSE_VERSION is older than 2.24; if the stack fails to start, upgrade Docker." ;;
esac

# ------------------------------------------------------------------ the address
if [[ "$MODE" == "auto" ]]; then
  IP="$(curl -fsS --max-time 10 https://api.ipify.org || true)"
  [[ -n "$IP" ]] || die "could not work out this machine's public IP; use --domain or --http"
  # sslip.io resolves <ip>.sslip.io to <ip>, so Let's Encrypt can issue a real
  # certificate without you owning a domain.
  SITE_ADDRESS="${IP}.sslip.io"
  say "No domain given, using $SITE_ADDRESS"
elif [[ "$MODE" == "http" ]]; then
  SITE_ADDRESS=":80"
fi

# ------------------------------------------------------------------- the code
say "Fetching the code into $INSTALL_DIR"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
else
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

APP_DIR="$INSTALL_DIR/$SUBDIR"
[[ -d "$APP_DIR" ]] || die "$SUBDIR is missing from $BRANCH — wrong branch?"
cd "$APP_DIR"

# ---------------------------------------------------------------------- config
if [[ -f .env ]]; then
  say "Keeping the existing .env (your password and API keys are untouched)"
  OPERATOR_PASSWORD="$(grep -E '^OPERATOR_PASSWORD=' .env | cut -d= -f2- || true)"
else
  say "Writing .env with fresh secrets"
  OPERATOR_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  SECRET_KEY="$(openssl rand -hex 32)"
  cp .env.example .env
  sed -i "s|^OPERATOR_PASSWORD=.*|OPERATOR_PASSWORD=${OPERATOR_PASSWORD}|" .env
  sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${SECRET_KEY}|" .env
fi

# The address and cookie policy live in .env so `docker compose up` on its own
# does the right thing next time.
set_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}
set_env SITE_ADDRESS "$SITE_ADDRESS"
if [[ "$MODE" != "http" ]]; then
  set_env ACME_EMAIL "${ACME_EMAIL:-admin@${SITE_ADDRESS}}"
fi
set_env COOKIE_SECURE "$([[ "$MODE" == "http" ]] && echo false || echo true)"

# How to re-run this later, with the same arguments.
case "$MODE" in
  domain) RERUN="--domain $SITE_ADDRESS" ;;
  *)      RERUN="--$MODE" ;;
esac

# ------------------------------------------------------------------- firewall
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  say "Opening 80 and 443 on the firewall"
  ufw allow 80/tcp  >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
fi

# ---------------------------------------------------------------------- launch
say "Building and starting (first run pulls images and compiles, give it a few minutes)"
docker compose -f docker-compose.yml -f deploy/docker-compose.public.yml up -d --build

say "Waiting for the API"
for _ in $(seq 1 60); do
  if docker compose -f docker-compose.yml -f deploy/docker-compose.public.yml \
       exec -T api curl -fsS http://127.0.0.1:8000/healthz >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 3
done

URL="https://${SITE_ADDRESS}"
[[ "$MODE" == "http" ]] && URL="http://$(curl -fsS --max-time 5 https://api.ipify.org || echo localhost)"

echo
if [[ "${READY:-0}" == "1" ]]; then
  printf '\033[1;32m  Your server is up.\033[0m\n\n'
else
  warn "The API did not answer in time. It may still be building; check with:"
  echo "    cd $APP_DIR && docker compose -f docker-compose.yml -f deploy/docker-compose.public.yml logs -f"
  echo
fi
printf '  Open:     \033[1m%s\033[0m\n' "$URL"
printf '  Password: \033[1m%s\033[0m\n' "${OPERATOR_PASSWORD:-(see OPERATOR_PASSWORD in $APP_DIR/.env)}"
echo
echo "  Next: put your HeyGen key in $APP_DIR/.env (HEYGEN_API_KEY, HEYGEN_TEMPLATE_ID),"
echo "        then: cd $APP_DIR && docker compose -f docker-compose.yml -f deploy/docker-compose.public.yml up -d"
echo
echo "  Logs:    docker compose -f docker-compose.yml -f deploy/docker-compose.public.yml logs -f"
echo "  Update:  bash $APP_DIR/deploy/bootstrap.sh $RERUN"
echo
[[ "$MODE" == "http" ]] && warn "Plain HTTP: your password crosses the network in the clear. Use --auto or --domain when you can."
exit 0
