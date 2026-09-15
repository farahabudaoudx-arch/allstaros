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

export GATEWAY_RUNNER_GATEWAY_HTTP_PYTHON="${GATEWAY_RUNNER_GATEWAY_HTTP_PYTHON:-/Library/Application Support/AllStarOSGateway/http-venv/bin/python}"
export GATEWAY_RUNNER_GATEWAY_HTTP_HELPER_PATH="${GATEWAY_RUNNER_GATEWAY_HTTP_HELPER_PATH:-$REPO_DIR/gateway-http-worker/personal_bridge.py}"

cd "$REPO_DIR"
# LaunchDaemon KeepAlive restarts crashed processes but does not prevent macOS
# system sleep. Hold an AC/system-idle power assertion for unattended operation;
# the assertion disappears automatically if this process exits.
exec /usr/bin/caffeinate -s -i node gateway-runner/server.mjs
