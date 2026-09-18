# Math3D Mobile: Android build, signing, and tester install

Last verified: September 18, 2026

This is the build and installation guide for the Expo/React Native companion app.
The authoritative Android project is `apps/mobile/android`. The root `android/`
directory is a retired scaffold whose Gradle settings fail deliberately. Run the
commands below from the repository root; the root `android` npm alias routes to
`apps/mobile`.

## Current mobile scope

The companion app has Home, Explore, Workspace, Files, and Settings destinations.
Explore contains Gallery demos, function presets, and Learn notes. Files lists
locally stored scenes with search and sorting. Gallery demos and function presets
open in Workspace, where a native 3D viewport supports touch camera controls.
Its collapsible inspector contains Scene, Object, Display, and Analyze tools;
Object includes visibility, opacity, fit, and camera reset. Scenes and viewer
settings persist locally. Settings includes a
configurable worker URL, backend diagnostics, render quality, a mesh resolution
cap, cache controls, and a limited mode that uses cached previews when remote
compute is unavailable. Implicit mesh previews require a reachable Math3D
worker proxy; CGAL/VTK compute does not run on the phone. The app is a companion
viewer, not a full desktop authoring or workbook editor.

The [mobile migration plan](mobile-migration-implementation-plan.md) describes
the feature phases. Its early “Current State Snapshot” is historical; use this
guide, the [functionality and navigation overview](mobile-functionality-navigation-overview.md),
and the [Phase 5 checklist](mobile-phase5-stability-checklist.md) for the
current feature and release status.

## Application identity and version

`apps/mobile/version.json` is the source of truth for the mobile application ID,
version, and build number. At this verification point it contains:

| Field | Value | Consumers |
| --- | --- | --- |
| Application ID | `com.math3d.mobile` | Expo Android/iOS config and Android Gradle |
| Version | `1.5.0` | Mobile npm package, Expo, Android `versionName`, iOS `CFBundleShortVersionString` on prebuild |
| Build | `150003` | Android `versionCode`, iOS `CFBundleVersion` on prebuild |

`apps/mobile/app.config.js` supplies the Expo values. Gradle reads
`version.json` directly. Expo autolinking also needs a literal namespace in
`apps/mobile/android/app/build.gradle`; the version sync script generates and
checks that line. After changing `version.json`, run:

```bash
npm run mobile:version:sync
npm run mobile:version:check
```

Commit the resulting package/lockfile and namespace changes before building a
tester artifact. A new Android application ID is a new app to Android: existing
installs under the old `com.anonymous.math3dmobile` ID cannot update in place.
Internal builds use `com.math3d.mobile.internal` and can coexist with the main
app.

## Build prerequisites

- Node.js 24 or newer and npm 10 or newer.
- JDK 17 with `keytool` on `PATH` for internal key creation.
- Android SDK, including API 36, Build Tools 36, NDK 27.1.12297006, and CMake
  3.22.1 for the currently pinned Expo/React Native build.
- On Windows, the build script discovers the SDK at
  `%LOCALAPPDATA%\Android\Sdk` when `ANDROID_HOME` is unset. Elsewhere, set
  `ANDROID_HOME` to the installed SDK.

Install locked dependencies from the repository root:

```bash
npm ci
npm run mobile:version:check
```

## Build channels and output

| Command | Gradle task | Output | Signing |
| --- | --- | --- | --- |
| `npm run mobile:android:debug` | `:app:assembleDebug` | `artifacts/mobile/Math3D-mobile-1.5.0-debug.apk` | Checked-in debug key; development only |
| `npm run mobile:android:internal` | `:app:assembleInternal` | `artifacts/mobile/Math3D-mobile-1.5.0-internal.apk` | Separate internal key |
| `npm run mobile:android:release` | `:app:bundleRelease` | `artifacts/mobile/Math3D-mobile-1.5.0-release.aab` | Release-owner production key |

Each successful command also updates `artifacts/mobile/SHA256SUMS` and
`artifacts/mobile/build-info.json`. The metadata records the app ID, version,
build, channel, Git commit, whether tracked source files were modified and
their paths, artifact name, and SHA-256. `build-info.json` describes the **last** build, so copy it
into the tester archive immediately after building that channel. The artifacts
directory is ignored by Git. The release command produces an AAB for store
distribution; the internal command produces the installable tester APK.

The build process is repeatable from a pinned commit and toolchain. Use the
recorded artifact SHA-256 to identify a specific binary; Gradle output is not
assumed byte-for-byte identical across machines.

## Internal signing key

Run once on the machine that owns the internal update key:

```bash
npm run mobile:signing:internal:init
```

The command refuses to replace an existing key. It generates a private key and
configuration outside Git:

- Windows: `%LOCALAPPDATA%\Math3D\signing\mobile-internal.jks` and `internal.json`
- macOS/Linux: `~/.config/Math3D/signing/mobile-internal.jks` and `internal.json`

Back up **both** files in secure team storage. Losing the key prevents an
internal APK from updating installs signed with it. The JSON file contains the
keystore password and must be treated as a secret. Do not add either file to
Git, the tester archive, or issue attachments. The internal build command loads
this local configuration automatically.

For a shared build machine, or to override local internal configuration, supply
all four environment variables for the chosen channel (`INTERNAL` or `RELEASE`):

```text
MATH3D_ANDROID_<CHANNEL>_KEYSTORE_PATH
MATH3D_ANDROID_<CHANNEL>_STORE_PASSWORD
MATH3D_ANDROID_<CHANNEL>_KEY_ALIAS
MATH3D_ANDROID_<CHANNEL>_KEY_PASSWORD
```

Production release builds **always** require the `RELEASE` variables and a
release-owner keystore. They never fall back to the internal or debug key.
Gradle itself rejects missing credentials, and both the npm wrapper and Gradle
reject the checked-in debug keystore for internal/release signing. Do not
generate a new production key for each build: updates need continuity of the
production signing identity.

## Verify and install an internal APK

From PowerShell, after `npm run mobile:android:internal`:

```powershell
$apk = 'artifacts/mobile/Math3D-mobile-1.5.0-internal.apk'
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
Get-FileHash -Algorithm SHA256 -LiteralPath $apk
& "$env:ANDROID_HOME/build-tools/36.0.0/apksigner.bat" verify --verbose --print-certs $apk
& "$env:ANDROID_HOME/build-tools/36.0.0/aapt.exe" dump badging $apk
adb install -r $apk
```

`apksigner` should report one signer, and `aapt` should report
`com.math3d.mobile.internal`, version `1.5.0-internal`, build `150003`.
Testers can also transfer the APK to a phone and open it from a file manager;
Android may ask them to allow installation from that source. For updates,
distribute an APK signed by the **same** internal key with a higher build number.

For a minimum phone smoke test, launch Workspace and inspect the Catenoid,
open Explore > Gallery and return to Workspace, swipe the inspector, change
opacity, save and reopen a scene in Files, then unplug USB and relaunch from
the phone launcher. Inspect filtered `AndroidRuntime`/`ReactNativeJS` logs.
Device performance, remote compute, and the full repeat matrix are tracked in
`docs/mobile-phase5-stability-checklist.md`.

## Automated build and release gates

`.github/workflows/mobile-android.yml` runs on pull requests and pushes to
`main`/`master`, and can be started manually. It checks version consistency and
mobile TypeScript, builds a signed internal APK, verifies its checksum and
signature, then runs a focused Android 16 emulator smoke test. That test covers
clean installation, offline Workspace launch, inspector swipe and opacity,
Home/Explore/Workspace/Files/Settings navigation, and fatal app logs. The run
uploads the APK, `build-info.json`, `SHA256SUMS`, screenshot, filtered log, and
machine-readable smoke result as a GitHub Actions artifact for 14 days.

Normal CI uses a **disposable** internal signing key. Its APK proves that the
source builds and installs, but cannot update a tester install signed by the
shared key. For a repeatable local smoke run on an Android emulator after an
internal build:

```bash
npm run mobile:android:smoke
```

The smoke command deliberately clears only an emulator install. It refuses a
physical device. Its evidence is written to `output/mobile-android-smoke/`.

`.github/workflows/release.yml` calls the same gate before publishing the
desktop installers. A release run requires the physical-device record in
`docs/mobile-device-signoff.json` to be `approved`, with the exact tested
source commit, APK SHA-256, internal signing certificate SHA-256, device,
tester, date, and all listed checks. The validator rejects mobile source
contents that differ from the tested commit. It runs with:

```bash
npm run mobile:device:signoff:check
```

The record currently says `pending` for build `150003`. Keep it pending until
that APK has been updated or installed on a physical phone, relaunched after
USB is disconnected, and the seven checks have actually passed. Attach test
notes or logs to the release review; only commit factual results to the JSON.

The release workflow also needs these GitHub Actions secrets for the **shared
internal** signing identity:

| Secret | Value |
| --- | --- |
| `MATH3D_ANDROID_INTERNAL_KEYSTORE_BASE64` | Base64 of the backed-up `mobile-internal.jks` |
| `MATH3D_ANDROID_INTERNAL_STORE_PASSWORD` | Store password from the secure `internal.json` backup |
| `MATH3D_ANDROID_INTERNAL_KEY_ALIAS` | Alias from that backup |
| `MATH3D_ANDROID_INTERNAL_KEY_PASSWORD` | Key password from that backup |

Base64 is a transport encoding, not protection; store the encoded keystore as
a secret. The workflow compares the built APK certificate with the physical
device record, so a new disposable key cannot silently replace the tested
signing identity. The CI artifact is a fresh validation build and may have a
different APK hash; distribute the exact APK identified by the signoff hash to
testers. These gates do not create the production release AAB. That still
requires the separately held `RELEASE` keystore and production-signing review.

## Verified tester archive

The local archive
`artifacts/mobile/Math3D-mobile-1.5.0-internal-b93e9b8.zip` contains the
signed APK, `build-info.json`, `SHA256SUMS`, tester instructions, and screenshots
of Home and the 3D viewer from the earlier six-tab UI. It contains **no signing
credentials**. Its hash identifies build `150001`; the Workspace UI starts at
build `150003` and has a different hash.

| Evidence | Value |
| --- | --- |
| Tested source commit | `b93e9b813373fadfb34cccf7b882bd64f2a33e48` |
| APK SHA-256 | `0b2d9b5bee1f5babe273c2f95ac43effeae2eed1033ec56dfc4cdca9b12e23ab` |
| Archive SHA-256 | `0b05739def00f014947e90c3dcdba0ece61ff22ac1dfa3a1151d90818c435507` |
| Internal certificate SHA-256 | `39ab9388fa174bf9c1973577dab4ee33eedbacb9b231c9b79068e5143480fc82` |
| Device tested | Android 16 x86_64 emulator, `EnterpriseAnalytics_Pixel` |
| Result | Install, launch, Home, Gallery > Catenoid, native GL viewer, touch orbit passed; no filtered fatal JS/Android errors |

The archive and screenshots are local ignored artifacts, not checked into Git.
The repository checklist records this P0 smoke result. On September 18, 2026,
the same APK hash also installed and launched on a Samsung `SM-A566B` running
Android 16. Its tabs and native surface viewer worked, and no app fatal crash
appeared in the inspected logs. The user accepted this internal tester install
path for now. USB was used for installation and diagnostics; a relaunch after
unplugging has not yet been observed. The repeated physical-device matrix and a
production-key signed release AAB remain separate release-readiness gates.

## Workspace UI build smoke

The current internal APK at `artifacts/mobile/Math3D-mobile-1.5.0-internal.apk`
is build `150003` from source commit
`150671d9d09d4ac79cac2f22b89e402d08345d08`. Its SHA-256 is
`89ea4c9e4885ec01b131fe4c19cc334258cb3d57f85294c69f84646822d1f28a`.
It uses the same internal signing certificate as build `150001`.

An Android 16 emulator clean install opened the Catenoid scene in Workspace.
Home, Explore, Workspace, Files, and Settings navigation, the Scene/Object/
Display/Analyze inspector, upward/downward sheet swipes, 50% object opacity,
and portrait camera fit were smoke-tested. The app stayed running with no
filtered fatal Android or React Native JS errors. This was build `150002`;
on the Samsung its bottom tabs overlapped the three-button system navigation.
The safe-area correction is in build `150003`, now installed on the Samsung
with physical navigation and persistence checks still pending.

## Remaining release gates

1. Back up the internal keystore and `internal.json` together in secure team
   storage, and establish who owns future internal updates.
2. Have the release owner supply the production keystore and four `RELEASE`
   variables outside Git, then build and verify the release AAB.
3. Run the repeated Android physical-device matrix and record crashes,
   performance, backend behavior, and signing/update continuity in the
   [Phase 5 checklist](mobile-phase5-stability-checklist.md). Complete the iOS
   matrix before a cross-platform external release.
