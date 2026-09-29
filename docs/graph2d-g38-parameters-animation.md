# G2D38 — Parameters, sliders and deterministic animation

Implemented 2026-09-29, together with the reported graph disappearing during pan/zoom. Shared contracts and desktop/web workflows are verified; native models/services and Android bundling are verified. Physical native controls/save/share, iOS and the full MOB-G13/G2D40 gates remain pending. No installed APK/desktop installer is updated by a source commit.

## Using it

- Desktop/web: **Graphs → Parameters**. Mobile source: **Graph workspace → Parameters** in the horizontal toolbar.
- Configure an existing variable (try Gallery → Two slopes → Configure a), or add a parameter and use its name in an expression, such as `a*x`.
- Set value, minimum, maximum, step and optional unit label. Save parameter is a normal reversible source command. Renaming is deliberately unsupported: edit expressions explicitly. Delete refuses to remove a referenced binding.
- Drag the slider or type a preview value. The graph changes, but source/history/project saves do not. **Apply preview value** commits one command; **Cancel preview** restores the committed graph. Save/reopen and handoff use the existing project workflows, not animation state.
- Select a configured parameter, From/To, Frames and FPS, then **Play animation**. Stop leaves an explicit preview that can be applied or cancelled. Closing tools, source/view replacement, backgrounding and unmount stop playback. There is no automatic playback.
- Desktop **Prepare frame export** produces downloadable HTML/CSV. Native **Save/Share frame report/manifest** uses the existing verified file/share boundary. A rebuilt native app is required.

## Portable source and command ownership

Existing schema-v1 variables remain `{name,value}`. Controlled parameters add an optional exact `control: {min,max,step,unit}` and the computed required capability `graph2d.parameters.v1`. Existing gallery templates, hashes and generated previews are unchanged. Older readers fail closed instead of silently dropping controls; both new host readers share validation.

Limits: 16 variables; new controlled names are non-reserved lowercase identifiers, 1–32 characters. Independent variables, constants (`pi`, `e`, `tau`) and built-in function names are reserved. Finite inclusive ranges stay within ±1e9, with at least 1e-9 span; steps must be positive, representable and allow at most 100,000 increments. Trimmed unit labels are at most 64 characters and contain no control characters. Units are declarations, not dimensional inference or conversion.

Slider values snap to a grid anchored at the minimum, with the maximum endpoint reachable. Typed finite in-range values are exact and need not lie on that grid. Desktop arrows use the declared step; Home/End select bounds. Native sliders expose adjustable accessibility actions and retain a numeric-input alternative with 44-unit controls.

Four typed authoring operations create/configure/set/delete parameters. The ordinary kernel scene command validates source/AST/bindings, recomputes capabilities/hash/revision and stores inverse history. No new storage format or host-specific evaluator is introduced. Source-generation changes stale previous numerical results, saved pins and promoted companions through their existing provenance checks. A preview uses a derived identity without advancing the committed adapter. Committed probes/analysis overlays are hidden on a preview plot; desktop inspector text is labelled as committed-source evidence.

## Animation and export determinism

The transient plan `math3d.graph2d-animation.v1` captures committed identity, display hash, parameter, endpoints, frame count and nominal FPS. Bounds are 2–60 frames and 1–30 FPS. Frame `i` uses quantized `from + (to-from)*i/(N-1)`, with the last endpoint handled explicitly; time is `i/fps`. There is no accumulated delta-time, random motion, executable expression or hidden saved animation state.

The shared player has one frame in flight. It schedules the next index only after the current sampling attempt settles; slow work lowers wall-clock playback speed. Cancellation clears its timer and generation, rejecting late callbacks even after restart. Interactive sampling remains approximate and deadline-limited; retained/incomplete geometry is labelled, never accepted as current probe evidence.

Frame export is an **ordered static SVG-frame HTML report and CSV manifest**, not MP4/GIF/video. It owns a canonical checked recipe, then builds a fresh G2D36 publication for every index. Export sampling is limited to 4,096 evaluations across visible objects and depth 16, with no clock-dependent truncation; successful outputs are byte-repeatable regardless of scheduling, locale/timezone or input property order. Approximation, evaluation/depth/output limits, gaps and per-object diagnostics remain explicit. It does not recompute analysis or carry committed analysis tables into changed frames.

Each SVG has unique accessible title/description/clip IDs, source hash, recipe, unit labels and sampling metadata. HTML is offline, script-free and CSP-restricted. The manifest includes index/time/value/unit, source and snapshot hashes, diagnostics, the canonical base recipe and sequence hash; strings use the shared CSV formula protection. The reproduction recipe can include bounded visible data sidecars; it is inspectable publication data, not an importable editable project. Keep normal Graph/handoff files for editing.

Size is 640 × 480 in the controls. Input snapshots are limited to 2 MiB; each output to 8 MiB; overflow fails without publishing a partial sequence. Desktop exports run in a terminable worker with a 45-second limit, progress, cancellation and failure/retry. Native work yields between bounded frames, with a 45-second between-frame check: it cannot preempt a synchronous frame. Backgrounding cancels preparation, while an already-open native picker/share intent may finish. Cancel, source/view replacement and synchronous unmount cleanup invalidate its generation. Native filenames are sanitized and bytes are read back and checksum-verified; collisions preserve existing files.

## Pan/zoom disappearance fix

The desktop hook previously returned `[]` as soon as the request key changed, clearing the graph until its replacement worker completed. Both host presentation hooks now retain the last valid world-coordinate geometry while the same committed source is resampled for a changed viewport/size. The renderer reprojects it immediately, labels it as updating and blocks probes/Fit until it is current. Deadline-starved empty objects may retain previous geometry with `ready: false`; a genuinely empty settled domain replaces it with empty geometry.

Source/document/style/sampling/sidecar generations do not bridge. Parameter preview continuity is explicitly tied to its committed base generation. Obsolete workers/publications are still rejected and cancelled. Native background/memory release clears retained artifacts. Retention does not invent graph coverage outside previously sampled world bounds or certify continuity.

## Verification — 2026-09-29

- `npm run test:graph2d:desktop:unit`: **192 tests**. Includes parameter/schema/legacy validation, history, binding changes across explicit/parametric/polar/implicit/inequality/piecewise sources, frame values, cancellation/backpressure, canonical repeat-byte export and presentation continuity.
- `npm run test:graph2d:mobile:unit`: **291 tests**. Includes all-20-template preservation across seven kinds, real host-model handoff retaining controls/units/values, shared frame bytes and native HTML/CSV filename/save/share verification.
- `npm run test:graph2d:desktop:e2e`: **25 Electron cases**, including actual playback, local HTML/CSV downloads, undo/redo and held-worker pan/zoom continuity, plus all previous Graph workflows.
- `npm run test:graph2d:parity:web`: **14 browser cases** under en-US/UTC and pl-PL/Auckland. Includes slider keyboard/typed previews, explicit save/reopen, unchanged saved source during playback, offline frames, unique SVG IDs, worker cancellation/recovery, pan/zoom retention and narrow-window layout; previous gallery/numerical/publication cases remain covered.
- Root/mobile/parity typechecks; web/renderer builds; 20 frozen gallery previews; Android Hermes export to `output/g38-native-bundle`.
- Visual review: desktop/narrow controls and the first exported frame report in `test-results/graph2d-web/parameters-*`; Electron capture in `test-results/playwright/graph2d-parameters-*`. Generated evidence/bundles are local, not checked-in application assets.

The open API-35 emulator is still reported **offline** by ADB; no connected physical phone was available. This turn did not install a new APK or perform a native touch/save/share acceptance run. Native memory/gesture/accessibility/rotation/performance and iOS signoff remain explicit release work. No new third-party dependency or licence change was needed.

Follow-on **GGL10** is now [implemented](graph2d-gallery-ggl10-interactive-presets.md): ten explicit content-v2 interactive copies, default/reset guidance, shared recommended playback, edited-copy desktop resume and cursor-anchored wheel handling. Frozen v1 source/assets are unchanged. Next: **G2D37** scale policies. Do not treat software evidence as G13/G2D40 signoff.
