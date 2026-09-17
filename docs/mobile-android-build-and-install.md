# Math3D Mobile: Android build, signing, and tester install

Last verified: September 18, 2026

This is the build and installation guide for the Expo/React Native companion app.
The authoritative Android project is `apps/mobile/android`. The root `android/`
directory is a retired scaffold whose Gradle settings fail deliberately. Run the
commands below from the repository root; the root `android` npm alias routes to
`apps/mobile`.

## Current mobile scope

The companion app has Home, Gallery, Viewer, Functions, Learn, and Settings
tabs. Home lists locally stored scenes with search and sorting. Gallery demos
and function presets open in the native 3D viewer, which supports touch camera
controls. Scenes and viewer settings persist locally. Settings includes a
configurable worker URL, backend diagnostics, render quality, a mesh resolution
cap, cache controls, and a limited mode that uses cached previews when remote
compute is unavailable. Implicit mesh previews require a reachable Math3D
worker proxy; CGAL/VTK compute does not run on the phone. The app is a companion
viewer, not a full desktop authoring or workbook editor.

The [mobile migration plan](mobile-migration-implementation-plan.md) describes
the feature phases. Its early “Current State Snapshot” is historical; use this
guide and the [Phase 5 checklist](mobile-phase5-stability-checklist.md) for the
current build and release status.

## Application identity and version

`apps/mobile/version.json` is the source of truth for the mobile application ID,
version, and build number. At this verification point it contains:

| Field | Value | Consumers |
| --- | --- | --- |
| Application ID | `com.math3d.mobile` | Expo Android/iOS config and Android Gradle |
| Version | `1.5.0` | Mobile npm package, Expo, Android `versionName`, iOS `CFBundleShortVersionString` on prebuild |
| Build | `150001` | Android `versionCode`, iOS `CFBundleVersion` on prebuild |

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
build, channel, Git commit, whether tracked source files were modified, artifact
name, and SHA-256. `build-info.json` describes the **last** build, so copy it
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
`com.math3d.mobile.internal`, version `1.5.0-internal`, build `150001`.
Testers can also transfer the APK to a phone and open it from a file manager;
Android may ask them to allow installation from that source. For updates,
distribute an APK signed by the **same** internal key with a higher build number.

For a minimum smoke test, launch the app, confirm Home and saved scenes render,
open Gallery > Catenoid in Viewer, orbit the surface, and inspect filtered
`AndroidRuntime`/`ReactNativeJS` logs. Device performance, remote compute, and
the full repeat matrix are tracked in
`docs/mobile-phase5-stability-checklist.md`.

## Verified tester archive

The local archive
`artifacts/mobile/Math3D-mobile-1.5.0-internal-b93e9b8.zip` contains the
signed APK, `build-info.json`, `SHA256SUMS`, tester instructions, and screenshots
of Home and the 3D viewer. It contains **no signing credentials**.

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

## Next release gates

1. Back up the internal keystore and `internal.json` together in secure team
   storage, and establish who owns future internal updates.
2. Have the release owner supply the production keystore and four `RELEASE`
   variables outside Git, then build and verify the release AAB.
3. Run the repeated Android physical-device matrix and record crashes,
   performance, backend behavior, and signing/update continuity in the
   [Phase 5 checklist](mobile-phase5-stability-checklist.md). Complete the iOS
   matrix before a cross-platform external release.
