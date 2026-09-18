#!/bin/bash
set -euo pipefail
umask 077
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

ENV_FILE="${ALLSTAR_GATEWAY_ENV_FILE:-$HOME/.config/allstaros-gateway/runner.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Gateway runner env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${GATEWAY_TUNNEL_TOKEN:?GATEWAY_TUNNEL_TOKEN is required}"
# cloudflared supports TUNNEL_TOKEN directly. Keep the token out of argv/process listings.
export TUNNEL_TOKEN="$GATEWAY_TUNNEL_TOKEN"
unset GATEWAY_TUNNEL_TOKEN
exec /usr/bin/caffeinate -s -i cloudflared tunnel --no-autoupdate run
