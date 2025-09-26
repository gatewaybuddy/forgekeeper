#!/bin/sh
set -eu

APP_CONFIG_PATH="${APP_CONFIG_PATH:-/usr/share/nginx/html/app-config.js}"
BACKEND_URL_VALUE="${BACKEND_URL:-}"

escaped_backend_url=$(printf '%s' "$BACKEND_URL_VALUE" | sed 's/\\/\\\\/g; s/"/\\"/g')

mkdir -p "$(dirname "$APP_CONFIG_PATH")"
cat <<CONFIG > "$APP_CONFIG_PATH"
window.__APP_CONFIG__ = Object.assign({}, window.__APP_CONFIG__, {
  BACKEND_URL: "$escaped_backend_url"
});
CONFIG

echo "[entrypoint] Wrote backend URL config to $APP_CONFIG_PATH"

exec "$@"
