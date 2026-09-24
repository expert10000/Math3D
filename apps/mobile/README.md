# Mobile App

React Native / Expo companion app target for Math3D.

The app opens into a 3D Workspace with a collapsible Scene/Object/View/Compute
inspector. Bottom navigation has Home, Explore, Workspace, Projects, and Settings.
Explore contains Gallery, Functions, and Learn; saved scenes live in Projects.
The Workspace viewer uses Z-up coordinates with selectable XY, XZ, and YZ reference planes through the origin. Each plane has a subtle fill plus major and minor grid lines. View has independent On/Off switches for each plane, Show all/Hide all, and a separate Axes switch. Choices persist across launches. All three planes are selected by default on a new install; existing visible-plane choices remain selected after an update.
View also offers Solid, Curvature, and Faces surface colors plus Solid, Wireframe, and Solid + edges display modes. Curvature colors use local normal change across mesh edges (blue low, orange high); Faces applies one color per triangle. This selection persists across launches. An uncomputed implicit surface uses an explicit neutral state instead of proxy geometry.

The app entry point delegates state to `mobileAppController.ts` and rendering to separate Home, Explore, Workspace, Projects, and Settings screens. Navigation, workspace, and local project state each have a dedicated hook; the Workspace inspector is its own component. Project saves are validated, staged in a temporary file, and renamed into place. The previous valid library is retained as a recovery backup. Projects supports search, sorting, rename, duplicate, reversible delete, generated scene thumbnails, validated scene import, folder export, and native sharing.

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
