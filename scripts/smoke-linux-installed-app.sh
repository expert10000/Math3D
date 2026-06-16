#!/usr/bin/env bash
set -euo pipefail

seconds="${MATH3D_LINUX_APP_SMOKE_SECONDS:-20}"
app_path="${1:-}"

resolve_app_path() {
  if command -v math3d >/dev/null 2>&1; then
    command -v math3d
    return 0
  fi

  for candidate in \
    /usr/bin/math3d \
    /opt/Math3D/math3d \
    /opt/Math3D\ Dev/math3d \
    /opt/math3d/math3d
  do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  local desktop exec_line exec_cmd
  desktop="$(find /usr/share/applications -iname '*math3d*.desktop' -type f -print -quit 2>/dev/null || true)"
  if [[ -n "$desktop" ]]; then
    exec_line="$(grep -E '^Exec=' "$desktop" | head -n 1 | sed 's/^Exec=//' || true)"
    exec_cmd="${exec_line%% *}"
    exec_cmd="${exec_cmd%\"}"
    exec_cmd="${exec_cmd#\"}"
    if [[ -n "$exec_cmd" ]]; then
      if [[ -x "$exec_cmd" ]]; then
        printf '%s\n' "$exec_cmd"
        return 0
      fi
      if command -v "$exec_cmd" >/dev/null 2>&1; then
        command -v "$exec_cmd"
        return 0
      fi
    fi
  fi

  find /opt -maxdepth 4 \
    \( -path '*/Math3D/*' -o -path '*/math3d/*' \) \
    -type f \
    -perm -111 \
    -name 'math3d' \
    -print -quit
}

if [[ -z "$app_path" ]]; then
  app_path="$(resolve_app_path)"
fi

if [[ -z "$app_path" || ! -x "$app_path" ]]; then
  echo "[linux-app-smoke] installed app executable not found" >&2
  echo "[linux-app-smoke] desktop entries:" >&2
  find /usr/share/applications -iname '*math3d*.desktop' -type f -print -exec sed -n '1,80p' {} \; >&2 || true
  echo "[linux-app-smoke] /opt Math3D candidates:" >&2
  find /opt -maxdepth 4 -type f -perm -111 -print >&2 || true
  exit 1
fi

log="${RUNNER_TEMP:-/tmp}/math3d-linux-app-smoke.log"
resolved_path="$(readlink -f "$app_path" 2>/dev/null || printf '%s\n' "$app_path")"
echo "[linux-app-smoke] launching: $app_path"
echo "[linux-app-smoke] resolved: $resolved_path"
echo "[linux-app-smoke] file info:"
file "$resolved_path" || true

if command -v ldd >/dev/null 2>&1; then
  echo "[linux-app-smoke] ldd missing libraries:"
  ldd "$resolved_path" 2>/dev/null | grep 'not found' || true
fi

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
