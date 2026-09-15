#!/bin/bash
set -euo pipefail
umask 077
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This updater must run on the Gateway Mac." >&2
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Gateway services are system LaunchDaemons. Re-run this updater with sudo." >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /absolute/path/to/runner.env" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$1"
export ALLSTAR_GATEWAY_ENV_FILE="$ENV_FILE"

if [[ "$ENV_FILE" != /* || ! -f "$ENV_FILE" ]]; then
  echo "runner.env must be an existing absolute path." >&2
  exit 1
fi

SERVICE_USER="${ALLSTAR_GATEWAY_SERVICE_USER:-${SUDO_USER:-}}"
if [[ -n "$SERVICE_USER" && "$SERVICE_USER" != "root" ]] && id "$SERVICE_USER" >/dev/null 2>&1; then
  SERVICE_HOME="$(dscl . -read "/Users/$SERVICE_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
  [[ -n "$SERVICE_HOME" ]] && export HOME="$SERVICE_HOME"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

node "$SCRIPT_DIR/preflight.mjs" runner
(
  cd "$REPO_DIR"
  npm ci --omit=dev
)

HTTP_PYTHON="${GATEWAY_RUNNER_GATEWAY_HTTP_PYTHON:-/Library/Application Support/AllStarOSGateway/http-venv/bin/python}"
if [[ ! -x "$HTTP_PYTHON" ]]; then
  echo "Gateway HTTP Python environment is missing. Re-run install-macos.sh." >&2
  exit 1
fi
"$HTTP_PYTHON" -m pip install --disable-pip-version-check -r "$REPO_DIR/gateway-http-worker/requirements.txt"

for label in com.allstaros.gateway-runner com.allstaros.gateway-tunnel; do
  if ! launchctl print "system/$label" >/dev/null 2>&1; then
    echo "$label is not installed. Run install-macos.sh first." >&2
    exit 1
  fi
  launchctl kickstart -k "system/$label"
done

PORT="${GATEWAY_RUNNER_PORT:-8788}"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "PASS: updated Gateway runner is healthy."
    exit 0
  fi
  sleep 1
done

echo "Updated Gateway runner did not become healthy." >&2
exit 1
