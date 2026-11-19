#!/usr/bin/env bash
set -euo pipefail

receipt_path=${1:?Usage: release20-ci-sage-host.sh <receipt-path> <hold-minutes> <source-directory>}
hold_minutes=${2:?Usage: release20-ci-sage-host.sh <receipt-path> <hold-minutes> <source-directory>}
source_directory=${3:?Usage: release20-ci-sage-host.sh <receipt-path> <hold-minutes> <source-directory>}
if [[ ! $hold_minutes =~ ^[0-9]+$ ]] || (( hold_minutes < 15 || hold_minutes > 180 )); then
  echo 'The Sage host duration must be 15–180 minutes.' >&2
  exit 1
fi
if [[ ! ${MATH3D_RELEASE20_SAGE_BRIDGE_TOKEN:-} =~ ^[0-9a-f]{64}$ ]] ||
   [[ -z ${MATH3D_RELEASE20_SAGE_TUNNEL_TOKEN:-} ]] ||
   [[ -z ${MATH3D_RELEASE20_SAGE_SERVICE_URL:-} ]]; then
  echo 'The named Tunnel token, bridge token, and service URL secrets are required.' >&2
  exit 1
fi

node -e '
  const u = new URL(process.env.MATH3D_RELEASE20_SAGE_SERVICE_URL);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash ||
      u.pathname !== `/${process.env.MATH3D_RELEASE20_SAGE_BRIDGE_TOKEN}`)
    throw new Error("The Sage service URL must be the named HTTPS hostname plus the bridge token path.");
'

source_commit=$(git -C "$source_directory" rev-parse HEAD)
if [[ ! $source_commit =~ ^[0-9a-f]{40}$ ]]; then
  echo 'The checked-out Sage source must have a full commit hash.' >&2
  exit 1
fi

state_dir=$(mktemp -d "${RUNNER_TEMP:-/tmp}/math3d-sage-ci.XXXXXXXX")
bridge_pid=''
tunnel_id=''
worker_id=''
cleanup() {
  if [[ -n $tunnel_id ]]; then docker stop "$tunnel_id" >/dev/null 2>&1 || true; fi
  if [[ -n $bridge_pid ]]; then kill "$bridge_pid" 2>/dev/null || true; fi
  if [[ -n $worker_id ]]; then docker stop "$worker_id" >/dev/null 2>&1 || true; fi
  rm -f "$state_dir/tunnel-token" "$state_dir/health.json" "$state_dir/oracle.json"
  rmdir "$state_dir" 2>/dev/null || true
}
trap cleanup EXIT

docker build -f "$source_directory/services/sage-worker/Dockerfile" \
  -t math3d-release20-sage-worker "$source_directory/services/sage-worker"
worker_id=$(docker run -d --rm --name "math3d-sage-worker-${GITHUB_RUN_ID:-local}" \
  -p 127.0.0.1:8767:8767 math3d-release20-sage-worker)
ready=false
for attempt in $(seq 1 120); do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8767/health \
      > "$state_dir/health.json" 2>/dev/null; then
    ready=true
    break
  fi
  sleep 2
done
if [[ $ready != true ]]; then
  docker logs --tail 50 "$worker_id"
  echo 'The SageMath worker did not become healthy.' >&2
  exit 1
fi

export MATH3D_RELEASE20_SAGE_SOURCE_COMMIT=$source_commit
export MATH3D_RELEASE20_SAGE_BRIDGE_PORT=8768
printf '%s' "$MATH3D_RELEASE20_SAGE_TUNNEL_TOKEN" > "$state_dir/tunnel-token"
chmod 0444 "$state_dir/tunnel-token"
unset MATH3D_RELEASE20_SAGE_TUNNEL_TOKEN
node scripts/release20-sage-bridge.mjs > "$state_dir/bridge.log" 2>&1 &
bridge_pid=$!
for attempt in $(seq 1 30); do
  if node -e 'fetch(`http://127.0.0.1:8768/${process.env.MATH3D_RELEASE20_SAGE_BRIDGE_TOKEN}/health`,
      {signal: AbortSignal.timeout(3000)}).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))' \
      >/dev/null; then break; fi
  if ! kill -0 "$bridge_pid" 2>/dev/null; then
    echo 'The guarded Sage bridge exited before health became available.' >&2
    exit 1
  fi
  sleep 1
done

tunnel_id=$(docker run -d --rm --name "math3d-sage-ci-${GITHUB_RUN_ID:-local}" \
  --network host --mount "type=bind,source=$state_dir/tunnel-token,target=/run/secrets/tunnel-token,readonly" \
  cloudflare/cloudflared@sha256:1a50cc8893b3f0dd283805d2efcd3336210aced60a83d967fb2bbc8ab69b5f35 \
  tunnel --no-autoupdate run --token-file /run/secrets/tunnel-token)

export MATH3D_RELEASE20_SAGE_EXPECTED_SOURCE_COMMIT=$source_commit
oracle_ready=false
for attempt in $(seq 1 30); do
  if node scripts/release20-sage-oracle.mjs "$state_dir/oracle.json" \
      > "$state_dir/oracle.log" 2>&1; then
    oracle_ready=true
    break
  fi
  if [[ $(docker inspect --format '{{.State.Running}}' "$tunnel_id" 2>/dev/null || true) != true ]]; then
    echo 'The named Sage Tunnel stopped during startup.' >&2
    exit 1
  fi
  echo "Waiting for the named Sage route ($attempt/30)."
  sleep 10
done
if [[ $oracle_ready != true ]]; then
  echo 'The named HTTPS route did not pass the live Sage oracle.' >&2
  cat "$state_dir/oracle.log" >&2
  exit 1
fi

image_id=$(docker inspect --format '{{.Image}}' "$worker_id")
mkdir -p "$(dirname "$receipt_path")"
jq -n --arg commit "$source_commit" --arg image "$image_id" \
  --arg started "$(date -u +%FT%TZ)" --slurpfile health "$state_dir/health.json" \
  '{schema:"math3d/release20-sage-ci-host/v1", status:"ready", sourceCommit:$commit,
    workerImage:$image, startedAtUtc:$started, engine:$health[0].engine,
    engineVersion:$health[0].engineVersion, oracle:"passed"}' > "$receipt_path"
echo "Sage CI host ready for Windows acceptance at source commit $source_commit."

deadline=$((SECONDS + hold_minutes * 60))
while (( SECONDS < deadline )); do
  if [[ $(docker inspect --format '{{.State.Running}}' "$tunnel_id" 2>/dev/null || true) != true ]] ||
     ! kill -0 "$bridge_pid" 2>/dev/null ||
     ! node -e 'fetch(`${process.env.MATH3D_RELEASE20_SAGE_SERVICE_URL}/health`,
       {signal: AbortSignal.timeout(10000)}).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))' \
       >/dev/null; then
    echo 'The named Sage route became unavailable during the acceptance window.' >&2
    exit 1
  fi
  sleep 30
done
jq --arg ended "$(date -u +%FT%TZ)" '.status="completed" | .endedAtUtc=$ended' \
  "$receipt_path" > "$state_dir/completed.json"
mv "$state_dir/completed.json" "$receipt_path"
echo 'Sage CI host acceptance window completed.'
