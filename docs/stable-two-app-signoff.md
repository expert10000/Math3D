# Stable Math3D ↔ Theory Lab release signoff

This signoff covers the actual stable Math3D NSIS identity and the Theory Lab
NSIS installer on a fresh Windows runner. The test uses the **installed Theory
Lab UI** to calculate and save an SSH run, exports a `.qscene` through Scenes,
opens that bundle in the installed Math3D app, and follows **Open source run in
Theory Lab** back to the exact saved run. It compares the scene's source hash
with the saved result bytes and checks Lab's reopened-run message. No checkout
script produces the run or scene; the Math3D checkout only supplies the test
harness and builds the installer.

## Clean Windows VM procedure

Run [Windows Stable Two-App Signoff](../.github/workflows/windows-stable-two-app-signoff.yml)
with **Run workflow** on `main`. Its fresh `windows-latest` runner:

1. Builds a complete `MATH3D_CHANNEL=stable` installer, including the frozen
   worker, web assets, and pinned scene examples.
2. Checks out Theory Lab, builds its pinned Python worker and full installer.
3. Silently installs both packages into new directories under `RUNNER_TEMP`.
4. Runs `quantum-installed-ui-roundtrip.spec.ts`, which creates the SSH run and
   `.qscene` in the installed Lab UI and opens that exact run from installed
   Math3D. Python and Conda paths are removed from both app environments. Its
   profile and export directory are isolated and disposable.
5. Uploads `stable-two-app-signoff.json` with package versions, commits,
   installer SHA-256 values, installed paths, run ID, result SHA-256, check
   outcomes, and any failure. A failed UI test also uploads its Playwright trace.

The local equivalent, after building both installers on a clean Windows VM and
installing Math3D's test dependencies, is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stable-two-app-signoff.ps1 `
  -TheoryLabRepo 'C:\path\to\theory-lab' `
  -Math3DInstaller 'C:\path\to\Math3D Setup 1.5.0.exe' `
  -TheoryLabInstaller 'C:\path\to\Quantum-Hamiltonian-Lab-Setup-0.1.0.exe' `
  -InstallRoot (Join-Path $env:RUNNER_TEMP 'stable-two-app-signoff')
```

The install root must be new and inside `RUNNER_TEMP`. The script never removes
an existing installation. Review the JSON and trace before marking the release
as passed. A build or setup failure is recorded by the workflow as
`failed-before-signoff`; it is not a successful two-app result.

## 2026-10-28 stable release evidence

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
gate for these installer builds. The failed local Sandbox launch is recorded
above; it did not affect the independent clean-runner result.
