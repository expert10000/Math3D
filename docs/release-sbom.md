# Release SBOM generation

GPL-P03 generates CycloneDX 1.6 JSON and a license summary for each public
desktop release. Windows and Linux jobs run `scripts/generate-release-sbom.mjs`
after packaging and before publishing. The production Android AAB job generates
a Gradle inventory with `compliance/cyclonedx-android.init.gradle`, then merges
it with the mobile npm lockfile through `scripts/generate-android-release-sbom.mjs`.

The desktop inventory records the resolved root and renderer npm dependencies,
the frozen Python requirements and runtime dependency closure, Electron,
corresponding native source archives, and every file in the unpacked app with a
SHA-256 digest and owner. Recognized GMP, MPFR, CGAL, pygalmesh, VTK, NumPy,
SciPy, and CPython files have specific owners. The generator fails when a
required packaged resource is absent, a package license is unknown, a Python
pin disagrees with the installed version, a native module has no lockfile
owner, or a packaged file has no owner.

The Android inventory records Gradle's resolved `releaseRuntimeClasspath`,
production mobile npm dependencies, and the verified signed AAB digest. Expo's
generated local Maven POMs omit some licenses. The merger accepts only the
five named Expo/React Native source packages whose installed npm metadata
matches the Gradle version, plus Math3D's own app module. A new missing license
fails the release.

Run `npm run test:release:sbom` for fixture checks. Desktop release jobs use the
installed frozen-worker Python environment via `MATH3D_PYTHON`; a local test
must use the exact pinned requirements before its output can be release
evidence. `npm run verify:license-compliance` checks that all three release
paths retain SBOM generation.

The SBOM covers unpacked desktop files and the signed AAB as an artifact. The
installer, package, and internal AAB file reconciliation belongs to GPL-P04.
The first release built with this recipe must be checked against the published
assets before GPL-P03 is marked accepted.
