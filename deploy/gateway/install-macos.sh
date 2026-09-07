#!/bin/bash
set -euo pipefail
umask 077
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer must run on the Gateway Mac." >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /absolute/path/to/runner.env" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$1"
if [[ "$ENV_FILE" != /* || ! -f "$ENV_FILE" ]]; then
  echo "runner.env must be an existing absolute path." >&2
  exit 1
fi

for command in node npm curl cloudflared; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

if ! launchctl print "gui/$(id -u)" >/dev/null 2>&1; then
  echo "No active macOS GUI user session. Run this while the Gateway Mac user is logged in." >&2
  exit 1
fi

chmod 600 "$ENV_FILE"
export ALLSTAR_GATEWAY_ENV_FILE="$ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

node "$SCRIPT_DIR/preflight.mjs" runner
mkdir -p "$GATEWAY_RUNNER_SESSION_DIR"
chmod 700 "$GATEWAY_RUNNER_SESSION_DIR"

echo "Installing runner runtime dependencies..."
(
  cd "$REPO_DIR"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --omit=dev
)

LAUNCH_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/AllStarOSGateway"
mkdir -p "$LAUNCH_DIR" "$LOG_DIR"

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

write_agent() {
  local label="$1"
  local script="$2"
  local plist="$LAUNCH_DIR/$label.plist"
  local escaped_script escaped_env escaped_out escaped_err
  escaped_script="$(xml_escape "$script")"
  escaped_env="$(xml_escape "$ENV_FILE")"
  escaped_out="$(xml_escape "$LOG_DIR/$label.out.log")"
  escaped_err="$(xml_escape "$LOG_DIR/$label.err.log")"
  cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$escaped_script</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ALLSTAR_GATEWAY_ENV_FILE</key><string>$escaped_env</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$escaped_out</string>
  <key>StandardErrorPath</key><string>$escaped_err</string>
</dict>
</plist>
EOF
  plutil -lint "$plist" >/dev/null
  launchctl bootout "gui/$(id -u)" "$plist" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$plist"
  launchctl enable "gui/$(id -u)/$label"
  launchctl kickstart -k "gui/$(id -u)/$label"
}

write_agent "com.allstaros.gateway-runner" "$SCRIPT_DIR/start-runner.sh"
write_agent "com.allstaros.gateway-tunnel" "$SCRIPT_DIR/start-tunnel.sh"

PORT="${GATEWAY_RUNNER_PORT:-8788}"
LOCAL_HEALTH="http://127.0.0.1:$PORT/health"
echo "Waiting for Gateway runner health..."
for _ in $(seq 1 30); do
  if curl -fsS "$LOCAL_HEALTH" >/dev/null 2>&1; then
    echo "PASS: local runner health is reachable."
    break
  fi
  sleep 1
done
curl -fsS "$LOCAL_HEALTH" >/dev/null

PUBLIC_HEALTH="${GATEWAY_RUNNER_PUBLIC_URL%/}/health"
echo "Waiting for Cloudflare public health route..."
for _ in $(seq 1 30); do
  if curl -fsS "$PUBLIC_HEALTH" >/dev/null 2>&1; then
    echo "PASS: public Gateway runner health is reachable."
    exit 0
  fi
  sleep 1
done

echo "Runner is healthy locally, but the public tunnel health check failed: $PUBLIC_HEALTH" >&2
echo "Verify the Cloudflare tunnel public hostname routes to http://127.0.0.1:$PORT." >&2
exit 1
