# M3D20-13 — published 1.7 upgrade baseline

**Scope:** the published 1.7.0 installer and a clean Windows profile before any 2.0 candidate is installed. The exact 1.7→2.0 in-place upgrade and post-upgrade rollback remain in the [signed candidate gate](INSTALL_UPGRADE_GATE.md).

## Pinned input

The [published release](https://github.com/expert10000/Math3D/releases/tag/v1.7.0) supplies `Math3D-Setup-1.7.0.exe`, `SHA256SUMS.txt`, and `candidate-manifest.json`. Both metadata files name installer SHA-256 `eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db`; this is also the hard-pinned old installer identity in `scripts/release20-upgrade.ps1`. The [baseline workflow](../../../.github/workflows/release20-upgrade-baseline.yml) downloads all three assets and checks the downloaded installer bytes against both metadata files and the pinned digest before running it.

## Clean-runner procedure

`scripts/release20-upgrade-baseline.ps1` runs only on Windows, refuses an existing stable Math3D registration, and requires a new work root beneath the runner's temporary directory. It then:

1. Installs the published 1.7.0 bytes into the isolated work root and records the installed `Math3D.exe` hash. An old-toolchain NSIS failure is reported as a **1.7 baseline failure**.
2. Launches the installed app with a fresh profile. The existing upgrade acceptance test disables command preview overlays, creates a named *Upgrade Graph from v1.7.0* Project through My Graphs, and writes the exact local-storage checkpoint bytes and SHA-256 into `seed.json`.
3. Inventories each profile file by relative path, byte length, and SHA-256. It copies the whole profile into `profile-before-2.0` and requires the backup inventory digest to match the original.
4. Copies the pristine backup to a separate rollback profile and launches the installed 1.7.0 app against that profile. The test reopens the Graph Project and compares its checkpoint bytes and setting with the seed. The pristine backup is inventoried again to prove the rehearsal did not change it.

The workflow uploads the machine-readable baseline receipt, seed and rollback phase records, and the profile file inventory. The copy of the profile remains on the ephemeral runner; the uploaded records carry the synthetic Project bytes and every profile-file hash. No user profile is read or modified.

## Result and limit

The [first clean-runner attempt](https://github.com/expert10000/Math3D/actions/runs/43597317992) passed exact published bytes, 1.7 installation, Project seed, the 43-file profile backup, and a byte-identical rollback-profile copy. An additional attempt to reinstall 1.7 over itself hung at the 180-second installer limit, so that run failed before the rollback profile was opened. Same-version reinstall is not the future 2.0→1.7 rollback path; its failure is retained as a separate published-installer risk. The baseline runner now checks restoration with the already installed 1.7 app. The procedure cannot certify 2.0 data preservation, 2.0 installation, or rollback from an installed 2.0 candidate. Those checks remain required in `scripts/release20-upgrade.ps1` on one exact signed installer and candidate manifest.
