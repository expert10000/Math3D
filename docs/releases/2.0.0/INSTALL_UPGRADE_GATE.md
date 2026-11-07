# M3D20-13 installation and upgrade gates

These gates are for the **exact signed 2.0.0 candidate**, not a source checkout or a renamed 1.7 installer. The current repository version is 1.7.0, so the 2.0 installer and upgrade gates remain pending until a 2.0 candidate manifest and artifacts exist.

## Fresh Windows installation (13b)

On a clean Windows VM, use `scripts/release20-fresh-install.ps1 -InstallerPath <exact installer> -CandidateManifest <manifest>`. The manifest must declare stable version 2.0.0, a 40-character source commit, the installer filename, and its SHA-256 hash. The runner refuses an existing stable Math3D registration or install directory, refuses an invalid Authenticode signature, installs under a fresh temporary root, checks bundled app/worker/web resources, runs worker protocol smoke with Python/Conda removed from `PATH`, then launches the installed app with an isolated profile. Its UI test opens the built-in Minimal Surface Study, checks Graph/Curve/Surface documents, saved derivative evidence, lineage and Notes, closes the app, and reopens the exact Project from its library. A JSON evidence file records each passed check and the installer identity. Failure leaves the installation for investigation; the runner does not remove pre-existing user files.

The same first-use UI test can run against the source build with `npx playwright test tests/e2e/release20-first-use-study.spec.ts --reporter=list`. That check is useful while developing the gate but does not count as installed-candidate signoff.

## Upgrade (13c)

Pending an exact signed 2.0.0 candidate and the published v1.7.0 installer. The upgrade gate must preserve the original Project bytes and setting, verify the candidate in place, and keep a recoverable original. A migration preview is not authorization to rewrite the old profile.

## Evidence rule

Record the candidate commit, installer hash and signature, run environment, old installer hash for upgrades, and separate results for byte identity, install, worker, UI, data preservation and rollback. A missing artifact or skipped test cannot be reported as passed.
