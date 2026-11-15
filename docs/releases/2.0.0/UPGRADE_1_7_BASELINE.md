# M3D20-13 — published 1.7 upgrade baseline

**Scope:** the published 1.7.0 installer and a clean Windows profile before any 2.0 candidate is installed. The exact 1.7→2.0 in-place upgrade and post-upgrade rollback remain in the [signed candidate gate](INSTALL_UPGRADE_GATE.md).

## Pinned input

The [published release](https://github.com/expert10000/Math3D/releases/tag/v1.7.0) supplies `Math3D-Setup-1.7.0.exe`, `SHA256SUMS.txt`, and `candidate-manifest.json`. Both metadata files name installer SHA-256 `eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db`; this is also the hard-pinned old installer identity in `scripts/release20-upgrade.ps1`. The [baseline workflow](../../../.github/workflows/release20-upgrade-baseline.yml) downloads all three assets and checks the downloaded installer bytes against both metadata files and the pinned digest before running it.

## Clean-runner procedure

`scripts/release20-upgrade-baseline.ps1` runs only on Windows, refuses an existing stable Math3D registration, and requires a new work root beneath the runner's temporary directory. It then:

1. Installs the published 1.7.0 bytes into the isolated work root and records the installed `Math3D.exe` hash. An old-toolchain NSIS failure is reported as a **1.7 baseline failure**.
2. Launches the installed app with a fresh profile. The upgrade acceptance test disables command preview overlays, authors a parabola with expression `x^2 + 1`, creates a named *Upgrade Graph from v1.7.0* Project through My Graphs, and writes the exact local-storage checkpoint bytes and SHA-256 into `seed.json`.
3. Inventories each profile file by relative path, byte length, and SHA-256. It copies the whole profile into `profile-before-2.0` and requires the backup inventory digest to match the original.
4. Copies the pristine backup to a separate rollback profile and launches the installed 1.7.0 app against that profile. The test reopens the Graph Project and compares its checkpoint bytes and setting with the seed. The pristine backup is inventoried again to prove the rehearsal did not change it.

The workflow uploads the machine-readable baseline receipt, seed and rollback phase records, and the profile file inventory. The copy of the profile remains on the ephemeral runner; the uploaded records carry the synthetic Project bytes and every profile-file hash. No user profile is read or modified.

## Result and limit

The [clean Windows 2022 run](https://github.com/expert10000/Math3D/actions/runs/43598630823) passed all seven baseline checks on source commit `f39b21a3e3b86f316101dacce02e9c573cd1aa9a`. The [receipt](evidence/m3d20-13-baseline-43598630823/receipt.json), [seed bytes](evidence/m3d20-13-baseline-43598630823/seed.json), [rollback reopen bytes](evidence/m3d20-13-baseline-43598630823/rollback.json), and [43-file inventory](evidence/m3d20-13-baseline-43598630823/profile-inventory.json) are retained in the release evidence tree as well as the workflow artifact. The authored Graph checkpoint SHA-256 is `4b0d7477f699e37e1f66e63d8d05e279d7813d1b021630277e4daf81627d99d6`; the whole-profile inventory digest is `a6b04323c84785f75a03a9c8516b35672c90b3ebc1a35f5a52e0a16908c31b1e`. An independent review recalculated both hashes, confirmed one `x^2 + 1` Graph object, and compared seed and rollback checkpoint bytes exactly.

The [first clean-runner attempt](https://github.com/expert10000/Math3D/actions/runs/43597317992) passed exact published bytes, 1.7 installation, Project seed, the 43-file profile backup, and a byte-identical rollback-profile copy. An additional attempt to reinstall 1.7 over itself hung at the 180-second installer limit, so that run failed before the rollback profile was opened. Same-version reinstall is not the future 2.0→1.7 rollback path; its timeout is retained as a separate published-installer risk. The baseline runner checks restoration with the already installed 1.7 app.

This procedure cannot certify 2.0 data preservation, 2.0 installation, or rollback from an installed 2.0 candidate. Those checks remain required in `scripts/release20-upgrade.ps1` on one exact signed installer and candidate manifest.

## Unsigned Dev overlay rehearsal

Dispatch [Windows Unsigned Installer Smoke](../../../.github/workflows/windows-source-installer-smoke.yml) with `run_upgrade_rehearsal=true` to run `scripts/release20-unsigned-dev-upgrade.ps1`. On a clean Windows runner it checks the same published 1.7 installer against both release metadata files and the pinned digest, installs 1.7, authors the Graph Project and setting, and inventories a byte-identical profile backup. It installs the unsigned 2.0 Dev package into the **same application directory**, then launches `Math3D Dev.exe` with the 1.7 profile and compares the Project checkpoint bytes and setting exactly. Finally it copies the pristine profile backup and reopens it with a preserved copy of the installed 1.7 application. The artifact includes a separate unsigned receipt and the seed, verify, rollback, and profile inventory records.

The Dev package has a different app ID and executable name from stable Math3D. This same-directory overlay can expose profile migration and file coexistence defects, but it is not a stable-identity in-place upgrade or an installer rollback. The signed candidate workflow keeps its own strict manifest, signature, same-identity install, upgrade, and rollback checks.

The [clean Windows rehearsal 43654016096](https://github.com/expert10000/Math3D/actions/runs/43654016096) passed all nine checks on source commit `00af8a8f99474e6632c681b3da44dd4d5832c75f`. Its unsigned Dev installer SHA-256 is `459bf0b13a9000f7b03df4a5fb9f6a9b3eaa2dd2135604e00ef8bfee85aad3ce`. The [receipt](evidence/m3d20-13-unsigned-dev-43654016096/receipt.json), [1.7 seed](evidence/m3d20-13-unsigned-dev-43654016096/seed.json), [2.0 Dev verification](evidence/m3d20-13-unsigned-dev-43654016096/verify.json), [restored 1.7 reopen](evidence/m3d20-13-unsigned-dev-43654016096/rollback.json), and [43-file profile inventory](evidence/m3d20-13-unsigned-dev-43654016096/profile-inventory.json) are retained. An independent comparison found identical Project checkpoint bytes in all three phase records, recomputed their SHA-256 as `bc75156e05d6adc680ad3b01fd26f74d7780976a17fc3b143339f3997ead3207`, and matched the profile inventory digest in the receipt. The setting stayed off. The signed stable-identity upgrade and installer rollback remain open.
