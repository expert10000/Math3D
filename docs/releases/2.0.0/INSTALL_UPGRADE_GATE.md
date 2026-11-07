# M3D20-13 installation and upgrade gates

These gates are for the **exact signed 2.0.0 candidate**, not a source checkout or a renamed 1.7 installer. The current repository version is 1.7.0, so the 2.0 installer and upgrade gates remain pending until a 2.0 candidate manifest and artifacts exist.

## Fresh Windows installation (13b)

On a clean Windows VM, use `scripts/release20-fresh-install.ps1 -InstallerPath <exact installer> -CandidateManifest <manifest>`. The manifest must declare stable version 2.0.0, a 40-character source commit, the installer filename, and its SHA-256 hash. The runner refuses an existing stable Math3D registration or install directory, refuses an invalid Authenticode signature, installs under a fresh temporary root, checks bundled app/worker/web resources, runs worker protocol smoke with Python/Conda removed from `PATH`, then launches the installed app with an isolated profile. Its UI test opens the built-in Minimal Surface Study, checks Graph/Curve/Surface documents, saved derivative evidence, lineage and Notes, closes the app, and reopens the exact Project from its library. A JSON evidence file records each passed check and the installer identity. Failure leaves the installation for investigation; the runner does not remove pre-existing user files.

The same first-use UI test can run against the source build with `npx playwright test tests/e2e/release20-first-use-study.spec.ts --reporter=list`. That check is useful while developing the gate but does not count as installed-candidate signoff.

## Upgrade (13c)

On a clean Windows VM, download the [published v1.7.0 installer](https://github.com/expert10000/Math3D/releases/download/v1.7.0/Math3D-Setup-1.7.0.exe) and run `scripts/release20-upgrade.ps1 -OldInstaller <Math3D-Setup-1.7.0.exe> -CandidateInstaller <Math3D-Setup-2.0.0.exe> -CandidateManifest <manifest>`. The runner accepts the old installer only when its SHA-256 is `eacffc903e988a15636f556b36d12621b9918f4cec69e5c8b19e7daa512222db`. It verifies the exact signed stable 2.0.0 candidate against the manifest before installing either app.

The 1.7 phase creates a Graph Project using the published app's My Graphs interface and disables command preview overlays. It records the exact saved Graph workspace bytes and a SHA-256 digest. The runner copies the original profile to `profile-before-2.0`, installs 2.0 over the same application directory, then launches 2.0 against the same profile. The 2.0 phase checks the setting, compares the original Graph workspace bytes, and reopens the saved Project through My Graphs. JSON evidence records both versions, hashes, phase results, backup path, and any failure. Failure leaves the work root and backup in place for inspection. A skipped UI test cannot pass because the runner requires each phase's evidence file.

This gate is ready to execute but remains **pending** an exact signed 2.0.0 candidate. It does not claim that a 1.7 Graph Project has already survived a 2.0 upgrade.

## Evidence rule

Record the candidate commit, installer hash and signature, old installer hash for upgrades, and separate results for byte identity, install, worker, UI, data preservation and backup. A missing artifact or skipped test cannot be reported as passed.
