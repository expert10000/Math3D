# Math3D 1.5.1

This release establishes the Android companion viewer and its first durable
production signing and distribution path. The mobile application is version
`1.5.1`, build `150007`.

## Android companion

- The five destinations are Home, Explore, Workspace, Files, and Settings.
  Explore contains bundled Gallery examples, function presets, and Learn notes.
- Workspace renders explicit and parametric 3D surfaces locally. Touch controls
  orbit, pan, zoom, and fit the view. Its inspector has Scene, Object, Display,
  and Analyze sections.
- Files stores and reopens local scenes. The last scene and camera state restore
  after app relaunch, including when the phone is unplugged.
- Settings can test a network-reachable Math3D worker for implicit preview
  computation. The internal tester APK permits a trusted LAN HTTP worker;
  production Android requires HTTPS.

## Build and verification

- `apps/mobile/android` is the canonical Android project. Mobile identity is
  generated from `apps/mobile/version.json`.
- Internal APKs and the production AAB use separate signing keys held outside
  Git. The production key has a verified encrypted backup held by the owner.
- Android CI checks mobile types, application identity, internal APK build,
  signature and hashes, and an emulator functional smoke test. A separate CI
  workflow builds and verifies the production-signed AAB.
- The Samsung SM-A566B running Android 16 passed exact-build `150007` checks:
  Catenoid rendering and restore, Files and Explore navigation, inspector,
  two-finger pan and zoom, app resume, fatal-log review, and USB-free worker
  health over Wi-Fi. See `docs/mobile-1.5.1-release-readiness.md` for the APK
  hash, AAB hash, and detailed evidence.

## Current limits

- The phone is a companion viewer. It does not have the desktop authoring or
  analysis workspaces. Implicit surfaces require a reachable worker or cached
  preview for the computed mesh.
- iOS rendering remains incomplete: the simulator opens the shell but the 3D
  viewport is blank. This release does not include an iOS build.

The tag-triggered workflow builds the Windows and Linux desktop installers and
archives. The Android production AAB is published as a separate verified
release asset after the release is created.
