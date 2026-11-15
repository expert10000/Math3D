# TOP05-E8 — Genuine installed Windows acceptance

**Status (2026-11-15): TEST/HARNESS AUTHORED, EXECUTION MISSING. No release approval.**

## Provenance boundary

Source-built Windows [TOP-05 run 43769930920](https://github.com/expert10000/Math3D/actions/runs/43769930920) verified required Python/VTK startup, typecheck/core build, 13/13 mathematical/persistence unit tests and 5/5 native Electron journeys, including source revision → stale Mesh snapshot → explicit refresh. This run is **not** evidence that an NSIS installer was installed or upgraded, that signed bytes match a release, or that an installed application's user profile survived an upgrade.

No exact current and prior installer artifacts with independently checked SHA-256 hashes, existing Project profile fixture, or installed executable can be verified from the available TOP-05 CI artifacts. Therefore installed acceptance is **MISSING**, not PASS, and TOP-05 release signoff is **WITHHELD**.

## Implemented isolated Windows evidence paths

- `.github/workflows/topology-installed-e8.yml`: manually triggered, Windows 2022 GitHub runner, requires previous and target installer *run IDs*, artifact names, exact .exe basenames, independently provided 64-digit SHA-256 values, and an existing-profile fixture artifact. Downloads those exact artifacts. Does not guess filenames, versions or hashes and does not run on an ordinary user Windows installation.
- `scripts/top05-windows-installed-e8.ps1`: refuses to run outside ephemeral GitHub Actions; fails closed on unexpected installer hashes, non-valid Authenticode signatures, missing native files, same installed version/unchanged executable, missing Python-worker protocol, unexpected profile-file mutation, or nonzero Playwright exit. Installs old and then new genuine NSIS executables **in place** into an isolated runner directory; records SHA-256 and ProductVersion of both actual installed .exe files, along with the independent source commits for both installer runs, installed frozen worker identity, and retained fixture file digests. Never uses the unpacked Electron directory as an installed app.
- `tests/e2e/topology-installed-runtime-recovery.spec.ts`: launches the *installed executable*, injects a deliberately nonexistent Python command to withhold Mesh operations (without changing application readiness gates), saves a Torus `.math3d-topology` through actual IPC to disk, shuts down the Electron process, restarts without fault injection on the same isolated profile, verifies genuine worker readiness and reopened file's exact source/canonical UI hashes and serialized SHA-256/identity.
- Existing native `TOP-05 native cold reopen` test also runs against `MATH3D_PACKAGED_APP_EXE` and compares v3 replay identity, source and canonical hashes after process cold reopen.

The GUI OS file picker is deterministically substituted within Electron tests, **not** the application's IPC file read/write implementation. Installed app recovery remains test-authored until a genuine installed binary passes.

## Strict acceptance matrix

| Gate | Required evidence | Current disposition |
| --- | --- | --- |
| E8-01 Installer identity | Previous and target NSIS bytes, exact SHA-256, validated signatures, provenance/run IDs | MISSING |
| E8-02 Actual clean install | Prior installed executable hash/version and frozen worker, from isolated NSIS installation | MISSING |
| E8-03 Upgrade | In-place target NSIS install, distinct version and executable bytes, retained previous profile fixture hashes | MISSING |
| E8-04 Installed file cold reopen | Installed Electron process save→close→relaunch→load, v3 replay and structural/canonical hashes | MISSING |
| E8-05 Runtime-loss/recovery | Installed worker unavailable→execution guarded→restart healthy→reopen and reverify | MISSING |
| E8-06 Existing Project replay | Existing prior-version Project ID, selections, results, sidecars verified **in app** after upgrade | MISSING (file hash preservation alone insufficient) |
| E8-07 Portable import/export and missing bytes | Cross-version portable Project export/import, missing-artifact withheld/recovery, source/frame refusals | MISSING |
| E8-08 Signed release certification | Signatures for installer/app/worker and approvals recorded in Integration Lab | MISSING |

A successful isolated harness would prove E8-01 through E8-05 **for the exact binaries and fixture**, with E8-06 through E8-08 still pending independent interactive acceptance. It cannot promote TOP-05 or release 2.0 to approved status by itself. Unsigned diagnostics, if deliberately enabled outside the provided workflow, cannot count toward release approval.

## Running the manual workflow (only with real artifacts)

Use **Actions → TOP-05 Installed Windows E8 (manual artifact qualification) → Run workflow** after this workflow exists on the default branch, with prior and target installer provenance and the retained-profile fixture. Supply the independently computed SHA-256 of each downloaded installer and its independently checked exact source commit SHA. A dedicated GitHub runner performs the install and attached Playwright checks, then uploads `top05-installed-e8-evidence`, including `qualification.json`, exact versions/hashes and test reports.

**Do not dispatch with guessed artifact IDs, substitute source-built executable output, or treat successful installer download as installed-app qualification.** Release signing credentials and private user profiles are never requested in chat or placed in repository files.

## Next release gate

Obtain approved prior and target installer artifact run IDs/names and independently checked SHA-256 values, plus a synthetic/non-sensitive prior-version Project profile fixture with selections, results and sidecars. Run the isolated Windows E8 workflow; review actual install and recovery evidence. Finish E8-06/E8-08 against the installed program and Integration Lab before authorizing release or marking TOP-05 closed.
