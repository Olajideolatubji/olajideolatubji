#!/usr/bin/env bash
# Run the server on the computer you are sitting at. Costs nothing.
#
#   bash deploy/local.sh              -> http://localhost:8000
#   bash deploy/local.sh --tunnel     -> also a free public https:// link
#   bash deploy/local.sh --stop       -> stop it
#
# Works on macOS and Linux. Needs Docker Desktop (free) and nothing else: no
# server to rent, no domain, no card.
#
# --tunnel adds a Cloudflare quick tunnel, which hands out a free
# https://something.trycloudflare.com address with no account and no domain.
# The address is temporary — it changes every time you restart the tunnel — so
# it is for reaching your dashboard from your phone or showing someone, not for
# anything permanent.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
COMPOSE=(docker compose)
MODE=start
TUNNEL=0

say()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m !\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m x\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tunnel) TUNNEL=1; shift ;;
    --stop)   MODE=stop; shift ;;
    --logs)   MODE=logs; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
done

# ------------------------------------------------------------------- docker
if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    die "Docker is not running. Install Docker Desktop from
     https://www.docker.com/products/docker-desktop (free), open it, wait for
     the whale in the menu bar to stop animating, then run this again."
  fi
  die "Docker is not running. Start it (or install it: https://get.docker.com) and try again."
fi

[[ $TUNNEL -eq 1 ]] && COMPOSE+=(--profile tunnel)

if [[ "$MODE" == "stop" ]]; then
  say "Stopping"
  "${COMPOSE[@]}" down
  echo "Stopped. Your projects and videos are kept; run this script again to pick up where you left off."
  exit 0
fi

if [[ "$MODE" == "logs" ]]; then
  exec "${COMPOSE[@]}" logs -f
fi

# --------------------------------------------------------------------- .env
if [[ ! -f .env ]]; then
  say "First run: writing .env"
  PASSWORD="$(head -c 32 /dev/urandom | LC_ALL=C tr -dc 'a-zA-Z0-9' | cut -c1-16)"
  SECRET="$(head -c 64 /dev/urandom | LC_ALL=C tr -dc 'a-zA-Z0-9' | cut -c1-48)"
  cp .env.example .env
  # BSD sed (macOS) and GNU sed disagree about -i, so write through a temp file.
  sed -e "s|^OPERATOR_PASSWORD=.*|OPERATOR_PASSWORD=${PASSWORD}|" \
      -e "s|^SECRET_KEY=.*|SECRET_KEY=${SECRET}|" .env > .env.tmp && mv .env.tmp .env
else
  PASSWORD="$(grep -E '^OPERATOR_PASSWORD=' .env | cut -d= -f2- || true)"
fi

# ------------------------------------------------------------------- launch
say "Starting (the first run downloads and builds — several minutes; after that it is seconds)"
"${COMPOSE[@]}" up -d --build

say "Waiting for it to answer"
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${API_PORT:-8000}/healthz" >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 2
done

echo
if [[ "${READY:-0}" == "1" ]]; then
  printf '\033[1;32m  Your server is running on this computer.\033[0m\n\n'
else
  warn "It has not answered yet — it may still be building. Watch it with:"
  echo "    bash deploy/local.sh --logs"
  echo
fi

printf '  Open:     \033[1mhttp://localhost:%s\033[0m\n' "${API_PORT:-8000}"
printf '  Password: \033[1m%s\033[0m\n' "${PASSWORD:-(see OPERATOR_PASSWORD in .env)}"

if [[ $TUNNEL -eq 1 ]]; then
  say "Looking for the public link (Cloudflare hands it out, usually within 20 seconds)"
  PUBLIC=""
  for _ in $(seq 1 20); do
    PUBLIC="$("${COMPOSE[@]}" logs cloudflared 2>/dev/null \
      | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
    [[ -n "$PUBLIC" ]] && break
    sleep 3
  done
  if [[ -n "$PUBLIC" ]]; then
    printf '\n  Public:   \033[1m%s\033[0m\n' "$PUBLIC"
    echo "            (works from your phone or anywhere; changes if you restart)"
  else
    warn "No public link yet. Check: bash deploy/local.sh --tunnel --logs"
  fi
fi

echo
echo "  Stop:   bash deploy/local.sh --stop"
echo "  Logs:   bash deploy/local.sh --logs"
echo
echo "  It keeps running as long as this computer is awake. Renders stop if it sleeps"
echo "  and pick up again from the last finished chapter when it wakes."
echo
