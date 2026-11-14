#!/usr/bin/env bash
set -euo pipefail

if (( $# != 5 )); then
  echo "usage: $0 AppImage|deb|rpm OLD_PACKAGE NEW_PACKAGE OUTPUT_DIR BUILD_SOURCE_SHA" >&2
  exit 2
fi
format=$1
old_package=$(realpath "$2")
new_package=$(realpath "$3")
receipt_dir=$(realpath -m "$4")
build_source_sha=$5
mkdir -p "$receipt_dir"
work_root=$(mktemp -d "${TMPDIR:-/tmp}/math3d-linux-upgrade-${format}-XXXXXXXX")
profile="$work_root/profile"
backup="$work_root/backup"
mkdir -p "$profile"

install_package() {
  local package=$1 mode=${2:-upgrade}
  case "$format" in
    AppImage) chmod +x "$package" ;;
    deb) sudo apt-get install -y --allow-downgrades "$package" ;;
    rpm)
      if [[ "$mode" == rollback ]]; then dnf downgrade -y "$package";
      else dnf install -y --allowerasing "$package"; fi ;;
    *) echo "Unknown format: $format" >&2; exit 2 ;;
  esac
}

app_path() {
  if [[ "$format" == AppImage ]]; then printf '%s' "$1"; else printf '%s' /opt/Math3D/math3d; fi
}

run_phase() {
  local phase=$1 package=$2 app=$3 target_profile=$4
  local extra=()
  if [[ "$phase" == upgrade || "$phase" == rollback ]]; then extra+=(--seed "$receipt_dir/seed.json"); fi
  if [[ "$phase" == journey ]]; then
    local worker
    if [[ "$format" == AppImage ]]; then
      worker=$(find "$work_root/squashfs-root" -type f -path '*/resources/python-worker/worker' -print -quit)
    else
      worker=$(find /opt -type f -path '*/resources/python-worker/worker' -print -quit)
    fi
    test -n "$worker"
    extra+=(--worker "$worker")
  fi
  node scripts/release20-linux-upgrade-probe.mjs \
    --phase "$phase" --format "$format" --package "$package" --app "$app" \
    --profile "$target_profile" --receipt "$receipt_dir/$phase.json" "${extra[@]}"
}

if [[ "$format" == AppImage ]]; then export APPIMAGE_EXTRACT_AND_RUN=1; fi
install_package "$old_package"
run_phase seed "$old_package" "$(app_path "$old_package")" "$profile"
cp -a "$profile" "$backup"
(cd "$backup" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$receipt_dir/profile-inventory.txt"
sha256sum "$receipt_dir/profile-inventory.txt" > "$receipt_dir/profile-inventory.sha256"
test -s "$receipt_dir/profile-inventory.txt"

install_package "$new_package"
run_phase upgrade "$new_package" "$(app_path "$new_package")" "$profile"
if [[ "$format" == AppImage ]]; then
  (cd "$work_root" && env -u APPIMAGE_EXTRACT_AND_RUN "$new_package" --appimage-extract > /dev/null)
fi
run_phase journey "$new_package" "$(app_path "$new_package")" "$work_root/journey-profile"

mv "$profile" "$work_root/upgraded-profile"
cp -a "$backup" "$profile"
diff -qr "$backup" "$profile" > "$receipt_dir/profile-restore-diff.txt"
install_package "$old_package" rollback
run_phase rollback "$old_package" "$(app_path "$old_package")" "$profile"

node - "$receipt_dir" "$build_source_sha" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [dir, sourceSha] = process.argv.slice(2);
const phases = Object.fromEntries(['seed', 'upgrade', 'journey', 'rollback'].map(name =>
  [name, JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'))]));
if (Object.values(phases).some(phase => phase.status !== 'passed')) throw new Error('A Linux upgrade phase failed');
const [seed, upgrade, rollback] = [phases.seed, phases.upgrade, phases.rollback];
if (seed.project.checkpointSha256 !== upgrade.project.checkpointSha256 ||
    seed.project.checkpointSha256 !== rollback.project.checkpointSha256)
  throw new Error('The Graph Project checkpoint bytes changed');
const inventorySha256 = fs.readFileSync(path.join(dir, 'profile-inventory.sha256'), 'utf8').split(/\s+/)[0];
const summary = { schema: 'math3d/release20-linux-upgrade-qualification/v1', format: seed.format,
  buildSourceSha: sourceSha, oldPackageSha256: seed.packageSha256,
  newPackageSha256: upgrade.packageSha256, profileInventorySha256: inventorySha256,
  graphCheckpointSha256: seed.project.checkpointSha256,
  journeyProjectSha256: phases.journey.project.checkpointSha256,
  checks: { oldInstall: 'passed', seededGraphProject: 'passed', profileBackup: 'passed',
    upgradeOpen: 'passed', installedWorkerJourney: 'passed', journeyProjectColdReopen: 'passed',
    profileRestore: 'passed', oldPackageRollback: 'passed' }, status: 'passed' };
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`${seed.format}: upgrade and rollback passed`);
NODE
