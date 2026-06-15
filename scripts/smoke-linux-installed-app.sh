#!/usr/bin/env bash
set -euo pipefail

seconds="${MATH3D_LINUX_APP_SMOKE_SECONDS:-20}"
app_path="${1:-}"

if [[ -z "$app_path" ]]; then
  app_path="$(
    find /opt -maxdepth 3 -type f -perm -111 \
      ! -path '*/resources/*' \
      ! -name '*.so' \
      ! -name '*.so.*' \
      ! -name 'chrome-sandbox' \
      ! -name 'worker' \
      -print -quit
  )"
fi

if [[ -z "$app_path" || ! -x "$app_path" ]]; then
  echo "[linux-app-smoke] installed app executable not found" >&2
  find /opt -maxdepth 4 -type f -perm -111 -print >&2 || true
  exit 1
fi

log="${RUNNER_TEMP:-/tmp}/math3d-linux-app-smoke.log"
echo "[linux-app-smoke] launching: $app_path"

set +e
timeout "$seconds" \
  xvfb-run -a \
  env LIBGL_ALWAYS_SOFTWARE=1 ELECTRON_DISABLE_SECURITY_WARNINGS=1 \
  "$app_path" --no-sandbox --disable-dev-shm-usage --ignore-gpu-blocklist \
  >"$log" 2>&1
status=$?
set -e

if [[ "$status" -eq 124 ]]; then
  echo "[linux-app-smoke] app stayed alive for ${seconds}s"
  exit 0
fi

echo "[linux-app-smoke] app exited before ${seconds}s with status $status" >&2
echo "[linux-app-smoke] log tail:" >&2
tail -200 "$log" >&2 || true
exit "$status"
