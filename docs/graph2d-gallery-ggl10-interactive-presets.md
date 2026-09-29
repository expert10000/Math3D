# GGL10 — Interactive gallery copies

Implemented 2026-09-29 using the shared G2D38 parameter, authoring, sampling and animation contracts. Desktop/web UI and native storage/model/bundle checks are covered below. This is not physical Android/iOS acceptance or an updated installed APK.

## Using the gallery

Desktop/web and mobile: **Graph Gallery → Preview → Open interactive [scene] → Parameters**. Ten cards advertise interactive copies. Preview remains a bundled static image of the default mathematics; it starts no live sampler or animation. Details describe the changed expressions and list required capabilities, including `graph2d.parameters.v1`.

Controls are immediately configured: drag/type a transient preview, **Apply preview value** to commit one reversible value, or **Cancel preview** to restore committed source. **Preview default [name]** previews that recipe's original value; it does not silently save. Apply it explicitly if desired. Other parameters remain at their committed values.

Recommended animation starts only on **Play animation**. **Reset recommended animation** cancels playback, restores the committed graph and resets the suggested parameter/from/to/frame/FPS fields without making a source command. Stop leaves an explicit preview. Close, view/source replacement, unmount and background cancel playback; background restores the committed graph. Both hosts use `Graph2DAnimationPlayer`, not a gallery scheduler. Existing frame reports, manifests, save/reopen and Graph handoff remain available.

### Fix: returning to an edited desktop preset

Previously, every **Open** created a fresh template copy, even when the user had already edited that preset. It appeared to reset the graph; no whole-window restart was involved.

Desktop/web **Open** now returns to the current associated copy, retaining its live adapter/history, or resumes the most recently preserved associated copy. After an app reload, the last saved associated gallery workspace is also discoverable. Cards/details say which behavior applies. **Preview → Open fresh copy** (or **Open fresh interactive copy**) explicitly starts from defaults with a fresh identity while preserving current work. Static v1 and interactive v2 copies are distinguished. Favorites/recent remain catalog IDs, not project storage.

Host-local gallery checkpoints v2 retain the existing bounded launch association (`presetId`, content version and digest) alongside the same ordinary workspace/ancestry. Transactions retain rollback, sidecars, companions, results and the 32-checkpoint bound. Old v1 checkpoints still resume through **Preserved projects**; if they lack an association it is not invented from mathematical source. Returning to a preserved project resets its live undo history as before, but does not reset saved source/values/view.

Native **Open** continues to create an ordinary fresh saved project; open an edited native project from **Projects**. No separate native preset-save store or personal collections feature is introduced.

### Fix: cursor-anchored desktop zoom

The React delegated wheel listener was passive: its `preventDefault()` could not reliably suppress native scrolling/browser zoom. Pointer coordinates were also taken from the bordered container, not the actual SVG plot rectangle. A native non-passive wheel listener now suppresses that competing motion, transforms coordinates through the actual plot rectangle/viewBox, normalizes line/page deltas, and ignores toolbar/compact-panel scrolling. The existing shared zoom transform preserves the world point under the cursor; keyboard zoom remains centered. Listener teardown and one debounced viewport command are unchanged. G2D38's labelled same-source geometry retention still prevents resampling flicker.

## Reviewed recommendations

The ranges below are inclusive. Units are labels, not dimensional conversion. Default mathematics equals the frozen v1 image even when expression text changes to reference parameters.

| Original scene | Parameters: default; range; slider step; unit | Suggested animation |
| --- | --- | --- |
| Two slopes | `a`: 2; −3…3; 0.1; ratio. `b`: 1; −2…2; 0.1; graph units | `a`, −3→3 |
| Moving a parabola | `h`: 1; −1…2; 0.1. `k`: −1; −2…2; 0.1. Both graph units | `h`, −1→2 |
| Damped oscillation | `d`: 0.2; 0.05…0.5; 0.01; 1/graph unit | `d`, 0.05→0.5 |
| Beating waves | `f`: 4.5; 4.1…5; 0.05; rad/graph unit | `f`, 4.1→5 |
| Circle and ellipse | `a`: 2; 0.5…2.3; 0.1; graph units | `a`, 0.5→2.3 |
| Lissajous loops | `phi`: 0; −3.14…3.14; 0.02; rad | `phi`, −3.14→3.14 |
| A three-petal rose | `n`: 3; 1…5; 1; integer frequency | `n`, 1→5; 5 frames |
| A cardioid | `c`: 1; 0.5…1.2; 0.05; graph units | `c`, 0.5→1.2 |
| Implicit conics | `r`: 1; 0.5…1.8; 0.05; graph units | `r`, 0.5→1.8 |
| Inside, excluding the boundary | `r`: 1; 0.5…1.25; 0.05; graph units | `r`, 0.5→1.25 |

Other recommendations use 15 frames, all at nominal 6 FPS, with G2D38 backpressure and index-derived quantization. Rose controls/playback select integers; typed fractions remain legal and may not close over the finite angular domain. The recommendation is limited to five because seven can exhaust the low 512-sample budget without visible geometry. Cardioid copies form limaçons away from `c=1`. Beats use a signed authored comparison, not a computed analysis. Strict disk boundaries remain excluded/dashed. Lissajous changes phase, not its integer frequencies. Contours/fills remain bounded numerical approximations, never topology proofs.

## Contracts and preservation

- `packages/core/src/graph2dPresets/interactive.ts` owns ten lazy, validated content-v2 variants derived through ordinary authoring. Frozen registry v1, its 20 source/default digests and all preview assets are untouched. No catalog-only graph model or mathematical evaluator is added.
- The same manifest validator and independent launch-token factory are used on both hosts. Variants compute a new digest and required capability set; their normal Graph source persists ranges, steps, units and committed values. Older readers must support `graph2d.parameters.v1` or fail closed.
- Parameter hints/defaults/animation recommendations are bundled guidance matched to complete source objects/domains/controls/assumptions, ignoring only current values. Display/identity changes do not remove useful hints; recipe/control changes do. Guidance does not assert catalog origin and adds no unknown fields to Graph/handoff payloads.
- Preview/playback does not alter history, saved projects, checkpoint ancestry or analyses. One Apply uses the ordinary whole-scene command/inverse. Existing stale-analysis/companion rules remain in force. No new dependency or license change.

## Verification

- `npm run test:graph2d:desktop:unit`: **207 tests**. Includes immutable v1 bytes, v2 manifests/fresh identities/capabilities, reference mathematics at endpoints and every recommended frame under a 512-sample budget, 1024-sample endpoint checks, default-preview equivalence, guidance staleness, opt-in player/reset/cancellation, checkpoint-v1 compatibility, last-saved copy restoration and rollback.
- `npm run test:graph2d:mobile:unit`: **301 tests**. Every interactive copy launches through actual native storage services (mock filesystem), edits/undo/redo/restarts and returns exact source/control/value bytes via the ordinary mobile handoff. Scrubs/playback write no files.
- `npm run test:graph2d:desktop:e2e`: **26 Electron cases**. New case repeats Open on an edited copy, verifies a single undo step, opt-in playback/Cancel, switches/resumes the same project and checks wheel anchor coordinates in the actual SVG viewBox. Existing gallery/export/history/seven-kind workflows remain covered.
- `npm run test:graph2d:parity:web`: **22 browser cases**, en-US/UTC and pl-PL/Auckland. All ten variants exercise real workers, controls/default-reset and geometry; browsing starts no sampler. Includes narrow gallery, no autoplay, typed/keyboard scrubs, one Apply/undo/redo, save/reopen, recommended reset/background, repeated edited-copy Open/explicit fresh copy and bordered/scrollable focal-point zoom.
- Root, native and parity typechecks; desktop/web production builds; **20 frozen SVG/PNG previews verified, 235087 compressed bytes**; Android Hermes export to `output/ggl10-native-bundle` (875 modules). No APK installation is implied.
- Local visual captures: `test-results/graph2d-web/interactive-gallery-*` (narrow detail, parameter controls and ten scenes) and `test-results/playwright/graph2d-interactive-gallery-*` (Electron). Build/evidence output remains local, not checked-in catalog assets.

Exact rebuilt native touch/slider/playback/background/save/share, iOS, native accessibility/rotation/performance and MOB-G13/G2D40 signoff remain pending. Previous gallery-device evidence is not new-feature acceptance.

Follow-on G2D37 scales, G2D39 regression and [G2D40 automated professional acceptance](graph2d-g40-professional-acceptance.md) are now implemented. Physical/screen-reader release validation remains pending. Next product milestone: **GGL11 personal collections**.
