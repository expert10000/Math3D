# Graph2D gallery, presets and showcase roadmap

**Status:** GGL01–09 implemented: desktop/web gallery and native browse/launch, all-catalog model checks and a physical Android/Electron walkthrough accepted. GGL10–18 remain planned; full MOB-G13 release evidence remains pending. Next: G2D36 publication export. See [desktop/web acceptance](graph2d-gallery-ggl01-ggl06-acceptance.md) and [mobile acceptance](graph2d-gallery-ggl07-ggl09-acceptance.md).

**Decision — 2026-09-28:** build a focused editable gallery now, after G2D35 and before G2D36. Deliver shared contracts/content and desktop/web first (GGL01–06), then mobile launch from the same catalog (GGL07–09). Continue the professional features afterward. Keep MOB-G13 physical acceptance open throughout.

**Authority:** [the Graph2D roadmap](math3d-graph2d-desktop-mobile-roadmap.md) owns overall sequencing and release gates. This companion owns gallery content, launch behavior and acceptance. It adapts the supplied `MATH3D_GRAPH_GALLERY_PRESETS_SHOWCASE_ROADMAP.md` proposal to the existing [architecture](graph2d-architecture-schema-algorithms-parity.md); the proposal's sample types and package layout are design input.

## 1. Why now, and how much

The shared engine already supports explicit, parametric, polar, implicit, inequality, piecewise and point-series objects. Desktop/web and mobile can edit them, persist ordinary Graph projects and exchange checkpointed workspaces. Users currently have a mostly empty desktop starting point and a mobile line starter. A discoverable collection makes the delivered mathematics easier to try and provides useful real-scene regression coverage.

An initial gallery does not depend on SVG/PNG export, logarithmic axes, statistical fitting, sliders or animation. It needs reliable creation, meaningful viewports, accurate previews and protection of existing work. These are the next product priorities. The original proposal's entire 37-step program would delay that useful slice.

### Revised delivery order

| Order | Delivery | Reason |
| --- | --- | --- |
| Delivered | GGL01–06: shared catalog, 20 reviewed scenes, generated previews, desktop/web gallery and acceptance | Make the implemented engine discoverable and editable |
| Delivered | GGL07–09: mobile gallery, ordinary project creation and native acceptance | Reuse desktop-proven content without a second preset engine |
| Next | G2D36: publication export | Supports personal scenes, teaching and reproducible captures |
| Then | G2D38, followed by GGL10: shared parameters/animation and gallery integration | One parameter implementation serves authoring and examples |
| Then | G2D37, G2D39, G2D40 | Scale policies, reviewed statistics and professional acceptance |
| Later | GGL11–18 | Personal collections, lessons, presentation, public viewing, home discovery and cross-module adapters |

G2D identifiers stay unchanged; execution order explicitly brings G2D38 forward after G2D36 because interactive examples have higher immediate value than additional scales. GGL10 does not block G2D37. Detailed later dependencies are listed below. G13 device work can proceed when devices/artifacts are available; passing gallery software checks never freezes that gate.

## 2. Reuse and ownership

| Concern | Planned owner and existing contracts |
| --- | --- |
| Catalog manifest, validator, lookup/filter and instantiation | `packages/core/src/graph2dPresets.ts` and `packages/core/src/graph2dPresets/`; no new `packages/graphs` mathematical domain |
| Mathematical payload | Existing `Graph2DDocument` v1 template; shared parser, authoring, identity and validation |
| Edit/history | Existing kernel Graph command adapter; no catalog-only edit state |
| Desktop/web gallery | `renderer/src/graph2d/`, integrated with `App.tsx` Graph document/history ownership |
| Native gallery/launch | `apps/mobile/src/` plus the existing project library, storage and Graph creation model |
| Preview generation | Build script over shared sampling and derived geometry; assets bundled for offline use |
| Project sharing | Existing raw Graph/mixed workspace and `math3d.project-handoff` v2; external bytes remain explicit |
| Personal state | Host local settings for favorites/recent catalog IDs; ordinary project library for saved user graphs |

Geometry scene galleries and mobile example filters are useful UX references. Their renderer-owned geometry recipes, timelines and surface capability filters do not become Graph mathematical source. Reuse suitable UI components or filtering utilities where practical; extract a cross-module abstraction only after a second adapter has a concrete use case.

### Preset manifest v1

A preset is an immutable catalog entry with a validated complete mathematical scene. Store:

- `format`, `schemaVersion`, stable catalog `id`, content `version` and a digest;
- title, concise explanation, category, tags, difficulty, learning goals and featured order;
- a **normal Graph document template** containing source/AST, named values, domains, viewport and display intent;
- optional bounded point-table sidecars with the existing IDs/checksums/encoding;
- required Graph capabilities computed from the template, and a cost class determined by acceptance measurements;
- preview asset descriptors tied to the template/content digest and preview recipe version;
- attribution/source/license metadata for contributed content and derived promotional assets.

Do not create another `GraphExpression[]`, evaluator, formula parser, graph document or handoff revision scheme. Authoring helpers may construct canonical templates using existing core functions. Built-in multi-object scenes are supported from the first catalog version; they are not postponed until an interactive release.

Suggested initial admission bounds: 128 catalog entries, 128 KiB per manifest/template excluding sidecars, 16 tags and 6 source objects per starter. Existing document/expression/table limits remain enforced. Initial data examples use at most 128 rows; bundled sidecars must also pass the existing table size/checksum validator. Later limits change only with measured host evidence.

Catalog IDs/content versions identify examples, not user projects. The template's deterministic identity supports fixtures and preview generation. Each successful Open creates a **fresh project/document identity** through existing factories; local object IDs may remain stable inside that new document. Recompute/validate identity and source-linked references. Opening twice must not collide or accidentally acquire another project's handoff ancestry. Companion workspaces, if later admitted, require complete document/reference remapping before acceptance.

Favorites and recent catalog records live outside the canonical Graph payload. A catalog update does not mutate previously created projects. If an item disappears, user projects remain editable and favorite records show an unavailable entry or are cleanly pruned. Keep origin/version/digest in a bounded host launch record; extending portable provenance requires a reviewed schema migration rather than adding unknown Graph fields.

### Unsupported experiences are explicit

Named numeric values exist today. Persisted control ranges/units, slider transactions and animation depend on G2D38. Do not promise live sliders in initial cards. General arrows/labels, guided lesson state, Newton iteration, Riemann sums and integral accumulation are future work unless represented honestly by supported static objects. No source expression calls another labeled function, derivative notation or a host callback. A function-plus-derivative scene can use two explicitly authored expressions and explain the relationship.

Implicit equations use the current residual representation (`x^2+y^2-1`), not an invented equation parser. An implicit graph may link to a related Surface example later; current Graph promotion accepts supported explicit/parametric profiles and does not promote arbitrary implicit sets. Point data ships as validated sidecars rather than unexplained missing references.

## 3. Initial mathematical collection

Target **20 accepted scenes**, including all seven kinds, at least six multi-object comparisons and six visually distinctive featured entries. Add more only after their checks pass. Featured selection favors readable mathematics and mobile workload bounds; animation is not required for a good preview.

| Collection | Initial scenes | Count |
| --- | --- | ---: |
| Algebra and elementary | Line comparison; translated quadratic; cubic with extrema; repeated-root polynomial; reciprocal/pole; exponential/log comparison | 6 |
| Trigonometry | Sine/cosine comparison; damped oscillation; beats | 3 |
| Calculus | Sine with its explicitly authored derivative; parabola with a fixed tangent | 2 |
| Parametric | Circle/ellipse comparison; Lissajous; cycloid | 3 |
| Polar | Rose; Archimedean spiral; cardioid | 3 |
| Implicit and regions | Circle/hyperbola comparison; strict disk region | 2 |
| Piecewise and data | Piecewise endpoint/gap scene containing a small point series with a missing-row gap | 1 |
| **Total** | All seven kinds; piecewise and data coexist in one supported scene | **20** |

Every scene supplies a useful viewport, finite domains, legible styles, an explanation, applicable limits and an edit/analysis suggestion. Use the normal Analyze UI for requested calculations; opening a gallery scene does not silently compute or label a stored analysis result as current. Keep poles, missing rows, open endpoints and strict boundaries visible in both preview and live view.

Follow-on content: parameter families, Taylor polynomials with documented order/interval, finite harmonic sums, epicycloids/hypocycloids, astroid and heart/butterfly scenes after budget review. Newton iteration, accumulation functions, statistical fits and general guided overlays need their corresponding domain/workflow support. Expand to 12–20 flagship scenes after these experiences are available; initial Featured contains six reviewed static scenes.

## 4. Gallery UI and launch contract

### Desktop/web first

Expose **Gallery** in the Graphs workspace toolbar and on its empty-state view. A gallery panel offers Featured, category chips, search and a concise detail preview. Search title, tags and description; categories describe mathematical topics while kind badges expose capabilities. Cards have **Open**, **Preview** and **Favorite**. Open already creates a fresh editable copy, so a separate Duplicate action is reserved for saved user projects.

Preview is read-only and commits nothing. Opening must retain the current Graph and its promotion companions/results through the existing workspace checkpoint/storage path before activating the new project. Preserve the existing Graph adapter/history and active UI if validation, sidecar staging or persistence fails. When backing is unavailable, offer a clear explicit replacement/save flow. Never silently overwrite current work or discard imported companions. Show where the preserved project can be resumed. This path needs real UI tests, not only a factory test.

Gallery selection is transient; source and viewport changes after launch use ordinary authoring commands. Close returns focus to the entry control. Loading/missing assets have useful text fallbacks. Users can read descriptions and use the catalog with a keyboard or screen reader; distinguish curves with labels/line styles as well as color.

### Mobile next

Expose **Graph Gallery** in Projects → New Project and **Gallery** in the Graph workspace. Feed both from the same core catalog. Reuse the existing Explore content surface for featured discovery through an adapter, without replacing the established Home/Explore/Workspace/Projects/Settings navigation.

One tap on Open validates the preset and sidecars, saves a new ordinary offline Graph project, then enters Workspace. A generated title is sufficient; renaming remains available later. Cancel/preview creates no project; failed persistence leaves the active project unchanged. Current edits must be checkpointed or explicitly kept before switching. Sidecars stage with the project and roll back on failure; never leave half-created entries. Save/export/desktop reopen use the existing contracts.

Use accessible category chips and bounded static previews. No autoplay carousel or swipe gesture may compete with plot pan/pinch. A later dedicated showcase can use manual swipe with accessible Next/Previous, reduced-motion behavior and strict adjacent-item prefetch.

## 5. Preview, performance and acceptance rules

Generate thumbnails from the exact validated template with the shared sampler at a fixed viewport/size, theme, sampling budget and preview algorithm version. Initial preview recipe: 320×180, at most 1024 scene samples and bounded line/fill output; tune only through reviewed recipe changes. Reject unsuitable featured output or adjust its domains/viewport within that budget rather than concealing incomplete geometry. Known mathematical gaps are retained and explained.

A build adapter produces sanitized SVG for desktop/web and raster derivatives for native image cards. It does not implement separate mathematics. Escape labels and allow no arbitrary imported SVG/HTML or script. Native delivery bundles the chosen assets; no network or Metro service is needed to browse/open the gallery. Cap initial compressed preview assets at 2 MiB total and test the produced manifest against missing/stale assets.

Derive preview keys from source/display, sidecar checksums, content/recipe versions and theme. Deterministic here means repeatable recipes and semantic geometry within declared numerical tolerances. Pixel baselines require a pinned renderer/font environment; do not demand identical pixels across browser/native hosts. Check shape and segmentation as well as screenshots. User/project sampling and analysis artifacts never become preset source.

Cards use static images; opening the catalog starts **zero live graph sampling jobs**. A selected preview may start at most one bounded job, cancelled on replacement/close. Initial card collections are paged or bounded; virtualization is introduced when measured scale requires it. Tests verify worker/frame/timer cleanup, image cache bounds and no all-card renderer initialization from the first release. Keep local recent/favorite records bounded (32 recent IDs); no telemetry is introduced.

Reuse the G2D34 pathological corpus as an oracle source, not as a direct marketing catalog: extreme/deadline/corruption recipes remain QA cases. Each public item also gets analytic/reference or residual checks, gap/endpoint checks, portable save/reload, independent launch identities, and at least one intended edit. Low-profile projection must remain interpretable; heavy examples are marked or withheld on a host that cannot satisfy the declared experience.

## 6. Reviewable commit sequence

Every GGL ID is a reviewable commit. Focused types/tests and stated UI evidence complete it. Commit and push each delivered milestone independently. Delivery is recorded explicitly below.

### Release A — Desktop/web gallery now

| ID | Planned commit | Scope and acceptance |
| --- | --- | --- |
| **GGL01** | `feat(graph2d-presets): add shared versioned catalog contract and instantiation` | Implemented shared core contract, immutable registry, canonical template/sidecar validation and fresh launch-token identities. Four contract tests and strict shared typecheck pass. |
| **GGL02** | `feat(graph2d-presets): add curated seven-kind starter scenes` | Implemented 20 canonical seven-kind scenes, at least eight multi-object comparisons and six Featured entries. Reference-math, gaps/endpoints/strict fills, 512/1024 sample bounds, low-profile projection and portable editable-copy checks pass (25 catalog/contract tests); strict typecheck passes. Generated visual review follows GGL03. |
| **GGL03** | `feat(graph2d-gallery): generate reproducible offline preview assets` | Implemented 20 generated SVG/PNG pairs from shared sampling/transforms with source/recipe/asset hashes, safe text, gaps/open/strict markers and a 235087-byte compressed bundle. Contact sheet reviewed; domain adjustments and interval-coverage checks prevent truncated starters. Preview/catalog tests and strict types pass; deterministic regeneration checked. |
| **GGL04** | `feat(graph2d-gallery): add desktop web browse preview and safe project launch` | Implemented visible desktop/web toolbar and empty-state Gallery, static Featured/all/category/search/detail views, fresh project launch and preserved-workspace resume. Transaction rollback retains live state on failures and saves imported companions/results/ancestry in normal checkpoints. 30 focused tests, full renderer/focused types, production build and real Electron edit/switch/resume/save/focus scenario pass; gallery screenshot reviewed. |
| **GGL05** | `feat(graph2d-gallery): add local favorites recent items and discovery states` | Implemented host-local bounded Favorites/Recent collections, star state, empty/search states, unavailable-entry handling and explicit corrupt-settings reset. Recent IDs join the launch transaction; no Graph payload or parallel user save store is added. 33 focused tests, focused types and two Electron browse/edit/resume/favorites/reload scenarios pass. |
| **GGL06** | `test(graph2d-gallery): freeze desktop web catalog launch and rendering baseline` | Implemented desktop/web baseline: all 20 scenes exercise actual browser Worker/UI in two locale/timezone contexts; Electron preview/open/edit/undo/save/handoff/reopen, retained companions/results, rollback and checkpoint capacity pass. 34 focused tests, broader desktop/mobile regressions, types/builds and preview regeneration pass. See [desktop/web acceptance](graph2d-gallery-ggl01-ggl06-acceptance.md). |

### Release B — Mobile from the same catalog

| ID | Planned commit | Scope and acceptance |
| --- | --- | --- |
| **GGL07** | `feat(mobile-graphs): add shared offline gallery browse and previews` | Implemented native Projects/New Project and Graph Workspace entries, static bundled PNG cards from the shared catalog, Featured/all/category/search/detail browse, native labels and scrolling phone/short-height/tablet/large-text layout policy. 229 mobile model tests (including two gallery discovery/layout tests) and mobile types pass; production Android Metro export includes all 20 previews. Preset launch is recorded under GGL08; native acceptance under GGL09. |
| **GGL08** | `feat(mobile-graphs): launch presets through ordinary project persistence` | Implemented one-tap fresh ordinary saved Graph projects, staged/checksum-validated sidecars with rollback, duplicate-launch protection and one atomic library write preserving current Graph/scene edits and retained Graph companions/ancestry. Existing save/reopen/share/export controls remain in use; failed first saves cannot resurrect a new project from backup. All 256 mobile tests and strict mobile/shared types pass. Native acceptance is recorded under GGL09. |
| **GGL09** | `test(graph2d-gallery): freeze mobile launch and desktop return parity` | Implemented all-20 model launch/edit/undo/restart/return checks, 276 mobile and 131 desktop tests, three Electron Gallery cases and one actual Android-export/Electron-return case. Rebuilt/installed internal APK; six native scenes cover seven kinds, saved edits survive reopen, native import retains a separate return copy. Basic landscape/large-text captures recorded; full focus/iOS/tablet/G13 release evidence remains pending. See [mobile acceptance](graph2d-gallery-ggl07-ggl09-acceptance.md). |

### Release C — Interactive, personal and educational

| ID | Planned commit | Depends on | Scope and acceptance |
| --- | --- | --- | --- |
| **GGL10** | `feat(graph2d-gallery): connect presets to shared parameter and animation controls` | G2D38, GGL06/09 | Recommended bounded ranges/steps/units reference real shared parameters; transient scrubs and one committed step, deterministic reset/playback/cancel/background, locale-neutral persistence and capability preview. Animation is opt-in; no second scheduler. |
| **GGL11** | `feat(graph2d-gallery): add personal collections over saved Graph projects` | GGL05/09 | My Graphs uses existing projects; add Save as reusable copy/fork and project favorites without a parallel save store; retain sidecars and provenance/conflict semantics. |
| **GGL12** | `feat(graph2d-gallery): add checked portable personal preset exchange` | GGL11 | Reuse Graph/handoff files; optional bounded catalog metadata goes through a versioned validator. Imported content previews before acceptance; descriptors do not imply embedded sidecars/results. No general executable lesson format. |
| **GGL13** | `feat(graph2d-gallery): add guided concept collections and source-linked annotations` | GGL10, reviewed annotation schema/capabilities | Derivative/integral/asymptote/Taylor explanations, beginner/intermediate/advanced paths; add only supported bounded annotation primitives, staleness and keyboard/native parity. Requested results retain numerical confidence. |
| **GGL14** | `feat(graph2d-showcase): add presentation mode and reproducible capture recipes` | G2D36, GGL06 | Clean graph view with accessible exit/controls; source/view/theme/window capture recipes, attribution and incomplete-result labeling; public export uses G2D36, not a thumbnail-only pipeline. |

### Release D — Discovery and optional expansion

| ID | Planned commit | Depends on | Scope and acceptance |
| --- | --- | --- | --- |
| **GGL15** | `feat(graph2d-sharing): add bounded read only graph viewer and open workflow` | GGL12, explicit transport/hosting design | Validate bounded existing Graph payloads in a viewer route, capability/missing-data states, Open/Duplicate/Edit. Choose file/local/static content versus hosted links explicitly; no server, upload or publication is implied by this roadmap. |
| **GGL16** | `feat(graph2d-discovery): add featured home explore and manual showcase navigation` | GGL06/09, GGL10 for animated items | Reuse host Home/Explore surfaces; curated ordering and optional rotation of cards, manual swipe/Next/Previous, reduced motion, offline opening and bounded adjacent previews. No autoplay math or tracking. |
| **GGL17** | `refactor(gallery): add cross module catalog adapters and related scene links` | Proven Graph catalog and a selected second module | Keep each module's normal document/factory; share manifest/query/card contracts only where useful, capability-checked relations, no claimed implicit-to-Surface promotion. |
| **GGL18** | `perf(graph2d-gallery): virtualize measured large catalogs and bound preview retention` | Measured need beyond initial collection | Profile scrolling/image retention/startup and introduce virtualization/lazy loading with before/after evidence. Initial static-card/job/cache limits remain mandatory before this commit. |

Later releases are scoped follow-ons. Do not hold Release A until personal presets, all lessons, home promotion or a generalized Gallery exist.

## 7. Disposition of the supplied proposal

The `GRPH-Gxx` IDs identify the input proposal only. Executable repository work uses GGL IDs and existing G2D IDs. This mapping preserves its intent while consolidating duplication and changing dependencies.

| Proposed IDs | Integrated disposition |
| --- | --- |
| GRPH-G01–03 | GGL01 and GGL06; canonical templates/registry validation and host regressions |
| GRPH-G04–05 | GGL02; algebra/trigonometry now, slider families after G2D38/GGL10 |
| GRPH-G06 | Static supported comparisons in GGL02; guided/live calculus after GGL10/13 and required algorithms |
| GRPH-G07–09 | Curated parametric/polar/implicit content in GGL02; arbitrary implicit promotion remains unsupported |
| GRPH-G10–12 | GGL03–05; actual previews, gallery UI and local discovery delivered together |
| GRPH-G13–14 | One shared G2D38 implementation, integrated through GGL10 |
| GRPH-G15 | Multi-object canonical scenes in GGL01–02 from the start; richer annotation capability in GGL13 |
| GRPH-G16–17 | GGL07–09; same catalog, ordinary mobile persistence, evidence |
| GRPH-G18 | GGL16; dedicated manual showcase after the basic mobile flow |
| GRPH-G19–20 | GGL11; use the project library for My Graphs and saved copies |
| GRPH-G21–22 | Existing G2D06/31/33 persistence/handoff plus GGL12; no second portable Graph source format |
| GRPH-G23–24 | GGL15, with a separate explicit transport/hosting decision |
| GRPH-G25–27 | GGL13; initial category/difficulty metadata already in GGL01 |
| GRPH-G28 | Six Featured static items in GGL02; expand to 12–20 reviewed flagship scenes through GGL10/13 |
| GRPH-G29–30 | GGL14 after G2D36; generated thumbnail recipe already GGL03 |
| GRPH-G31–32 | GGL16; integrate existing home/explore surfaces |
| GRPH-G33–34 | GGL17 when another module supplies a concrete adapter |
| GRPH-G35 | Start in GGL02/03 and freeze in GGL06/09; regressions cannot wait until the end |
| GRPH-G36 | Static/bounded previews mandatory in GGL03/04/07; measured large-list virtualization in GGL18 |
| GRPH-G37 | Local favorites/recent in GGL05/11; keep usage data outside mathematical payloads |

## 8. Initial gallery definition of done

1. Desktop/web users discover Gallery from Graphs without knowing a hidden panel path.
2. All 20 reviewed scenes open as fresh normal editable projects; previews do not mutate existing work.
3. Existing source, promotion companions, results and data survive switching away and reopening; failed launch is atomic.
4. Preview mathematics agrees with the live view within declared tolerances; poles/gaps/open/strict boundaries remain honest.
5. Browsing has no per-card live renderers, works offline and passes keyboard, responsive, asset-size and cleanup checks.
6. Mobile uses the exact same catalog/default source and normal project storage; native evidence is reported separately from model tests.
7. Gallery-origin projects remain valid when catalog content changes and round-trip through existing desktop/mobile contracts.

The initial gallery is accepted separately from Graph2D v1's physical release freeze. Production mobile release claims still require exact rebuilt artifacts and MOB-G13 evidence.
