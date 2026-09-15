#!/bin/bash
set -euo pipefail
umask 077
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This installer must run on the Gateway Mac." >&2
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "Gateway services are system LaunchDaemons. Re-run this installer with sudo." >&2
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

SERVICE_USER="${ALLSTAR_GATEWAY_SERVICE_USER:-${SUDO_USER:-}}"
if [[ -z "$SERVICE_USER" || "$SERVICE_USER" == "root" ]] || ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Set ALLSTAR_GATEWAY_SERVICE_USER to the non-root Mac account that owns the Gateway runtime." >&2
  exit 1
fi
SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
SERVICE_HOME="$(dscl . -read "/Users/$SERVICE_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
if [[ -z "$SERVICE_HOME" || ! -d "$SERVICE_HOME" ]]; then
  echo "Unable to resolve the Gateway runtime account home directory." >&2
  exit 1
fi
export HOME="$SERVICE_HOME"

for command in node npm curl cloudflared python3 caffeinate; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

chown "$SERVICE_USER:$SERVICE_GROUP" "$ENV_FILE"
chmod 600 "$ENV_FILE"
export ALLSTAR_GATEWAY_ENV_FILE="$ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

node "$SCRIPT_DIR/preflight.mjs" runner
mkdir -p "$GATEWAY_RUNNER_SESSION_DIR"
chown "$SERVICE_USER:$SERVICE_GROUP" "$GATEWAY_RUNNER_SESSION_DIR"
chmod 700 "$GATEWAY_RUNNER_SESSION_DIR"

RUNTIME_DIR="/Library/Application Support/AllStarOSGateway"
HTTP_VENV="$RUNTIME_DIR/http-venv"
mkdir -p "$RUNTIME_DIR"
echo "Installing HTTP-only Gateway adapter dependencies..."
python3 -m venv "$HTTP_VENV"
"$HTTP_VENV/bin/python" -m pip install --disable-pip-version-check -r "$REPO_DIR/gateway-http-worker/requirements.txt"
chown -R "$SERVICE_USER:$SERVICE_GROUP" "$HTTP_VENV"

echo "Installing runner runtime dependencies..."
(
  cd "$REPO_DIR"
  npm ci --omit=dev
)

LAUNCH_DIR="/Library/LaunchDaemons"
LOG_DIR="/Library/Logs/AllStarOSGateway"
mkdir -p "$LAUNCH_DIR" "$LOG_DIR"
chown "$SERVICE_USER:$SERVICE_GROUP" "$LOG_DIR"
chmod 750 "$LOG_DIR"

xml_escape() {
  printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'
}

write_daemon() {
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
    <key>HOME</key><string>$(xml_escape "$SERVICE_HOME")</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>UserName</key><string>$(xml_escape "$SERVICE_USER")</string>
  <key>GroupName</key><string>$(xml_escape "$SERVICE_GROUP")</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$escaped_out</string>
  <key>StandardErrorPath</key><string>$escaped_err</string>
</dict>
</plist>
EOF
  chown root:wheel "$plist"
  chmod 644 "$plist"
  plutil -lint "$plist" >/dev/null
  launchctl bootout system "$plist" >/dev/null 2>&1 || true
  launchctl bootstrap system "$plist"
  launchctl enable "system/$label"
  launchctl kickstart -k "system/$label"
}

write_daemon "com.allstaros.gateway-runner" "$SCRIPT_DIR/start-runner.sh"
write_daemon "com.allstaros.gateway-tunnel" "$SCRIPT_DIR/start-tunnel.sh"

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
