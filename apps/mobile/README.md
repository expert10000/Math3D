# Mobile App

React Native / Expo companion app target for Math3D.

Scope for the first version:

- scene gallery
- open and inspect saved scenes
- lightweight 3D preview workflow
- remote mesh generation through backend API

Not in first version:

- local CGAL or VTK compute
- full desktop authoring workspace

## Run

```bash
npm run dev:mobile
```

Or directly:

```bash
npm --prefix apps/mobile run dev
```

## Canonical native project and version

`apps/mobile/android` is the only Android application project. Run native commands from
`apps/mobile` or use the root scripts below. `apps/mobile/version.json` defines the
mobile application ID, version, and build number. Expo reads it through
`apps/mobile/app.config.js`; Android Gradle reads it directly. Expo autolinking
requires a literal Android namespace, which the sync script generates and checks.
Expo's iOS prebuild
uses its version as `CFBundleShortVersionString` and build number as
`CFBundleVersion`.

After changing `version.json`, run `npm run mobile:version:sync` to update the
mobile package and lockfile metadata. `npm run mobile:version:check` rejects drift.

## Android builds

From the repository root, with Node 24+, Android SDK/JDK installed:

```bash
npm ci
npm run mobile:android:debug
npm run mobile:android:internal
npm run mobile:android:release
```

Internal and release builds require separate signing credentials in environment
variables. For each `INTERNAL` or `RELEASE` channel, set:

```text
MATH3D_ANDROID_<CHANNEL>_KEYSTORE_PATH
MATH3D_ANDROID_<CHANNEL>_STORE_PASSWORD
MATH3D_ANDROID_<CHANNEL>_KEY_ALIAS
MATH3D_ANDROID_<CHANNEL>_KEY_PASSWORD
```

Keep keystores and credentials outside Git. The build fails if signing credentials
are absent; only debug builds use the checked-in debug keystore. Internal builds
use an `.internal` application ID suffix so they can coexist with release builds.
The commands copy output to `artifacts/mobile/` and write `SHA256SUMS` plus
`build-info.json`. The internal output is an APK; release output is an AAB.

## Phase 5 Gate Helpers

From repo root:

```bash
npm run phase5:mobile:gate
npm run phase5:mobile:release-metadata
npm run phase5:mobile:device-runbook
```
