# Graph2D gallery desktop/web acceptance — GGL01–06

**Accepted software scope — 2026-09-28:** shared catalog, generated previews and editable desktop/web launch. Mobile gallery GGL07–09 and the physical MOB-G13 release gate remain pending. See the [gallery roadmap](graph2d-gallery-presets-showcase-roadmap.md) and [architecture guide](graph2d-architecture-schema-algorithms-parity.md).

**Follow-up — 2026-09-29:** GGL07–09 mobile delivery and its physical Android/Electron walkthrough are recorded in [mobile acceptance](graph2d-gallery-ggl07-ggl09-acceptance.md). The pending mobile statements below describe this earlier desktop-only acceptance.

## Where to find it

Open **Graphs → Gallery** in the toolbar. An empty Graph also offers **Explore Graph Gallery**. Browse Featured, All scenes, Favorites or Recent; filter by category or search. Preview shows an explanation and learning goals. **Open** creates an independent editable Graph. **Preserved projects → Resume** restores previous work.

Favorites and Recent refer to catalog entries. Save and export edited scenes through the existing Kernel Workspace and Graph handoff controls. Editing a launched scene does not change its catalog template. The desktop renderer and browser app share this UI; an existing installer does not update until rebuilt.

## Delivered content

20 scenes cover all seven supported source kinds. Twelve scenes compare multiple objects; six are Featured. Every scene has a finite reviewed viewport/domain, explanation and editable canonical source.

| Category | Catalog IDs |
| --- | --- |
| Algebra | `line-comparison`, `translated-quadratic`, `cubic-extrema`, `repeated-root`, `reciprocal-pole`, `exponential-log` |
| Trigonometry | `sine-cosine`, `damped-wave`, `wave-beats` |
| Calculus | `sine-derivative`, `parabola-tangent` |
| Parametric | `circle-ellipse`, `lissajous`, `cycloid` |
| Polar | `polar-rose`, `archimedean-spiral`, `cardioid` |
| Implicit and regions | `implicit-conics`, `strict-disk` |
| Piecewise and data | `piecewise-data-gaps` |

Featured order: Beating waves, A tangent at x = 1, Lissajous loops, A three-petal rose, A cardioid, Implicit conics.

The reciprocal example deliberately excludes [-0.125, 0.125] with two restricted domains. Derivative, tangent and wave-envelope comparisons are fixed authored expressions, with that limitation visible in their descriptions. Polar radii retain their sign; the disk excludes its dashed boundary; missing data and open piecewise endpoints remain gaps. Shared parameter controls and animation belong to G2D38/GGL10.

## Contracts and preservation

- `math3d.graph2d-preset` v1 validates the full normal Graph template, digest, capabilities, exact keys and bounded point-table sidecars. Canonical AST/source/hash validation remains owned by the Graph parser. The frozen registry is initialized lazily so importing core in a sampling Worker does not construct the catalog.
- Each successful launch receives a fresh host random token and ordinary project identity. HTTP environments without `crypto.randomUUID` use `crypto.getRandomValues`. New gallery projects have no inherited handoff base.
- Before switching, the host checkpoints the live Graph and its direct promotions. Matching imported companion documents, results, relations and handoff ancestry are merged back from the retained payload. Unrelated desktop tabs remain with their host owners.
- The checkpoint index holds at most 32 inactive Graphs. A new launch at capacity fails before changing state. Resuming still works at capacity by moving the current Graph into the inactive index and the selected Graph out. There is no automatic eviction. This slice provides Resume, with collection/deletion management deferred to GGL11; exporting alone does not remove a checkpoint.
- Sidecars, active mixed workspace, handoff session, checkpoint index, bounded origin record and Recent update are written as one transaction before replacing live history. Injected write failures restore prior durable keys and leave the original Graph open.
- Favorites (128 IDs maximum) and Recent (32 maximum, deduplicated) are versioned host settings outside Graph source. Removed catalog entries retain an unavailable favorite entry. Invalid/future settings show an explicit reset action; quota failures do not present an unsaved star as saved.

## Preview and rendering baseline

The repository commits 20 SVG/PNG pairs generated from the shared sampler and world/screen transforms. The manifest records preset digest, recipe key and asset hashes. Recipe v1 uses a 320×180 viewport, 1024 samples, depth 12, tolerance 0.75 px and light theme. Combined compressed assets total **235087 bytes**, below the 2 MiB gate.

The static SVG cards create no live sampling Workers. SVG text is escaped, geometry is bounded/clipped, and previews retain segmented paths, missing rows, open endpoints and strict boundaries. Full explicit-domain coverage checks catch incomplete starter plots. PNG regeneration matches the committed bytes under this host's pinned Chromium; that is not a claim of pixel identity across browser versions.

Contract/catalog tests use independent analytic references for explicit, parametric and polar coordinates, plus a declared implicit residual bound (0.18 at the low-resolution test grid). Real browser Workers are compared with the Node sampler at absolute tolerance 1e-8 or relative tolerance 1e-12; structural fields and canonical source/display must agree exactly. These checks establish implementation parity, not a proof of the mathematical topology of an implicit contour.

## Verification evidence

| Gate | Recorded result |
| --- | --- |
| Focused contract/catalog/preview/session/preferences units | 34 tests passed, including rollback at every staged key, retained companions/results and full checkpoint capacity |
| Desktop Graph/history/persistence units | 131 tests passed |
| Mobile Graph model units | 227 tests passed |
| Existing parity corpus | 16 tests pass in each of two Node timezone contexts with identical report hash |
| Types | Full Node/renderer/E2E types, focused gallery types, strict shared parity/catalog types and mobile types pass |
| Production builds | Desktop renderer and browser builds pass |
| Electron gallery and handoff | Three gallery scenarios plus the existing desktop/mobile handoff scenario pass |
| Existing Electron Graph regression | 19 scenarios pass |
| Real browser Worker/UI | All 20 gallery scenes plus the existing 13-case corpus pass in `en-US`/UTC and `pl-PL`/Pacific Auckland; four scenarios total |
| Preview regeneration | All 20 SVG/PNG pairs verify exactly |

Electron scenarios exercise browse/preview focus restoration, ordinary edit/switch/resume/save, Favorites/Recent reload, an imported Curve promotion and result, injected storage failure, undo/redo and exported gallery edits returning through the mobile model and desktop file-import UI. Every gallery browser scene checks canonical source/display, a unique identity, rendered finite paths, required table rows and numerical Worker output. Workers return to zero after jobs; browsing a detail preview does not create one.

Desktop gallery captures, 390×740 browser layout and the 20-preview contact sheet were visually reviewed. The browser gallery has no horizontal overflow at the narrow size. Search receives focus; Escape restores the opener. This is focused keyboard/accessibility coverage, not a completed screen-reader audit.

Local evidence lives under `output/ggl06-*.log`, `output/ggl03-contact-sheet.png`, `output/ggl04-gallery-desktop.png` and `output/graph2d-gallery/`. Browser scene captures cover both contexts. Logs/captures are generated evidence; maintained test sources and preview fixtures are committed.

## Maintained commands

```powershell
npm run test:graph2d:gallery:acceptance
# Broader regressions:
npm run test:graph2d:desktop:unit
npm run test:graph2d:desktop:e2e
npm run test:graph2d:mobile:unit
npm --prefix apps/mobile run typecheck
npm run test:graph2d:parity
# Refresh assets only when catalog or preview recipe changes:
npm run generate:graph2d:gallery:previews
npm run test:graph2d:gallery:previews
```

The focused acceptance command includes unit/type checks, preview regeneration, full desktop types/build, actual Electron gallery tests, browser build and two-context browser gallery tests. The broader desktop E2E command now includes gallery scenarios.

## Remaining evidence and next work

GGL07–09 will add the shared catalog to the native project library and Graph workspace, ordinary mobile launch/storage and native acceptance. Current mobile projection/round-trip tests run in Node; no new APK installation or Android/iOS gallery walkthrough is claimed here. [MOB-G13](mobile-graphs-g13-readiness-2026-09-28.md) remains open with its previously recorded partial Android evidence.

Bundled desktop previews need no network. Browser tests also confirm browsing after the loaded app is placed offline; cold browser reload/install offline is not established by this gate. Publication exports, sliders, animation, personal collections and public viewers retain their separate roadmap milestones.
