# Windows installed qualification harness — prepared, not executed

This harness waits for draft PR #61 to be completed and merged. It does not build or test a candidate from the current draft, qualify a moving `main`, inherit the accepted f7258881 source milestone, approve a release, or bypass Windows signing. Cloudflare is excluded.

The plan is `tests/windows-qualification/plan.json`; **WIN-INSTALL, WIN-UPGRADE and WIN-RECOVERY all start `missing`**. The tiny branch CI checks only the harness's provenance guards, fixture bytes and PowerShell/JavaScript syntax. A green harness check is not an installed-app acceptance result.

## Prepared isolated profile seed

`tests/windows-qualification/fixture/` contains two existing-format portable Project packages: a Mesh transfer study and the mixed-module freeze study. They contain committed Mesh selections, original document identities/hashes/replay, nonempty historical AnalysisResults and nine resource sidecars. The generator reuses existing Project, Mesh, Volume and Graph owners; there is no parallel document/profile system.

Fixture generation source is f725888199b35e93809c1b20f12c54afea0c2efc and is separately recorded from the future candidate. Regenerate with `node scripts/windows-qualification/prepare-fixture.cjs`. This creates fixture bytes, not Windows evidence.

The isolated profile is a **seed kit until execution**. On a disposable Windows runner, the installed app creates its own user-data directory through normal UI import/save. No LevelDB is copied and no localStorage value is synthesized. The runner cold-reopens both saved Projects and compares identity/hash/replay/committed selection, historical result/reference data and decoded sidecar bytes. Application-owned profile seeding and all Windows assertions remain missing until that actual run.

## Package input contract

A trusted build at the final PR61 merge commit must provide a candidate artifact with `candidate.json`, its exact NSIS installer, final executable and bundled worker. A trusted previous-version build provides `old.json` and corresponding files. The manual workflow verifies both build runs succeeded and their GitHub head commits equal the declared sources. If a builder checks out another source behind a different workflow head, this workflow refuses it; establish suitable trusted provenance rather than silently rebinding the package.

Create each manifest **on the trusted package build runner** after producing the final bytes:

```powershell
node scripts/windows-qualification/preflight.mjs manifest candidate.json $source expert10000/Math3D 2.0.0 $appId Math3D stable unsigned Math3D.Setup.2.0.0.exe win-unpacked/Math3D.exe win-unpacked/resources/python-worker/worker.exe
```

The generated manifest has schema `math3d.windows-qualification-package/v1`, exact repository/source, version, app identity/product/channel/signing state, NSIS type, installer/executable/worker SHA256 and byte counts, artifact-relative paths and separate installed-relative paths. Keep all referenced bytes inside the artifact tree. The actual installed executable and worker must match these hashes before and after the journeys. `unsigned` is a recorded test condition and grants no signing/release approval.

An old stable app and a Dev candidate are different products and **cannot** count as an in-place stable upgrade. App identity, product name and channel must match exactly. Supply an appropriate predecessor; do not weaken this check to obtain a green badge.

## Manual qualification after merge

Use `.github/workflows/windows-installed-qualification.yml` from the prepared harness branch (or after the harness itself is merged). It is manual-only and requires:

- `source_commit`: full actual PR61 merge SHA; the workflow independently checks PR61 is merged and equals it.
- Candidate `build_run_id` and `candidate_artifact` containing `candidate.json` and referenced bytes.
- `old_source_commit`, `old_build_run_id` and `old_artifact` containing `old.json` and referenced bytes.

The workflow installs harness dependencies only; it does not rebuild application source. It runs `run.ps1` in a fresh root under `RUNNER_TEMP`, refuses an existing root/default user profile, and uses separate install/profile directories for upgrade and fresh installation. It retains receipts even after failures. All test profiles and artifacts are disposable; use a GitHub Windows runner, not a personal installed app.

1. Install the real old version. Author and save a Graph and setting through UI. Close and back up the profile, retaining a per-file hash inventory.
2. Install the candidate into that same product/install root. Open the saved Graph and verify checkpoint bytes, identity and settings survived.
3. Install the candidate fresh in a separate test root. Import/save both prepared Projects through UI; cold-reopen each and compare identities/hashes, replay selections, results/references and actual resource bytes.
4. On that isolated profile, compute/save through the installed Mesh owner, observe actual bundled VTK output, then kill the real worker process and park its executable. Verify unavailable capabilities and retained saved data. Cold-launch the installed app offline and explicitly assert successful saved-Project workspace activation. Export and compare actual sidecars.
5. Restore exactly the same executable bytes in `finally`-protected code. Respect the real advertised five-minute restart circuit; never reset counters or mock time. Refresh capabilities through UI, assert a fresh PID/protocol/health, and retry the actual operation with matching output hashes. Historical references remain intact.

Computation uses the existing application operation test hook and delegates to the installed production owner; no pointer-computation claim. Save/open/export/refresh use UI. This prepares bundled Python/VTK recovery, not Windows Sage/WSL or every optional engine.

## Evidence and acceptance

`qualification.json` records candidate/old installer, installed executable/worker hashes and sizes, exact source, separate harness commit, merged PR61 SHA, run ID/attempt, individual journey states and failures. Driver receipts retain actual Project hashes, histories/selections, sidecar hashes/bytes, worker binary hash, PIDs, handshakes, backoff and real output hashes. Interrupted stages stay `missing`/`incomplete`; failures never become passes. No skipped, cancelled or absent journey satisfies `requireComplete`.

Run host-independent checks now:

```text
node --test tests/windows-qualification/provenance.test.mjs
node --check scripts/windows-qualification/installed-driver.mjs
```

Only the later real Windows execution can supply installer acceptance. Scientific milestone approval remains unchanged. Windows signing is still an independent release gate.
