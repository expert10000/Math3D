# Graph2D gallery GGL07–09 acceptance

**Accepted scope — 2026-09-29:** shared native browsing, ordinary saved-project launch, all-catalog model round trips and the Android/Electron walkthrough described below. [Desktop/web acceptance](graph2d-gallery-ggl01-ggl06-acceptance.md) remains applicable. [MOB-G13](mobile-graphs-g13-readiness-2026-09-28.md) remains pending.

## Finding Gallery

- Mobile: **Projects → Graph Gallery**, **Projects → New Project → Graph Gallery**, or **Graph workspace → Gallery**.
- Desktop/web: **Graphs → Gallery**, or **Explore Graph Gallery** in an empty Graph.
- Featured, all scenes, categories, search and detail previews use the same 20-scene catalog. Native PNGs are bundled; browsing starts no live sampling jobs. Opening creates an editable copy in the normal project library.

## Launch and persistence contracts

Each launch instantiates a fresh canonical Graph document. Source, display and selection come from the shared template; discovery metadata stays outside the project. Current committed Graph or scene changes and any Graph workspace companions/results/import ancestry are saved before switching. Unfinished function drafts must be applied or cancelled before Gallery opens. The controller prevents simultaneous launches and switches only after persistence succeeds.

Point-table sidecars are checked before launch, staged at their normal content-addressed location and rolled back if the library write fails. Existing valid tables are reused; corrupt existing files are retained with an explicit failure. The first library save now commits its primary file before initializing backup, so a failed first write cannot resurrect an unaccepted preset on restart. Ordinary Save, reopen, Export and Share controls remain in use. Personal point-data sidecars still transfer separately from project references.

## Automated checks

| Check | Result |
| --- | --- |
| Mobile model/service suite | 276 tests in 50 files passed |
| Desktop Graph units | 131 tests in 33 files passed |
| Per-preset launch/return cases | All 20 preserve source/display, checked data, independent IDs and normal restart/export behavior; undo/redo uses monotonic revisions |
| Strict types | Mobile, shared parity/catalog/launch contracts, focused renderer gallery, full Node/renderer/E2E passed |
| Generated previews | 20 SVG/PNG pairs checked, 235,087 compressed bytes |
| Node parity | 16 tests each under UTC and Pacific/Auckland; identical report digest `74b2dea28ada11fe283a234c278591e6c1ab51488bad6269d994a865917a90b2` |
| Electron Gallery | Three existing browse/launch/preservation/favorites tests passed |
| Actual Android export → Electron | One dedicated native-file import/edit/return test passed |
| Embedded Android build | Successful internal APK build; all 20 preview PNGs bundled |

The physical-file runner requires an explicit fixture path and fails if it is absent. The general E2E suite skips this opt-in case when no native export is supplied; that skip is not native acceptance.

```powershell
$env:MATH3D_GALLERY_NATIVE_HANDOFF = (Resolve-Path docs/evidence/mobile-gallery-2026-09-29/native-two-slopes.handoff.json).Path
npm run test:graph2d:gallery:mobile:acceptance
```

The archived fixture reproduces the accepted import/return check. A new physical acceptance run must produce a fresh export from the tested handset/artifact. Detailed logs remain under `output/ggl09-*.log`.

## Physical Android scope

Device: Samsung **SM-A566B**, Android **16**, **1080×2340**, density **450**. Application: `com.math3d.mobile.internal`, version **1.5.1-internal**, build **150007**. Installed using `adb install -r`, preserving the existing project library.

Exact installed APK: `artifacts/mobile/Math3D-mobile-1.5.1-internal.apk`, SHA-256 **`be31dc2ea82ccaa83990a993b38ca29a56a258a746191f81f4df47f2b7d16b9c`**. Build parent: `beafd37a798d150254c454cbed080b6dc480e412`, with the GGL09 native Gallery changes present. Runtime file `apps/mobile/src/MobileGraphGallery.tsx` SHA-256: **`694ffbbab9c49e596a00cb6bc089a2782fd82ebec2fafbf8ba43d4273b179013`**. Build metadata correctly records a dirty source tree; this is an internal walkthrough artifact, not a clean production G13 release candidate.

Native fixes found during the walkthrough: modal window/inset handling, preview dimensions derived from measured content width, keyboard avoidance and Android Back dismissing the search keyboard before closing Gallery. Scrollable content mounts after the native modal is shown, so its first viewport uses the displayed dialog's layout. Fresh Featured browsing now scrolls without first opening the keyboard; search is not a prerequisite for reaching preview/open controls.

Reviewed native coverage:

- Projects and workspace entry, Featured/search, static detail, close/cancel and keyboard dismissal.
- Six opened examples covering all seven source kinds: **Two slopes**, **Lissajous loops**, **A three-petal rose**, **Implicit conics**, **Inside, excluding the boundary**, **Endpoints and missing data**.
- A fresh **Beating waves** launch on the final APK verified creation/preservation from Featured without a search or keyboard interaction. All seven saved examples were reviewed on this final build.
- Live plots show signed polar geometry, implicit contours, dashed strict-disk boundary, open piecewise endpoint and the measured-series gap. Numerical fills/contours remain approximations.
- Edited Unit slope to `4*x`, verified the pending-draft guard, applied, undid/redid and saved. Other Gallery launches retained this saved project.
- Landscape Gallery changes to two columns; portrait at font scale 1.5 retains the heading, close button, search and horizontally scrolling categories. Native search, vertical scrolling and detail preview were exercised at that size. This is basic layout evidence, not a full TalkBack focus audit.
- Process stop/relaunch reopened the saved data example with its gap intact. Export used the native directory picker; Share opened the native chooser and was cancelled without sending.

Representative captures and actual handoff bytes are archived in [the evidence folder](evidence/mobile-gallery-2026-09-29/). System rotation and font preferences were restored to `accelerometer_rotation=1`, `user_rotation=0`, `font_scale=1.0`.

## Real phone export and desktop return

The normal Android Export control produced the **Two slopes** handoff with Unit slope `4*x`, mobile producer and `baseRevision=null`. SHA-256: `c135ce1f9d07f12e3224f4fbfeaf7f4d0256dda141bbb31d3ebc1af9d0b3bae0`.

The built Electron app imported those exact bytes through its normal handoff input and saved the entire Graph checkpoint unchanged, including source, display, selection and identity. It rendered a finite curve, edited Unit slope to `5*x` and exported through Electron's normal download path. The return preserves the project ID and declares the Android project revision as its base. Return SHA-256: `947d550ad3a9d7989438a90294f89e329cfebbfd451879d722a0d740eb67348e`.

The shared mobile import model then accepted that return, committed a viewport edit, exported again and passed the existing replacement ancestry validator. The physical phone imported the returned file through **New Project → Graph project file**, created **Two slopes import 2**, and displayed `5*x` in its native editor. Reopening the original **Two slopes** displayed `4*x`. Ordinary Graph-file import creates a separate copy when IDs collide; this walkthrough does not claim a native replacement of the original project.

## Remaining release evidence and next work

Physical iOS, iPad and Android tablet gallery evidence, the full screen-reader/focus audit, production signing, six-slot G13 matrix and calibrated repeated workloads remain pending. All 20 examples were checked in models; seven examples were opened on this phone. Bundled previews/build verification establishes offline availability; this run did not disable the phone's networks to claim an offline cold-start test.

Next implementation is **G2D36 publication export**, followed by shared G2D38 parameter/animation work and its GGL10 integration. GGL10–18 remain planned in the [gallery roadmap](graph2d-gallery-presets-showcase-roadmap.md).
