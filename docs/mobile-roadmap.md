# MATH3D mobile roadmap

Updated September 19, 2026. This is the current forward plan for `apps/mobile`. The [functionality and navigation overview](mobile-functionality-navigation-overview.md) records what is implemented; the [migration implementation plan](mobile-migration-implementation-plan.md) records the earlier vertical slice. A roadmap item here is planned until its acceptance evidence is recorded.

## Product direction

MATH3D Mobile is an **offline-capable companion viewer, a network-backed compute client, and a lightweight scene editor**. It uses the shared `math3d.scene-project` contract. Local rendering and stored projects work without a worker; VTK, CGAL, volume, and later operations run through a reachable worker. Desktop authoring parity is outside this roadmap.

```text
Local projects + examples -> shared scene -> mobile viewer
                                         \-> compute job -> worker capability -> result/cache
                                                               \-> Analyze / View / Save
```

The intended navigation is **Home | Explore | Workspace | Projects | Settings**, with Workspace as the primary destination. Home earns its slot by showing Continue, recent projects, compute connection status, and quick actions; if that does not prove useful, fold its content into Projects. Explore becomes **Examples | Learn**, with Gallery and Functions backed by one example catalog. Workspace exposes **Scene | Object | View | Compute** first, then **Analyze** when it contains mathematical results. Only show an inspector section when it has a working purpose.

## Current-to-target corrections

| Current in build `150007` | Target | Reason / boundary |
| --- | --- | --- |
| Analyze shows preview, cache, and errors | **Compute** | Reserve Analyze for geometry, topology, mesh metrics, and overlays. |
| Files | **Projects** | These are serialized MATH3D scenes, not arbitrary files. |
| Explore has Gallery, Functions, Learn | **Examples, Learn** | Gallery and Functions both instantiate presets; one catalog supplies them. |
| Display offers Performance, Balanced, Sharp | **View** with Auto, Performance, Balanced, Quality, then helpers and shading | Rendering and camera operations belong to the view. |
| Reset camera and Fit under Object | Viewport toolbar / View | Camera is scene viewing state, not an object property. |
| An uncomputed implicit surface can show proxy geometry | Explicit **mesh not computed** state | A proxy must never resemble a mathematical answer. Cached results carry provenance. |
| Production fallback `127.0.0.1` | **No backend configured** | On a standalone phone localhost is the phone. Manual URL remains in Advanced. |
| 25-second request/retry | Persistent asynchronous compute job | Long operations need progress, cancellation, resume, and result retrieval. |
| Screen rendering and state lived in one `MobileApp.tsx` | Screen, workspace, viewer, service, storage boundaries | MOB26–27 split screens, the inspector, and navigation/workspace/project state. The controller still coordinates effects and service calls before Projects and jobs expand. |

## Phases and release gates

| Phase | Goal | Deliverable and exit evidence |
| --- | --- | --- |
| **M0 — beta baseline (P0)** | **Closed September 19, 2026:** Android `1.5.1`, build `150007` | Earlier `150002` and `150003` exposed navigation and last-viewed-scene restore defects; `150004` passed focused Samsung signoff. Build `150006` added internal LAN worker access and clearer connection errors. Its [matrix evidence](mobile-150006-release-matrix.md) records ten repeated Samsung cycles, Wi-Fi implicit preview, Files persistence, and shared-key CI. The [1.5.1 release record](mobile-1.5.1-release-readiness.md) has exact-build Samsung signoff, emulator smoke, encrypted off-device key backup, passing release CI, and a production-signed AAB published with SHA-256 on the [GitHub release](https://github.com/expert10000/Math3D/releases/tag/v1.5.1). |
| **M1 — structure and semantics (P1)** | Make the current app safe to extend | Split `MobileApp.tsx` into navigation, screens, workspace inspectors, viewer, services, and persistent state with behavior preserved. Rename Analyze→Compute and Display→View; move camera actions to viewport; remove misleading implicit proxy. Typecheck, navigation smoke, and offline/implicit-state checks pass. |
| **M2 — Projects (P1)** | Trustworthy offline project library | Rename, duplicate, reversible delete, real scene thumbnails, import/export/share. Before expanding import/export, add atomic save (temp file then rename), schema validation/migration, corrupt-project and storage-full recovery, and backup copy. Project cards show a rendered thumbnail, object count, and update time. Save/restore and failure recovery pass on device. |
| **M3 — compute platform (P1)** | Reachable, capability-driven worker jobs | Default to unconfigured backend; add desktop-to-phone QR pairing with temporary token and manual Advanced URL. Negotiate protocol/server versions and named capabilities before exposing actions. Submit jobs with operation, parameters, input hash, and engine identity; persist job IDs; support progress, cancel, retry, resume, diagnostics, and cache provenance. Test network loss and app background/restore. |
| **M4 — Workspace (P1)** | Useful multi-object scenes | Scene tree with selection, visibility, add/save; object rename, duplicate, hide, delete, opacity, information, and fit selection. Add a small viewport toolbar for fit selection, fit scene, reset view, and selection mode. Keep gestures for navigation and inspectors for scene/object properties. |
| **M5 — mathematical Analyze (P1)** | Genuine analysis on mobile | Add geometry (vertices, triangles, area, volume), topology (components, boundaries, manifold, Euler characteristic), and mesh health summaries when their data is valid. Add one heavy overlay at a time (curvature, normals, boundaries, non-manifold regions). Distinguish unavailable capability, stale result, and failed analysis. |
| **M6 — Explore and Learn (P2)** | Shared examples and contextual learning | One typed example descriptor (`id`, title, category, surface type, scene, capabilities, learn topic) drives presets, search, categories, capability filters, and learn cards. Learn starts alongside examples and analysis, not as an independent lesson platform. No remote catalog or submissions in this phase. |
| **M7 — lightweight authoring (P2)** | Create small scenes on a phone | Primitive creation first, then explicit and parametric formula entry with preview and domains, then implicit creation through compute jobs. Defer full transforms, mesh editing, and desktop CAD workflows. |
| **M8 — platform hardening (P2)** | Broader device/release readiness | Adaptive quality using frame time, mesh size, screen density, and memory pressure; large-mesh admission before GPU upload (full, reduced preview, remote simplify, reject); accessibility and layout matrix; lifecycle/storage/network cases; first validated iOS companion build. Set resource thresholds from measured devices. |

M0 is the release gate for a trusted baseline. M1 follows immediately. M2 and M3 can have separate implementation tracks after the M1 boundaries, while M4 should land before broad authoring. M5 depends on valid scene/compute results; M6 reuses the same scene catalog and analysis controls.

## Design contracts for the next packages

### Projects and examples

- Keep `math3d.scene-project` canonical. A project save must validate schema/version, write atomically, and recover from corruption or full storage with a specific user message.
- Generate thumbnails asynchronously after save from the actual scene. Cache by scene content hash, thumbnail camera settings, and renderer version.
- Define one `Math3DExample` descriptor containing scene, category/surface type, capability requirements, and optional learning topic. Bundled examples work offline.

### Compute and correctness

- An uncomputed implicit surface shows its formula, required capability, compute action, and a neutral domain/axes or empty viewport. It never displays a fake surface. A cached result shows computed time, resolution, worker/engine version, and stale state.
- Pairing supplies host, port, protocol, and short-lived token. Capability negotiation controls UI exposure; the existence of a typed API method does not imply the feature is available.
- Jobs retain operation, parameters, input hash, job ID, progress, result, and diagnostics. Persist job IDs across backgrounding and process death; cache keys include operation, inputs, scene/schema, and engine identity.

### Workspace and View

- Scene lists all objects with visibility and selection. Tapping an object opens Object; object actions are scoped to that selection. Camera actions live in the viewport toolbar or View.
- The mobile viewer now has adaptive XY/XZ/YZ reference planes through the origin with subtle fills and major/minor grids, colored X/Y/Z axes, persistent independent plane switches, Show all/Hide all, and an Axes switch. It also has persisted smooth and per-face curvature intensity colors based on neighboring triangle normals. View still needs Auto/manual quality, bounding box, wireframe/edges, and smooth/flat shading. Auto is measured on devices before it becomes the default.
- Analyze reports only mathematically meaningful, valid data; one heavy visual overlay at a time limits mobile GPU/memory cost.

## Planned commit sequence

The IDs below are planning labels. MOB24's exact-build Samsung signoff and
MOB25's shared internal and first production signing paths are implemented;
MOB26–27 are implemented on the mobile development branch;
remaining matrix and backup gates are tracked above. Each later commit should
include focused acceptance evidence.

| ID / phase | Planned commit |
| --- | --- |
| MOB24 / M0 | `test(mobile): freeze build 150006 physical-device baseline` |
| MOB25 / M0 | `build(mobile): establish shared internal and production signing paths` |
| MOB26 / M1 | `refactor(mobile): split monolithic app into screen and workspace modules` |
| MOB27 / M1 | `refactor(mobile): establish explicit navigation and workspace state boundaries` |
| MOB28 / M1 | `fix(mobile): rename preview diagnostics from Analyze to Compute` |
| MOB29 / M1 | `feat(mobile-view): replace Display with mobile view controls` |
| MOB30 / M1 | `fix(mobile-implicit): replace proxy geometry with explicit uncomputed state` |
| MOB31 / M2 | `feat(mobile-projects): add scene rename duplicate and reversible delete` |
| MOB32 / M2 | `feat(mobile-projects): add generated scene thumbnails and thumbnail cache` |
| MOB33 / M2 | `fix(mobile-storage): add atomic writes schema validation and recovery` |
| MOB34 / M2 | `feat(mobile-projects): add import export and native sharing` |
| MOB35 / M3 | `feat(mobile-compute): add worker capability negotiation` |
| MOB36 / M3 | `feat(mobile-compute): add desktop-to-phone worker pairing` |
| MOB37 / M3 | `feat(mobile-jobs): introduce asynchronous compute job lifecycle` |
| MOB38 / M3 | `feat(mobile-jobs): add progress cancellation retry and resume` |
| MOB39 / M3 | `feat(mobile-cache): key computed results by input operation and engine identity` |
| MOB40 / M4 | `feat(mobile-workspace): add scene object list and selection workflow` |
| MOB41 / M4 | `feat(mobile-workspace): add rename duplicate hide and delete object actions` |
| MOB42 / M4 | `feat(mobile-viewer): add mobile viewport action toolbar` |
| MOB43 / M5 | `feat(mobile-analysis): add geometry topology and mesh summaries` |
| MOB44 / M5 | `feat(mobile-analysis): add single-overlay visualization model` |
| MOB45 / M6 | `feat(mobile-explore): unify presets and gallery under shared example catalog` |
| MOB46 / M6 | `feat(mobile-explore): add search categories and capability filtering` |
| MOB47 / M6 | `feat(mobile-learn): add contextual learn cards and interactive examples` |
| MOB48 / M7 | `feat(mobile-create): add primitive creation` |
| MOB49 / M7 | `feat(mobile-create): add explicit and parametric surface editor` |
| MOB50 / M7 | `feat(mobile-create): add implicit formula creation through compute jobs` |
| MOB51 / M8 | `perf(mobile): add adaptive render-quality controller` |
| MOB52 / M8 | `perf(mobile): add large-mesh admission and simplification workflow` |
| MOB53 / M8 | `test(mobile): expand layout lifecycle accessibility and network matrix` |
| MOB54 / M8 | `feat(mobile-ios): establish first validated iOS companion build` |

## Verification matrix to grow with the roadmap

Keep the existing Android CI typecheck, APK/signature/hash checks, 320×640 emulator navigation/inspector smoke, and physical-device signoff. Add representative 360×800 and 412×915 portrait, 800×360 landscape, 1.3–1.5× font scale, long titles/errors, expanded inspector, open keyboard/editor, and dark/light appearance. Add lifecycle cases for compute background/foreground, network loss, GL context loss, process kill/restore, corrupt scene, storage full, and cache full. Use Samsung `SM-A566B` as the current physical baseline, then add small/current iPhone targets when iOS work begins.
