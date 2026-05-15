# Mobile Migration Implementation Plan

## 1. Objective
Ship a production-ready `apps/mobile` companion app (Expo + React Native) that can:

1. browse scene/gallery entries,
2. open a scene and preview meshes in 3D,
3. call the existing backend compute pipeline (`/api/worker/*`),
4. share the same scene/document contracts as desktop/web.

Execution note (May 15, 2026): implementation order is frontend-first, with backend integration intentionally moved to the final phase.

Status note (May 15, 2026):
1. Phase 4 companion workflow is implemented in `apps/mobile` (recents, restore, diagnostics, retry/offline mode, lifecycle handling, cache invalidation by scene/parameter/schema hash).
2. Phase 5 is active with in-repo hardening started:
   - worker protocol compatibility checks and unsupported backend warnings in Settings/Diagnostics,
   - pinned mobile dependency versions for QA reproducibility,
   - scripted Phase 5 gate report + artifact hash metadata (`npm run phase5:mobile:gate`).
3. Remaining Phase 5 items requiring device lab execution stay pending until Android/iOS matrix runs complete.

## 2. Scope (v1)

### In scope
1. Scene gallery + recent scenes.
2. Scene open/inspect flow using `@math3d/core` contracts.
3. Remote compute calls for CGAL/VTK preview and mesh ops.
4. Mobile 3D preview viewport (touch orbit/pan/zoom).
5. Basic settings + diagnostics (backend reachability, last error).

### Out of scope (v1)
1. Local CGAL/VTK compute on device.
2. Full desktop authoring workspace parity.
3. Full workbook editor parity.
4. Mesh export/import feature parity.

## 3. Current State Snapshot
1. `apps/mobile` exists, but is currently a shell UI with demo data and placeholder backend URL (`apps/mobile/src/MobileApp.tsx`).
2. Mobile has typed service contracts, but no shared backend client reuse yet (`apps/mobile/src/services/mobileMeshBackend.ts`).
3. Web/desktop runtime is still centered around a large renderer monolith (`renderer/src/App.tsx`, ~43,779 lines).
4. Shared package structure already exists and is the right migration target (`packages/core`, `packages/api-client`, `packages/workbook`, `packages/ui`, `packages/renderer-web`).
5. Existing worker-proxy endpoints already match mobile remote compute needs (`apps/web/server/worker-proxy.cjs`).

## 4. Target Architecture For Mobile

### Runtime boundaries
1. `apps/mobile`: navigation, screens, device integration, touch UX.
2. `packages/core`: canonical domain contracts and scene serialization.
3. `packages/api-client`: runtime-agnostic HTTP client for `/api/worker/*`.
4. `packages/workbook` (read-only in v1): template/model consumption where needed.

### Key rule
No mobile-specific scene format. Mobile must read/write the same `math3d.scene-project` contract.

## 5. Migration Strategy (Phased)

## Phase 0: Baseline And Guardrails (1-2 days)
1. Define a mobile feature flag matrix (`home`, `gallery`, `viewer`, `functions`, `learn`, `settings`) with explicit v1 status.
2. Add mobile environment config (`MATH3D_MOBILE_WORKER_BASE_URL`) and fail-fast diagnostics screen.
3. Add CI checks for mobile typecheck/lint/build entrypoint.

### Exit criteria
1. `npm run dev:mobile` works from clean checkout.
2. Backend URL is configurable per environment (no hardcoded placeholder).

## Phase 1: Shared Backend Client Extraction (2-3 days)
1. Move/implement HTTP + base64 transport logic in `packages/api-client` (from `renderer/src/services/webWorkerProxyBridge.ts` patterns).
2. Add `createHttpMeshBackend(baseUrl)` alongside existing `createElectronMeshBackend()`.
3. Replace `apps/mobile/src/services/mobileMeshBackend.ts` with package client usage.
4. Keep request/response types sourced only from `@math3d/core`.

### Exit criteria
1. Mobile can call `cgal/health`, `vtk/preview`, and `volume/isosurface` via shared client.
2. No duplicated worker contract typing in mobile.

## Phase 2: Scene Data Flow + Persistence (3-4 days)
1. Replace demo scene/gallery arrays with repository-backed or API-backed data adapters.
2. Implement scene serialization/deserialization flow using `@math3d/core` validation.
3. Add local persistence for recent scenes (AsyncStorage) with schema versioning.
4. Implement error boundaries for invalid/legacy scene payloads.

### Exit criteria
1. Mobile opens a real `SceneDocument` from persisted storage.
2. Invalid scene payloads are surfaced with actionable UI error state.

## Phase 3: 3D Viewer Vertical Slice (5-7 days)
1. Introduce React Navigation (`@react-navigation/native`) and split screens by tab.
2. Integrate native 3D stack (`@react-three/fiber/native` + Expo GL compatible setup).
3. Render one surface from `SceneDocument` with touch camera controls.
4. Wire one remote compute path end-to-end (implicit expression -> `vtk/preview` -> mesh render).
5. Add loading/progress/error states for compute jobs.

### Exit criteria
1. User can pick a gallery item and see a rendered mesh on device.
2. Camera controls are stable on both Android and iOS.

## Phase 4: Mobile Companion Workflow + Operational UX (4-7 days)
1. Add recent scenes list with search, sort, thumbnails, and last-opened metadata.
2. Add lightweight function presets and quick-load to viewer.
3. Add scene/session restore:
   - reopen last scene after app restart,
   - preserve camera state,
   - preserve selected object when possible.
4. Add settings panel:
   - backend URL,
   - render quality preset,
   - mesh resolution cap,
   - cache clear,
   - diagnostics,
   - app/build version,
   - worker/proxy version.
5. Add backend diagnostics screen:
   - health check,
   - latency check,
   - supported endpoints,
   - last error,
   - request timeout status,
   - payload size warning.
6. Add crash-safe retry UX for backend failures/timeouts:
   - retry,
   - reduce quality and retry,
   - open diagnostics,
   - use cached result if available.
7. Add offline/limited mode:
   - local sample scenes still open,
   - persisted scenes still visible,
   - remote compute actions disabled with clear message.
8. Add mesh cache:
   - cache last successful preview result,
   - invalidate cache by scene hash / parameter hash / schema version.
9. Add mobile lifecycle handling:
   - pause rendering when app goes background,
   - resume GL context safely,
   - cancel or detach pending compute request on screen exit.
10. Add touch UX polish:
   - stable orbit/pan/zoom gestures,
   - reset camera button,
   - fit object to view,
   - double-tap focus,
   - loading overlay that does not block navigation completely.

### Exit criteria
1. Companion workflow is usable without desktop.
2. User can browse recent scenes, open a preset, render it, leave the app, return, and recover the scene.
3. Top failure modes have clear recovery:
   - network down,
   - wrong backend URL,
   - worker timeout,
   - invalid scene payload,
   - mesh too large,
   - app resume after background.
4. Cached preview can be reused when backend is unavailable.
5. Diagnostics screen gives enough information to debug user reports.

## Phase 5: Stabilization + Release Readiness (4-6 days)
1. Performance profiling on representative devices (mid-range Android + iPhone).
2. Memory and frame-time tuning (mesh decimation defaults, resolution guards).
3. Test matrix and release checklist automation.
4. Internal beta build distribution.
5. Track execution against `docs/mobile-phase5-stability-checklist.md`.

### Exit criteria
1. Cold start, scene load, and preview operations meet agreed budget.
2. No blocker-level crash in smoke test matrix.

## Phase 5: Stabilization + Release Readiness (5-8 days)

1. Performance profiling on representative devices:
   - mid-range Android,
   - low-memory Android if possible,
   - iPhone simulator,
   - one physical iPhone if available.
2. Define mobile performance budgets:
   - cold start time,
   - first screen render time,
   - gallery load time,
   - scene open time,
   - remote preview request time,
   - max mesh vertex/triangle count for default quality,
   - target FPS during camera interaction.
3. Memory and frame-time tuning:
   - mesh decimation defaults,
   - resolution guards,
   - vertex count warnings,
   - dispose geometry/materials/textures on scene close,
   - pause render loop when inactive.
4. Add quality presets:
   - Low: safe for weak devices,
   - Medium: default,
   - High: better preview for tablets/newer phones.
5. Add test matrix and release checklist automation:
   - typecheck,
   - lint,
   - unit tests,
   - package/shared contract tests,
   - Android build,
   - iOS build where available,
   - smoke test checklist.
6. Add crash/error reporting strategy:
   - local error log screen at minimum,
   - optional remote telemetry later,
   - export/share diagnostic report.
7. Add version compatibility checks:
   - mobile app version,
   - scene schema version,
   - worker API version,
   - unsupported backend warning.
8. Prepare internal beta build distribution:
   - Android APK/AAB internal build,
   - iOS TestFlight path if targeting iOS,
   - release notes,
   - known limitations list.
9. Add security/privacy checks:
   - no hardcoded production secrets,
   - backend URL stored safely,
   - clear warning for non-HTTPS backend outside local/dev,
   - no accidental logging of large payloads or private scene data.

### Exit criteria
1. Cold start, scene load, and preview operations meet agreed budgets.
2. App remains stable after repeated open/render/close cycles.
3. No blocker-level crash in smoke test matrix.
4. Mobile detects incompatible worker/schema versions clearly.
5. Internal beta build can be installed and tested by another person.
6. Release notes and known limitations are documented.

## 6. Cross-Cutting Refactors (Parallel Track)
1. Extract pure reusable logic from `renderer/src/App.tsx` into packages incrementally (start with service adapters and scene transformation helpers).
2. Keep renderer behavior unchanged while extracting (strangler pattern).
3. Do not attempt full monolith breakup before mobile vertical slice; extract only blockers for mobile reuse.

## 7. Testing Plan

### Automated
1. Unit tests for `packages/api-client` HTTP transport and base64 conversion edge cases.
2. Contract tests against a running worker-proxy for `cgal/mesh`, `vtk/preview`, `volume/*`.
3. Mobile component tests for critical screens and error states.

### Device-level
1. Android physical device smoke: launch, gallery load, preview request, camera interaction.
2. iOS simulator/physical smoke: same path plus orientation and app resume.

### Regression
1. Existing web/desktop tests stay green.
2. Shared package changes must not break `renderer` runtime imports.

## 8. Risks And Mitigations
1. Risk: API client divergence between web and mobile.
Mitigation: single `packages/api-client` transport layer and contract tests.
2. Risk: 3D rendering performance on lower-end devices.
Mitigation: preview resolution caps, adaptive quality presets, optional decimation step.
3. Risk: Large monolith dependency entanglement in `renderer/src/App.tsx`.
Mitigation: vertical-slice extraction only for mobile blockers, avoid broad refactor first.
4. Risk: Worker-proxy reachability from mobile networks.
Mitigation: explicit backend config UI + diagnostics + timeout/retry policy.

## 9. Delivery Sequence (Recommended)
1. Phase 0 first (frontend guardrails and mobile structure).
2. Phase 2 + Phase 3 next (scene flow and native viewer vertical slice without backend coupling).
3. Phase 4 for companion UX completion and stabilization of mobile-only behavior.
4. Phase 1 after UI/UX stabilization (shared backend client extraction and integration).
5. Phase 5 before any external release.

## 10. Definition Of Done (v1)
1. Android and iOS builds run reliably.
2. User can open a scene and render at least one remote-computed mesh.
3. Shared scene contracts remain canonical in `@math3d/core`.
4. Backend failures are diagnosable from in-app settings/diagnostics.
5. CI includes mobile checks and shared-package regression coverage.
