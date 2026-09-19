# Math3D mobile: functionality and navigation overview

Snapshot: September 19, 2026, Android candidate build `150007` (`1.5.1`). This is the current implementation inventory for planning the next mobile roadmap. Build `150003` corrected the Android bottom safe area, `150004` restored the last viewed Explore scene, and `150006` enabled worker HTTP on the internal Android variant with clearer connection errors. Build `150007` advances the release identity with the same mobile functionality. The app is an Expo/React Native companion viewer in `apps/mobile`; the canonical Android project is `apps/mobile/android`.

## Navigation at a glance

```text
Home | Explore | Workspace | Files | Settings
        |          |
        |          +-- Inspector sheet: Scene | Object | Display | Analyze
        +-- Gallery | Functions | Learn
```

Workspace opens first. The five destinations are a custom bottom navigation bar controlled by state in `MobileApp.tsx`; Gallery, Functions, and Learn are sections inside Explore. The Workspace inspector is a collapsible, scrollable sheet. These are currently rendered by one main component rather than separate route components.

## Screen and tab inventory

| Destination | What a user can do now | Current limits |
| --- | --- | --- |
| **Home** | Jump to the current Workspace scene, Explore, or saved Files. Shows saved scene count. | A launch hub; no dashboard, recent-scene cards, or onboarding flow. |
| **Explore → Gallery** | Browse nine bundled surface examples and open one directly in Workspace. Includes implicit, explicit, and parametric examples. | Catalog is hardcoded in `mobileSeedData.ts`; no search, categories, remote catalog, or user submissions. |
| **Explore → Functions** | Load one of three bundled presets (Sphere, Paraboloid, Helicoid) into Workspace. | Preset list is hardcoded; no formula editor or custom function creation. |
| **Explore → Learn** | See the Formula notes landing panel. | Guided explanations and lessons are explicitly planned but not implemented. |
| **Workspace** | View the current scene, orbit with one finger, pan and pinch zoom with two fingers, double tap to fit, select visible objects, and use the inspector. A saved/seed scene is restored on launch. | Companion viewer, not desktop authoring parity. Implicit computed meshes depend on a worker; a local proxy shape appears without one. |
| **Files** | Search local scenes by title/ID, sort by recent open, update time, or title, and open a scene in Workspace. Shows update/open times and surface count. | Local app sandbox only; no file picker, import/export, rename, delete, cloud sync, or sharing UI. Thumbnail is a two-letter title tile. |
| **Settings** | Configure and test worker URL; set mesh resolution cap and render quality; inspect backend status; clear caches; toggle limited mode and Android GL behavior; view version, protocol, and storage state. | Requires a separately reachable worker for backend checks and implicit compute. No account, sync, or production release-management UI. |

### Workspace inspector

| Section | Implemented controls | Roadmap boundary |
| --- | --- | --- |
| **Scene** | Show all, hide all, save current scene to Files. | No scene tree editing, object add/remove, or scene metadata editor. |
| **Object** | Select an object, toggle visibility, set opacity to 25/50/75/100%, fit, reset camera, hide. | No transform, material, formula, or geometry editing. |
| **Display** | Switch render quality among performance, balanced, and sharp. | No lighting, grid, axis, color, or advanced rendering controls. |
| **Analyze** | Show implicit preview status, vertex/triangle counts, cache state, and errors; retry failed previews, lower quality and retry, or open diagnostics. | No mobile analysis result views or general compute controls yet. |

On a compact screen, lower Object controls require scrolling inside the inspector. The Android emulator smoke test covers this layout at 320×640.

## What actually runs on the device

| Capability | Current implementation |
| --- | --- |
| **Local 3D rendering** | Expo GL with React Three Fiber renders explicit and parametric surface previews. Touch camera controls, visibility, selection, opacity, and camera fit/reset are wired to the viewport. |
| **Weierstrass surfaces** | A local Enneper-style approximation is shown, with a warning that it is a mobile v1 preview. |
| **Implicit surfaces** | The app requests a VTK preview through the configured worker. Without a computed or cached mesh it shows a local placeholder shape and warning, not the mathematical implicit result. |
| **Remote compute transport** | `@math3d/api-client` supplies HTTP transport with a 25-second timeout and one retry. The mobile service has typed methods for health, version, CGAL mesh, VTK preview, volume isosurface, and geodesic heat. The UI currently calls health/version and VTK implicit preview; the other methods are not feature screens. |
| **Offline behavior** | Bundled explicit/parametric scenes and saved local scenes can open without a worker. Limited mode disables remote compute and uses a cached implicit preview when available. |
| **Local persistence** | Scene projects use the shared `math3d.scene-project` serializer in the app document directory. Settings save the worker URL, resolution cap, last scene/object, camera orbit, GL state, and selected diagnostics. Mesh previews have a bounded local cache. |
| **App lifecycle** | Rendering pauses when backgrounded; the last scene and camera state are restored. Android GL has a fallback/recovery path. |

The default worker URL is `http://127.0.0.1:8787/api/worker`. On a standalone phone, `127.0.0.1` is the phone itself. A real worker needs a URL reachable from the phone's network; USB is not required for the installed APK to run. Internal Android build `150006` permits HTTP to a trusted LAN worker; a production build requires HTTPS.

## Main user flows today

1. **Open a bundled example:** Explore → Gallery or Functions → tap an item → Workspace. Explicit and parametric examples render locally; an implicit example needs worker compute or cache for its actual mesh.
2. **Inspect and save:** Workspace → swipe up inspector → Object/Display/Scene controls → Scene → Save to Files → Files to reopen it.
3. **Recover work:** Relaunch → last local scene and camera settings load → Files can open another stored scene.
4. **Diagnose compute:** Settings → save a reachable worker URL → Health Check → Workspace Analyze for preview status/retry → Settings diagnostics for error, latency, version, and protocol information.

## Verified state and release limits

- The [Android CI gate](../.github/workflows/mobile-android.yml) passed on source commit `f34fa0ee4457b62c5214f639e0087130df748138`: mobile version/typecheck, internal APK build, signature/hash checks, clean emulator install, Workspace launch, inspector swipe/opacity, five-destination navigation, Explore sections, and fatal-log check. The [run and artifact](https://github.com/expert10000/Math3D/actions/runs/35362388071) contain the APK, metadata, screenshot, and smoke result. CI APK SHA-256: `25e6478d5c4f65640968d38c0a384dea72a40cded8ac5d7fddf0500ea2022189`.
- Normal CI uses a disposable signing key. An on-demand [shared-key CI run](https://github.com/expert10000/Math3D/actions/runs/35397425202) passed for `150006` with the Samsung-tested signing certificate; its APK has its own hash.
- Samsung `SM-A566B` passed basic physical smoke on older builds. Build `150002` exposed bottom navigation overlap; build `150003` fixed the safe area but failed unsaved Explore scene restore. Build `150004` passed focused exact-build signoff, including USB-free restore. Build `150006` passed ten repeated Samsung launch/Gallery/orbit/quality/worker-health/background cycles, exact-build Files persistence, ten fresh implicit previews over Wi-Fi, and ten invalid endpoint checks. Its [historical signoff](mobile-device-signoff-150006.json) is archived. The `1.5.1` build `150007` passed [exact-build Samsung signoff](mobile-device-signoff.json), including USB-free Catenoid restore and worker health. Its [release readiness record](mobile-1.5.1-release-readiness.md) contains the signed APK/AAB hashes, emulator smoke, and verified encrypted USB key backup. See the [historical matrix](mobile-150006-release-matrix.md), [MOB24 history](mobile-mob24-physical-evidence.md), [build/install guide](mobile-android-build-and-install.md), and [Phase 5 checklist](mobile-phase5-stability-checklist.md).
- The unsigned iOS Release app launches its Workspace shell in the hosted iPhone simulator, but the 3D viewport remains blank at 45 seconds. The iOS screenshot gate now fails on that state; physical iPhone rendering is untested.

## Roadmap starting points

The [current mobile roadmap](mobile-roadmap.md) integrates this inventory into a product direction: **offline-capable companion viewer + network-backed compute client + lightweight scene editing**. Its M0–M8 phases and MOB24–MOB54 commit sequence distinguish planned work from the `150007` candidate.

The remaining M0 gate is durable release publication. Then split `MobileApp.tsx`, correct the Analyze/Compute and Display/View terminology, and remove the implicit proxy geometry (M1). Projects, worker jobs, multi-object Workspace, mathematical Analyze, shared Examples/Learn, small authoring, and platform hardening follow with their acceptance criteria in the roadmap.

## Source map

- UI and navigation: [`apps/mobile/src/MobileApp.tsx`](../apps/mobile/src/MobileApp.tsx)
- Seed gallery, presets, scenes: [`apps/mobile/src/data/mobileSeedData.ts`](../apps/mobile/src/data/mobileSeedData.ts)
- 3D viewport and local geometry: [`MobileSceneViewport.tsx`](../apps/mobile/src/components/MobileSceneViewport.tsx), [`mobileSurfacePreview.ts`](../apps/mobile/src/viewer/mobileSurfacePreview.ts)
- Storage and backend: [`mobileSceneStorage.ts`](../apps/mobile/src/services/mobileSceneStorage.ts), [`mobileSettingsStorage.ts`](../apps/mobile/src/services/mobileSettingsStorage.ts), [`mobileMeshCacheStorage.ts`](../apps/mobile/src/services/mobileMeshCacheStorage.ts), [`mobileMeshBackend.ts`](../apps/mobile/src/services/mobileMeshBackend.ts)
