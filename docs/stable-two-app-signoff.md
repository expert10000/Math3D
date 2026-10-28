# Stable Math3D ↔ Theory Lab release signoff

This signoff covers the actual stable Math3D NSIS identity and the Theory Lab
NSIS installer on a fresh Windows VM separate from the build VM. The test uses the **installed Theory
Lab UI** to calculate and save an SSH run, exports a `.qscene` through Scenes,
opens that bundle in the installed Math3D app, and follows **Open source run in
Theory Lab** back to the exact saved run. It compares the scene's source hash
with the saved result bytes and checks Lab's reopened-run message. No checkout
script produces the run or scene; the Math3D checkout only supplies the test
harness and builds the installer.

## Clean Windows VM procedure

Run [Windows Stable Two-App Signoff](../.github/workflows/windows-stable-two-app-signoff.yml)
with **Run workflow** on `main`. Its three `windows-latest` VMs:

1. Builds a complete `MATH3D_CHANNEL=stable` installer, including the frozen
   worker, web assets, and pinned scene examples.
2. Checks out Theory Lab, builds its pinned Python worker and full installer.
3. Preserve both installer files and `candidate-manifest.json` in the
   `two-app-stable-candidate` artifact for 90 days. The manifest pins package
   versions, source commits, installer names and SHA-256 values. The release
   owner should also retain a copy outside the expiring CI artifact.
4. On a **second, fresh VM**, download those exact files, compare both hashes
   and source identities with the manifest, then silently install both packages
   into new directories under `RUNNER_TEMP`.
5. Run `quantum-installed-ui-roundtrip.spec.ts`, which creates the SSH run and
   `.qscene` in the installed Lab UI and opens that exact run from installed
   Math3D. Python and Conda paths are removed from both app environments. Its
   profile and export directory are isolated and disposable.
6. Upload `stable-two-app-signoff.json` with package versions, commits,
   installer SHA-256 values, installed paths, run ID, result SHA-256, check
   outcomes, and any failure. A failed UI test also uploads its Playwright trace.
7. On a **third, fresh VM**, install the published v1.6.0 package, save a Graph
   Project and setting through its UI, install the exact candidate over the
   same directory and profile, then repeat the installed Lab → `.qscene` →
   Math3D handoff. Upload `stable-upgrade-two-app.json` with the migration,
   retained-state, and exact-run results. A clean-install pass does not replace
   this upgrade gate.

The local equivalent, after building both installers on a clean Windows VM and
installing Math3D's test dependencies, is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stable-two-app-signoff.ps1 `
  -TheoryLabRepo 'C:\path\to\theory-lab' `
  -Math3DInstaller 'C:\path\to\Math3D Setup 1.7.0-rc.2.exe' `
  -TheoryLabInstaller 'C:\path\to\Quantum-Hamiltonian-Lab-Setup-0.1.0.exe' `
  -CandidateManifest 'C:\path\to\candidate-manifest.json' `
  -InstallRoot (Join-Path $env:RUNNER_TEMP 'stable-two-app-signoff')
```

The install root must be new and inside `RUNNER_TEMP`. The script never removes
an existing installation. Review the JSON and trace before marking the release
as passed. A build or setup failure is recorded by the workflow as
`failed-before-signoff`; it is not a successful two-app result.

## 2026-10-28 stable release evidence

The first single-VM signoff below tested a stable-channel Math3D build whose
package version was still `1.5.0`. It does **not** certify the separately
published Math3D v1.6.0 installer or the new `1.7.0-rc.1` candidate. The
two-VM candidate gate above supplies the next release decision.

| Check | Result |
| --- | --- |
| Math3D stable candidate | 1.5.0; full NSIS package built locally after syncing `main` (`c349142f` plus the source-run copy change); 413,650,603 bytes; SHA-256 `4a8e0ef883560faece8b3083cc9ba275639a504e143b61a267c418504f9e68e0` |
| Theory Lab candidate | 0.1.0; full NSIS installer SHA-256 `cda0f63528fe01039a6f9fc57cc42fe121c0eeebb6821ce33e7dc536d1a89f1f` |
| Installed-app UI-only round trip on host | Passed: the packaged Lab created/saved an SSH run, exported `.qscene`, and packaged Math3D reopened the exact hash-verified run (1/1, 16.2 s). This run used the separate Math3D Dev product identity. |
| Current stable package rehearsal on host | Passed against `release/win-unpacked/Math3D.exe` and the installed Lab with Python/Conda removed from the apps' `PATH` (1/1, 17.2 s); saved run `run-0a3be6381d5949518a1aab1c81e386f1`, result SHA-256 `a55b2d10e38a6e53e9e5c12f0d924978929838a83a5ee5e5c4463ed5acce743d`. This checks current stable package bytes, not the installer transaction or a clean VM. |
| Local Windows Sandbox clean VM | **Blocked**: the guest lost its connection during startup twice, including with vGPU disabled. Neither installer ran inside that guest. |
| Fresh Windows runner stable signoff | **Passed** in [run 40671123105](https://github.com/expert10000/Math3D/actions/runs/40671123105). Artifact `stable-two-app-signoff.json` reports `status: passed`, install passed, installed UI round trip passed, and no failure. |

The clean runner built and installed Math3D **1.5.0 stable** from
`045ed7f414b95a251aa4b355f5912de055af4644` (installer SHA-256
`570d822caa79f4165edd99809e7c861c44c966c09e5f837c6575debdad6a6d79`)
and Theory Lab **0.1.0** from
`3c883fa4a69da2ee9f59b1425ac181094a25c276` (installer SHA-256
`d744b5f738df4fef3c06b4a61b0324e7218f4f3098dfceb2b42e7e13d6ba166e`).
The installed Lab UI created and saved SSH run
`run-526b8932433b4ba38fcc715064f39608`; its result SHA-256 was
`dfb8f212310678cb4c31ec6c0b1f886722c3131785a54aecfd36daaf1754f636`.
Scenes exported `run-526b8932433b4ba38fcc715064f39608.qscene` with matching
provenance. Installed Math3D opened the selected run in installed Lab, which
verified the exact saved result. This completes the stable two-app release
gate for those 1.5.0 installer builds. The failed local Sandbox launch is recorded
above; it did not affect the independent clean-runner result.

## 1.7.0-rc.1 two-VM candidate gate

**Passed, not published.** [Workflow run 40674889325](https://github.com/expert10000/Math3D/actions/runs/40674889325)
built both installers on one Windows VM, uploaded the exact files and manifest
as `two-app-stable-candidate`, and installed those downloaded files on a second
fresh Windows VM. The second VM reported `status: passed`,
`candidateBytes: passed`, `install: passed`, and
`installedUiRoundtrip: passed`, with `failure: null`.

| Candidate file | Version and source | SHA-256 |
| --- | --- | --- |
| `Math3D Setup 1.7.0-rc.1.exe` | Stable product identity; Math3D `1.7.0-rc.1`; commit `0a2cdb3557eee1d8b2b697fd788bfe18f46f199b` | `08b720dc5b83d70b36d7ea953fb4466742bbd3a8e599666b51613696fb6d6de8` |
| `Quantum-Hamiltonian-Lab-Setup-0.1.0.exe` | Theory Lab `0.1.0`; commit `3c883fa4a69da2ee9f59b1425ac181094a25c276` | `0f1b251dedec15ee72e5511803d50884565e5a04592e9a9ca19962fff8073407` |

The downloaded candidate manifest SHA-256 was
`25c601c4363d5c893959f624f65c963484f41939496309edad4dd19aed0ca0ec`.
A second local copy of both installer files, the manifest, and the signoff JSON
is retained at
`C:\Users\janko\OneDrive\Dokumenty\Math3D-release-candidates\1.7.0-rc.1\run-40674889325`;
both local installer hashes match the manifest. The CI artifact expires after
90 days, so the local archive should be kept for any later release decision.

The installed Lab UI created and saved SSH run
`run-f7f3e4909b584b699845377cd72c8898`, whose result SHA-256 was
`63c2e2863ee3c09b15a24a5e8a90d9609e975ee81e451354977658ff1e6ee1ed`.
It exported `run-f7f3e4909b584b699845377cd72c8898.qscene` with matching
provenance. Installed Math3D reopened that exact verified run in installed Lab.
The test used neither a checkout fixture producer nor system Python/Conda paths
in either app. No failure was reported in the passing run. The earlier local
Sandbox connection failure remains recorded above and was not used as evidence
for this candidate.

## Published v1.6.0 to 1.7.0-rc.1 upgrade gate (2026-10-28)

**Failed; the RC is not approved as an in-place upgrade.** The
[Windows Stable Upgrade Two-App Signoff](../.github/workflows/windows-stable-upgrade-two-app.yml)
workflow uses a fresh Windows runner, verifies installer SHA-256 values, and
keeps the Math3D install directory and profile fixed across versions. It uses
the published `Math3D-Setup-1.6.0.exe` (SHA-256
`5a785909352816e80995f203b1bb28263ed4f9423abf76664c5eec4813c36341`)
and the exact archived `1.7.0-rc.1` candidate files listed above.

In [run 40679888053](https://github.com/expert10000/Math3D/actions/runs/40679888053),
v1.6.0 installed and its UI saved a Graph Project and a setting. The RC
installer then remained open; the diagnostic run was cancelled after more than
15 minutes. In [run 40682887301](https://github.com/expert10000/Math3D/actions/runs/40682887301),
the same v1.6.0 UI seed passed again, and the RC installer was stopped after a
bounded 180-second wait. The saved Graph Project was
`Upgrade Graph from v1.6.0`; the command-preview overlay setting was off.
There was no Math3D app process left running before the upgrade installer.

The next fresh-runner [uninstaller probe 40684191144](https://github.com/expert10000/Math3D/actions/runs/40684191144)
installed the published v1.6.0 package into a disposable directory and invoked
its installed uninstaller with the silent, keep-app-data flags used during an
NSIS upgrade. That uninstaller exited with **code 2**. This establishes a
failure in the published package's uninstall path; the precise internal cause
of code 2 has not yet been proven. The recorded outcome is `status: failed`,
not a passed upgrade. Project/settings retention after upgrading and the
installed Lab → `.qscene` → Math3D handoff were **not reached**. The earlier
clean-install candidate signoff remains valid for clean installs only.
The three failed-run JSON records are also retained in the local candidate
archive's `upgrade-evidence` subfolder.

Before releasing an upgrade over v1.6.0, repair the migration path in a **new
candidate**, then run this gate against its exact new installer bytes. Preserve
the old Project and settings during that repair. The final 1.7.0 installer files
must separately pass the same upgrade and two-app tests; an RC hash cannot
certify different final binaries. The local Windows Sandbox was not used for
this gate because its guest connection failed before installers ran.

## 1.7.0-rc.2 repaired migration candidate (2026-10-28)

**Passed as a candidate; not published.** [Run 40686567576](https://github.com/expert10000/Math3D/actions/runs/40686567576)
built the full stable-channel rc.2 Math3D installer and the paired Theory Lab
installer on one Windows VM. A second fresh VM passed the clean installed-app
handoff; a third fresh VM passed the published v1.6.0 → rc.2 upgrade gate using
the **same archived installer bytes**.

| Exact candidate file | Version and source | SHA-256 |
| --- | --- | --- |
| `Math3D Setup 1.7.0-rc.2.exe` | Stable product identity; Math3D `1.7.0-rc.2`; commit `6ffa79ecae9ea1627bce633ee7c648bae0f00514` | `836233788a302f8a345812d99280b162bf6f5bda7e470c19779ae30b952c2b27` |
| `Quantum-Hamiltonian-Lab-Setup-0.1.0.exe` | Theory Lab `0.1.0`; commit `3c883fa4a69da2ee9f59b1425ac181094a25c276` | `30b6b47eaf0ecef4c15d2fcae8cf1d879d34ccd00b29d4ecd0299f2cc5adb412` |

The candidate manifest SHA-256 is
`f44d37fbfabf3d4abf13352564270fe9a4e13ef2f4f14fb5104cbe8763d89210`.
The installers, manifest, and both signoff JSON files are retained at
`C:\Users\janko\OneDrive\Dokumenty\Math3D-release-candidates\1.7.0-rc.2\run-40686567576`;
the downloaded installer hashes match the manifest.

The upgrade VM used the published v1.6.0 installer with SHA-256
`5a785909352816e80995f203b1bb28263ed4f9423abf76664c5eec4813c36341`.
The v1.6.0 UI saved `Upgrade Graph from v1.6.0` and turned off command-preview
overlays. After installing rc.2 into that same directory and profile, the UI
reopened the Project and found the setting still off. The installed migration
marker reported `registered-v1.6.0-overlay`. The installed Lab UI then saved
run `run-a96c7eafc7bc43d7b3445f2c73771571`, exported its `.qscene` with
result SHA-256
`d377d6b6a36b4126ebbbf19b962726725e7b5ee6ded5f333ec45a13503af7bd0`,
and installed Math3D reopened that exact verified run. The clean-install VM
also passed its independent installed UI round trip.

The repair applies only to a registered **per-user v1.6.0 installation at the
same destination**. It bypasses that version's failing uninstall command and
overlays the new package while leaving the user profile outside the install
directory intact. Per-machine, changed-directory, and other-version upgrades
are outside this acceptance result. The final 1.7.0 installers must be built,
hashed, and run through **both fresh-VM gates using those exact final files**
before publication; the rc.2 hash cannot certify them.
