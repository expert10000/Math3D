# G2D36 — Graph publication export

Implemented on 2026-09-29. Desktop/web export and automated shared/native boundaries are verified. Physical native save/share and iOS acceptance are **not** signed off; this does not complete MOB-G13 or G2D40.

## Where to use it

- Desktop/web: **Graphs → Export**. Choose the image size and optional declared X/Y unit labels, then download SVG, PNG, CSV or the HTML report. Close/Escape cancels outstanding work and returns keyboard focus to Export.
- Mobile source: **Graph workspace → Export** in the horizontally scrollable toolbar. Choose size/format and **Save publication** or **Share publication**. Save uses the native folder picker; share uses the native share sheet. A rebuilt APK is required; an existing installed build is not updated by a Git push.
- Keep using the existing Graph/handoff export for editable projects, companions, sidecars and revision ancestry. Publication files are deliberately not project-import contracts.

No upload, hosting, third-party encoder, fetched fonts or new dependencies were introduced. No dependency/license changes are part of this milestone.

## One shared publication recipe

`math3d.graph2d-publication.v1`, recipe 1, owns and freezes a validated document/view/current-result snapshot. It reuses the shared scene sampler and world/screen transforms used by live graphs and gallery previews; it does not export a gallery thumbnail or copy a transient screen capture. Publication-only clipping, ticks and rasterization remain their own recipe, not a new portable mathematical source.

The four formats carry the same snapshot ID, source document ID/revision/hash, canonical mathematical source, committed/requested and effective viewport, dimensions, declared unit labels, axes/styles, saved versus bounded sampling policy, method, convergence diagnostics and semantics-loss warnings. The canonical source includes hidden objects; only visible objects contribute plot geometry. PNG metadata can be stripped by image editors, so retain the CSV/report when provenance matters.

SVG has a title, description and metadata, with no executable/external content. PNG is an original deterministic RGBA raster with a small numeric tick font, PNG checksums, UTF-8 iTXt provenance and stored-DEFLATE zlib data. It is not an antialiased/high-end typography renderer; SVG/report is preferred for scalable presentation. The PNG implementation follows [PNG](https://www.w3.org/TR/png-3/), [zlib](https://www.rfc-editor.org/rfc/rfc1950) and [DEFLATE](https://www.rfc-editor.org/rfc/rfc1951).

CSV contains bounded sampled geometry rather than the original dataset. Segment IDs retain gaps, parameters and available data-row IDs are preserved, and piecewise endpoint records distinguish open from included endpoints. Ordinary sample-segment ends without an explicit openness flag are not falsely declared included source endpoints. Inequality records explain that contour points are not filled membership. Analysis records preserve original numeric field values rather than formatted UI summaries, alongside the unchanged shared result envelope. Strings are quoted and protected against spreadsheet-formula interpretation; numeric negatives and decimal points are unchanged.

The offline HTML report includes an accessible SVG, headings, scoped/captioned tables, current analysis provenance (method/version/inputs/tolerance/confidence/warnings), a bounded point preview and inspectable source/metadata. It has no JavaScript or external assets and uses a restrictive content-security policy. Export runs no new analyses; stale results are rejected by the shared boundary and omitted by the native current-result adapter. Derived overlays, transient selection/hover, pins and mixed-workspace companion geometry are not part of the static plot.

Unit labels are explicit declarations, defaulting to `unspecified`. They do not infer units, validate dimensions, change document schema or convert values. Equal-aspect viewports can expand when the requested image aspect differs; the effective viewport is recorded.

## Budgets and lifecycle

- Dimensions: integer 128–1600 per axis, at most 1,200,000 pixels. UI presets stay inside this limit.
- Sampling: at most 4,096 evaluations across visible objects, depth at most 16, existing tolerance retained, shared sampler deadline 1,500 ms. Incomplete diagnostics remain visible; convergence is not a mathematical certification.
- Point sidecars: checksum/row-count validation, visible-only resolution within per-object allowance. Missing or over-budget tables remain explicit diagnostics rather than fabricated data.
- Geometry: 16,384 clipped primitives; omissions are declared. Dashed/dotted phase is retained across sampled edges. Strict boundaries, region fills, point-only styles, data gaps and piecewise open/included markers keep their existing semantics.
- Analysis: at most 16 tables, 16 unique columns, 4,096 total rows and 512 KiB input; bounded finite/string/null cells. Oversized current result projections are omitted with explicit notes in every format, preserving plot export and the original analysis. Snapshot and each output are limited to 8 MiB.
- PNG: 24 million pixel-write work limit, with a smaller-image/SVG error when exceeded. These are workload/file bounds, **not** a measured device heap limit or a hard real-time guarantee.
- Desktop/web: a dedicated worker prepares all formats from one snapshot. Changed source/view/settings, close/unmount, worker error or an 8-second deadline terminate the job. A PNG-specific failure does not discard available SVG/CSV/report files. Download object URLs are revoked.
- Native: deferred preparation lets busy/cancel state paint, reuses one snapshot while inputs remain current, and discards obsolete jobs. Preparation is bounded synchronous shared work, **not** a native worker or preemptible loop. Background cancellation applies to preparation; an intentional folder/share UI is allowed to finish. Original bytes are verified after file write. Existing user files receive a collision suffix, never an overwrite. Sharing manages only a separate private cache, retaining at most eight managed files (maximum 64 MiB by file policy); user folders, project files and unrelated cache entries are untouched.

## Acceptance evidence

Verified commands and cases:

- `npm run test:graph2d:desktop:unit`: **162 tests**, including 31 publication tests. All 20 gallery scenes match independent requests to the live shared sampler; an independent PNG reader checks every CRC, dimensions, iTXt and Node-zlib decompression. Repeat-byte identity, owned/frozen snapshots, checksums, missing data, bounds, hidden/point-only objects, discontinuities/endpoints, strict dashes, current numeric analysis/stale rejection, oversized analysis omissions, text escaping and formula-safe CSV are covered.
- `npm run test:graph2d:mobile:unit`: **285 tests**, including byte-for-byte host parity, original numerical result tables, native byte read-back, all four MIME/UTI mappings, collision preservation, cancelled/stale requests, corrupt writes/unavailable sharing and private-cache isolation.
- `npm --prefix apps/mobile run typecheck` and `npm run typecheck:noemit`: passed.
- `npm run build:web` and `npm run build:renderer`: passed. Existing large-chunk warnings remain; they are not export correctness failures.
- `npm run test:graph2d:desktop:e2e`: **23 cases**, including actual Electron SVG/PNG/CSV/HTML file downloads, shared snapshot identity, unchanged saved checkpoint and Escape focus return.
- `npm run test:graph2d:parity:web`: **8 cases** across en-US/UTC and pl-PL/Auckland, including actual export-worker downloads, offline report/image opening, unchanged storage, cancellation/error/retry, superseded settings, narrow-dialog layout and deadline recovery, plus existing numerical corpus/all-catalog launch checks.
- Android Hermes bundle export compiled successfully with the native controls/services included. This verifies bundling, not native picker/share execution.

Generated screenshots and publication files remain under `test-results/` and `output/`; generated bundles and test projects are not shipped as source fixtures. Visual review covered the actual raster output, export dialog and offline report.

### Pending native/release evidence

No physical phone was connected during this milestone. The requested Medium_Phone_API_35 emulator was opened and left running, but ADB remained offline; no native save/share success is claimed. Do not clear/uninstall an existing project library to make a test pass.

After rebuilding the chosen release/internal artifact, verify actual file-provider writes and MIME sharing on Android and iOS for all four formats, cancel/background/reopen/source replacement, low-tier PNG latency/memory, short landscape/tablet/large text, TalkBack/VoiceOver and printed report layout. Record exact artifact/source/device evidence through MOB-G13; comprehensive professional accessibility/publication signoff remains G2D40.

Next implementation milestone: **G2D38 shared parameters, sliders and deterministic animation**, followed by GGL10 preset controls, G2D37 scales, G2D39 statistics and G2D40 professional acceptance.
