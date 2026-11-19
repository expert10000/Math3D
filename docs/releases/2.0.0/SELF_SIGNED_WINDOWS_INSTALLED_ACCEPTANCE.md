# Self-signed Windows installed acceptance

**Status (2026-11-19):** Exact local package preflight passed. Installed acceptance is pending a clean Windows VM or disposable runner. This track does not approve a GA release.

## Pinned inputs

| Input | Identity |
| --- | --- |
| Candidate source | `300493c92c42a1f3b611bf09fef0d70f529a333e` (PR #114) |
| Candidate installer | `Math3D-Setup-2.0.0-selfsigned-prerelease.exe`, SHA-256 `3c749ca2a75f173536e4a94df0a4afe0bcb1d9c07c269c2b343f694e24654396` |
| Signer | Self-signed, untrusted by default; thumbprint `38F403CE0B42720EE5AFD61422D6A2C22EB733D9` |
| Published 1.7 rollback installer | `Math3D-Setup-1.7.0.exe`, SHA-256 `eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db` |

The candidate package, `prerelease-manifest.json`, `freeze-manifest.json`, and public `.cer` are staged locally under `C:\Users\janko\.math3d\prerelease-artifacts\2.0.0-300493c9`. The published 1.7 installer is at the [v1.7.0 release](https://github.com/expert10000/Math3D/releases/tag/v1.7.0). Transfer only the candidate package and public receipts into the VM. The private PFX and password stay outside the repository and VM and must never be uploaded. Keep the installer filename and file bytes intact.

## Run on two clean Windows snapshots

Use two separate fresh Windows 10/11 VMs or disposable Windows runners, one for `Fresh` and one for `Upgrade`. Each must begin without a Math3D uninstall entry in HKCU or either HKLM uninstall view; the runner refuses any existing entry before starting an installer. Do not run it on the local host, which has stable Math3D 1.4.9 registered. Use a dedicated VM user profile and a new evidence directory below that VM's `%TEMP%` for each mode.

Install PowerShell 7, Node 24 and 7-Zip in the VM, clone this review branch, and run `npm ci` in the checkout. Stage the exact candidate package and public manifests in one VM folder. Stage the exact published 1.7 installer together with its release `candidate-manifest.json` and `SHA256SUMS.txt` in another folder for `Upgrade`. Run these commands in `pwsh`:

```powershell
$repo = 'C:\qualification\Math3D'
$candidate = 'C:\qualification\candidate'
$old = 'C:\qualification\published-1.7\Math3D-Setup-1.7.0.exe'
& "$repo\scripts\release20-selfsigned-installed.ps1" -Mode Fresh -ArtifactRoot $candidate -EvidenceRoot "$env:TEMP\math3d-selfsigned-fresh"
# Revert to a clean VM snapshot before running the second mode.
& "$repo\scripts\release20-selfsigned-installed.ps1" -Mode Upgrade -ArtifactRoot $candidate -OldInstaller $old -EvidenceRoot "$env:TEMP\math3d-selfsigned-upgrade"
```

If a Sandbox mapped checkout cannot access Git metadata, pass its reviewed 40-character PR head with `-HarnessCommit` in both commands. The receipt then records that commit and the runner script SHA-256; ancestry must be checked in the host checkout before launching the Sandbox. A normal clone checks ancestry itself.

When a stable SageMath 10.10 HTTPS endpoint is available from the VM, supply it through the process environment variable `MATH3D_RELEASE20_SAGE_SERVICE_URL`, sourced from a CI secret or equivalent VM secret store. The runner never writes that URL to its receipt. It first requires the live ideal and polynomial cusp/smooth oracle, then executes all five test specs that cover the four advertised journeys and checks their exact Playwright receipt. Without the variable it records the Sage journeys as blocked and marks the fresh receipt `partial`. Do not put the URL or any path token on a command line or commit it to the repository.

The runner verifies the fixed installer SHA-256, freeze receipt, signer, timestamp, current self-signed code-signing chain, and pinned NSIS component before installation. It verifies installed `Math3D.exe` and frozen `worker.exe` hashes and signatures. `Fresh` runs the frozen worker protocol smoke and first-use tests with Python and Conda removed from `PATH`, Project cold reopen, hard-exit Project/sidecar recovery, Volume context-loss and cancellation, four-pane Study restart, and the installed worker loss/reconnect/retry driver with isolated Project sidecars. The nonmemory test receipt uses `build-identity.json` extracted from the installed `app.asar` and verifies its source commit. `Upgrade` installs the published 1.7 asset, seeds a real Graph Project and setting, backs up and inventories its profile, installs 2.0 into the same directory, checks retained bytes and setting, then reinstalls 1.7 against a restored copy of the original profile and reopens the exact original bytes.

Retain both JSON receipts and their phase files plus Playwright traces from `test-results/playwright` if a test fails. The receipts record the source commit, harness commit, installer hash, self-signed status, checks, and failures. A failed or missing phase is not a pass. Because this package is untrusted by default, `UnknownError` from Windows Authenticode is allowed only after the verifier independently checks the exact signer, signature integrity, timestamp, and a custom-root chain; the trusted publisher GA checks are unchanged.

## Open gates

The four advertised installed Sage journeys require a stable reachable SageMath 10.10 service endpoint. None was available when this route was prepared, so their current status is **blocked**, not passed or skipped as success. The runner marks `installedJourneysQualified` true only if the optional live Sage phase passes; it never marks `gaApproved` true. The final merged source commit may differ from the pinned PR #114 source; any later release candidate requires its own exact-file installed receipts. Publicly trusted Windows signing, installed Gallery captures, final source freeze and CI, release audit, RC2 and written GA sign-off remain separate publication gates. Reference-host and installed memory limits are deferred to the 2.5+ track; the runner's Volume and Study checks are the remaining nonmemory checks in this slice.

## Current execution evidence

The local 2.0 installer SHA-256 equals the pinned value, and its prerelease manifest names the same source commit and signer. The local host's HKCU uninstall entry is Math3D 1.4.9. Windows Sandbox is installed: a small mapped-folder probe reached its clean desktop and wrote a marker. The larger configurations needed to map the checkout and package, including a single staged archive folder retried with 16 GiB of VM memory, lost the VM connection before their startup diagnostics wrote a receipt. They did not execute the installer or any installed test. A separate clean VM or disposable Windows runner is still required for `fresh-receipt.json` and `upgrade-receipt.json`. The live Sage route proposed in PR #118 is also unprovisioned, so no Sage oracle receipt exists.
