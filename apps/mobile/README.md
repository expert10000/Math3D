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
mobile application ID, version, and build number. See the
[Android build and install guide](../../docs/mobile-android-build-and-install.md)
for the canonical project, version sync, signing, artifact verification, tester
installation, and current release gates.

After changing `version.json`, run `npm run mobile:version:sync` to update the
mobile package and lockfile metadata. `npm run mobile:version:check` rejects drift.

## Android builds

From the repository root, with the prerequisites in the Android guide installed:

```bash
npm ci
npm run mobile:android:debug
npm run mobile:signing:internal:init
npm run mobile:android:internal
npm run mobile:android:release
```

The internal signing setup runs once per signing machine; subsequent internal
builds load its local configuration. Back up the generated key and configuration
securely. The release command requires production credentials from the release
owner. Build outputs and hashes are written to `artifacts/mobile/`.

## Phase 5 Gate Helpers

From repo root:

```bash
npm run phase5:mobile:gate
npm run phase5:mobile:release-metadata
npm run phase5:mobile:device-runbook
```
