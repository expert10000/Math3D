# Math3D Mobile: Android build, signing, and tester install

Last verified: September 19, 2026

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
| Version | `1.5.1` | Mobile npm package, Expo, Android `versionName`, iOS `CFBundleShortVersionString` on prebuild |
| Build | `150007` | Android `versionCode`, iOS `CFBundleVersion` on prebuild |

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

The internal Android variant permits HTTP worker URLs for trusted LAN testing.
The release variant keeps Android's default cleartext restriction and therefore
needs an HTTPS worker URL for network-backed compute. The [build 150006 matrix](mobile-150006-release-matrix.md)
records a phone-to-worker Wi-Fi check.

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
| `npm run mobile:android:debug` | `:app:assembleDebug` | `artifacts/mobile/Math3D-mobile-1.5.1-debug.apk` | Checked-in debug key; development only |
| `npm run mobile:android:internal` | `:app:assembleInternal` | `artifacts/mobile/Math3D-mobile-1.5.1-internal.apk` | Separate internal key |
| `npm run mobile:android:release` | `:app:bundleRelease` | `artifacts/mobile/Math3D-mobile-1.5.1-release.aab` | Release-owner production key |

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

The first production/upload key for `com.math3d.mobile` was created with:

```bash
npm run mobile:signing:release:init
```

This command refuses to replace a key. It writes `mobile-release.jks` and
`release.json` alongside the internal signing files outside Git. The public
certificate fingerprint is recorded in [mobile-release-signing.json](mobile-release-signing.json).
The release build reads this local configuration when no release environment
variables are set. **Back up both release files in owner-controlled, off-device
secure storage before external distribution.** The CI secrets are not a
recoverable backup. The owner verified an encrypted USB archive on September
19, 2026 and retained its recovery code separately; the public signing record
contains its SHA-256 and verification time.

For an unencrypted removable drive, create a passphrase-encrypted backup of
both signing identities. The tool reads the four local files, asks for a
passphrase in an interactive terminal without echoing it, writes one AES-256-GCM
archive, then decrypts it and compares every recovered file in memory:

```powershell
npm run mobile:signing:backup -- 'G:\Math3D\mobile-signing-keys.m3dbak'
npm run mobile:signing:backup:verify -- 'G:\Math3D\mobile-signing-keys.m3dbak'
```

Keep the passphrase separately in owner-controlled storage. The archive alone
cannot recover the keys without it. The tool refuses to overwrite an existing
archive; the `restore` command can recover the four files to an empty signing
directory and rewrites the JSON keystore paths for that directory.

For a shared build machine, or to override local configuration, supply all
four environment variables for the chosen channel (`INTERNAL` or `RELEASE`):

```text
MATH3D_ANDROID_<CHANNEL>_KEYSTORE_PATH
MATH3D_ANDROID_<CHANNEL>_STORE_PASSWORD
MATH3D_ANDROID_<CHANNEL>_KEY_ALIAS
MATH3D_ANDROID_<CHANNEL>_KEY_PASSWORD
```

Production release builds require the release key through the local
`release.json` or all four `RELEASE` variables. They never fall back to the
internal or debug key.
Gradle itself rejects missing credentials, and both the npm wrapper and Gradle
reject the checked-in debug keystore for internal/release signing. Do not
generate a new production key for each build: updates need continuity of the
production signing identity.

## Verify and install an internal APK

From PowerShell, after `npm run mobile:android:internal`:

```powershell
$apk = 'artifacts/mobile/Math3D-mobile-1.5.1-internal.apk'
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
Get-FileHash -Algorithm SHA256 -LiteralPath $apk
& "$env:ANDROID_HOME/build-tools/36.0.0/apksigner.bat" verify --verbose --print-certs $apk
& "$env:ANDROID_HOME/build-tools/36.0.0/aapt.exe" dump badging $apk
adb install -r $apk
```

`apksigner` should report one signer, and `aapt` should report
`com.math3d.mobile.internal`, version `1.5.0-internal`, build `150006`.
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

Build `150004` has a historical approved Samsung record. Build `150006`
has its own [archived approved signoff](mobile-device-signoff-150006.json),
including the owner-observed USB-free Catenoid relaunch. Its
[matrix evidence](mobile-150006-release-matrix.md) records broader checks.
The [current `1.5.1` candidate](mobile-1.5.1-release-readiness.md), build
`150007`, needs a new exact-APK [device signoff](mobile-device-signoff.json).
No previous APK approval transfers to a new build.

The release workflow also needs these GitHub Actions secrets for the **shared
internal** signing identity:

| Secret | Value |
| --- | --- |
| `MATH3D_ANDROID_INTERNAL_KEYSTORE_BASE64` | Base64 of the backed-up `mobile-internal.jks` |
| `MATH3D_ANDROID_INTERNAL_STORE_PASSWORD` | Store password from the secure `internal.json` backup |
| `MATH3D_ANDROID_INTERNAL_KEY_ALIAS` | Alias from that backup |
| `MATH3D_ANDROID_INTERNAL_KEY_PASSWORD` | Key password from that backup |

Base64 is a transport encoding, not protection; store the encoded keystore as
a secret. All four repository secrets are now configured from the existing
internal key. The [shared-signing CI run](https://github.com/expert10000/Math3D/actions/runs/35397425202)
passed certificate comparison and emulator smoke for `150006`. Its APK hash
differs from the local Samsung-tested APK, so distribute the exact APK
identified by device signoff. The production AAB uses the separate release
upload key described below.

`.github/workflows/mobile-android-production-aab.yml` is a manual gate. It
checks the approved device record, restores the release key from four separate
GitHub Actions secrets, builds the AAB, and compares the embedded signing
certificate against the public fingerprint in `mobile-release-signing.json`.
The secret names mirror the internal set, replacing `INTERNAL` with `RELEASE`.
The keystore secret holds base64 encoded bytes; the password and alias secrets
hold their respective values. All four are configured in the repository.
After exact-build signoff and key backup, dispatch it with `release_tag` set
to an existing tag matching the mobile version, such as `v1.5.1`. It then
builds from that tag, verifies the signed AAB, and attaches the AAB, checksum,
metadata, and verification report to the existing GitHub release. Leave
`release_tag` empty for a verification-only run with a temporary CI artifact.

The earlier `1.5.0` locally verified AAB was
`artifacts/mobile/Math3D-mobile-1.5.0-release.aab` (SHA-256
`008620ed336ba77fcc4f1d734f65781dcd53e2a1fd492af6fa5d052db47693c1`).
Its source is commit `6c128cd87351b3010fa801aeb543ea0ca2db5080`, and its
certificate SHA-256 is
`66a86e95eaf60f8d2224dd06ad5ef4eec6c856ca2b5e32dc954384bc6ad41be3`.
Verify locally with `npm run mobile:android:release:verify`. The
[archive](../artifacts/mobile/Math3D-mobile-1.5.0-release-150006-6c128cd.zip)
contains this exact AAB, metadata, checksums, and the public certificate record;
its SHA-256 is `c0f9f9d9cd11f27a7ee737adae43a3e45df0ca564d38928ec7714195caaaa19f`.
The archive is local and ignored by Git. AABs are for store upload, not direct
phone installation.

The earlier `1.5.0` [production AAB CI run](https://github.com/expert10000/Math3D/actions/runs/35405368898)
passed the same certificate gate using GitHub Actions secrets. Its downloadable
artifact ID is `10572113936`; the separately built AAB SHA-256 is
`52681593987e20250d780a63cf89691720d0bf44bf86029df69c96fc499fc4f0`.
The downloaded AAB's embedded certificate independently matched the public
release fingerprint. The CI artifact ZIP SHA-256 is
`9e19a44fbaf4568b9aab18923cc6c80bf93770cbec816db9cc5511df2818171f`.
Use the AAB's own hash for store upload; local and CI builds have distinct
bytes and verification records.

## Verified tester archive

The earlier local archive
`artifacts/mobile/Math3D-mobile-1.5.0-internal-b93e9b8.zip` contains the
signed APK, `build-info.json`, `SHA256SUMS`, tester instructions, and screenshots
of Home and the 3D viewer from the earlier six-tab UI. It contains **no signing
credentials**. Its hash identifies build `150001`; the Workspace UI starts at
build `150006` and has a different hash.

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
path for that build. USB was used for its installation and diagnostics; this
historical build `150001` did not have a recorded unplugged relaunch. Later
builds `150004` and `150006` did pass owner-observed USB-free scene restore.

## Workspace UI build smoke

The earlier internal APK at `artifacts/mobile/Math3D-mobile-1.5.0-internal.apk`
is build `150006` from source commit
`e36ec7ba90b8da2b3e53b4cdbf6c5df6cab5eb1c`. Its SHA-256 is
`9d1a002d677a32a6ea75b84d018b4c632eccafb15ff9c3d0c9ff7799bc8d0227`.
It uses the same internal signing certificate as build `150001`.
Its exact [approved tester archive](../artifacts/mobile/Math3D-mobile-1.5.0-internal-150006-approved.zip)
has SHA-256 `6ad8e93ad0e8241352650e6d653f8fc82603e685ac9a7d4c1045afdd81f74f6f`.
The archive contains the APK, metadata, checksums, and install note, with no
signing credentials. The [archived device signoff](mobile-device-signoff-150006.json) records
the exact APK hash and owner-observed USB-free Catenoid restore.

An Android 16 emulator clean install opened the Catenoid scene in Workspace.
Home, Explore, Workspace, Files, and Settings navigation, the Scene/Object/
Display/Analyze inspector, upward/downward sheet swipes, 50% object opacity,
and portrait camera fit were smoke-tested. The app stayed running with no
filtered fatal Android or React Native JS errors. This was build `150002`;
on the Samsung its bottom tabs overlapped the three-button system navigation.
The safe-area correction is in build `150003`. It passed connected-device
navigation and saved-project checks, but a last-viewed Explore example reverted
to an older project on relaunch. Build `150004` added session restore and
passed its exact-build Samsung signoff. Build `150006` adds the internal LAN
worker path and clearer connection errors. Its emulator and repeated Samsung
checks pass; the owner confirmed USB-free Catenoid restore on the exact APK.
The new `1.5.1` internal APK is build `150007` from commit `0022cf5`; its
[release readiness record](mobile-1.5.1-release-readiness.md) contains the
exact hashes, emulator smoke, verified backup, and pending phone gate.

## Remaining release gates

1. Complete exact-build `150007` Samsung signoff, including USB-free relaunch,
   worker health over Wi-Fi, Files and inspector checks, and fatal-log review.
2. Complete the remaining physical checks: 30-second two-finger pan/zoom and
   first interactive frame timing. See the
   [Phase 5 checklist](mobile-phase5-stability-checklist.md).
3. Resolve the blank iOS simulator GL viewport and complete physical iPhone
   rendering checks before a cross-platform external release.
