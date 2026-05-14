# Mobile Migration Implementation Plan

## 1. Objective
Ship a production-ready `apps/mobile` companion app (Expo + React Native) that can:

1. browse scene/gallery entries,
2. open a scene and preview meshes in 3D,
3. call the existing backend compute pipeline (`/api/worker/*`),
4. share the same scene/document contracts as desktop/web.

Execution note (May 15, 2026): implementation order is frontend-first, with backend integration intentionally moved to the final phase.

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

## Phase 4: Companion Feature Completion (4-6 days)
1. Add recent scenes list with search/sort.
2. Add lightweight function presets and quick-load to viewer.
3. Add settings panel: backend URL, render quality preset, cache clear, diagnostics.
4. Add crash-safe retry UX for backend failures/timeouts.

### Exit criteria
1. Companion workflow is usable without desktop.
2. Top 3 failure modes (network down, worker timeout, invalid payload) have clear user recovery.

## Phase 5: Stabilization + Release Readiness (4-6 days)
1. Performance profiling on representative devices (mid-range Android + iPhone).
2. Memory and frame-time tuning (mesh decimation defaults, resolution guards).
3. Test matrix and release checklist automation.
4. Internal beta build distribution.

### Exit criteria
1. Cold start, scene load, and preview operations meet agreed budget.
2. No blocker-level crash in smoke test matrix.

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
