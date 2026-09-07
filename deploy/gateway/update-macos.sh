#!/bin/bash
set -euo pipefail
umask 077
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This updater must run on the Gateway Mac." >&2
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

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

node "$SCRIPT_DIR/preflight.mjs" runner
(
  cd "$REPO_DIR"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --omit=dev
)

for label in com.allstaros.gateway-runner com.allstaros.gateway-tunnel; do
  if ! launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
    echo "$label is not installed. Run install-macos.sh first." >&2
    exit 1
  fi
  launchctl kickstart -k "gui/$(id -u)/$label"
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
