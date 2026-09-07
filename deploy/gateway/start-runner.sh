#!/bin/bash
set -euo pipefail
umask 077
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${ALLSTAR_GATEWAY_ENV_FILE:-$HOME/.config/allstaros-gateway/runner.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Gateway runner env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ "${GATEWAY_RUNNER_PROVIDER_MODULE:-}" == "auto" ]]; then
  export GATEWAY_RUNNER_PROVIDER_MODULE="$REPO_DIR/gateway-runner/providers/gateway.mjs"
fi

cd "$REPO_DIR"
exec node gateway-runner/server.mjs
