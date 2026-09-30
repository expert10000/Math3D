# GGL13 — guided concept collections

2026-09-30. GGL13 adds **Learn** to the desktop/web and native Graph Gallery. Four curated paths cover beginner slope/derivative, intermediate definite integral and asymptote, and advanced Taylor comparison. Each path has two ordered explanations and a concrete task. The same text and ordering are shared across hosts.

**Schema decision.** The existing `graph2d.probes.v1` source-linked saved-probe format is sufficient for the bounded on-graph point annotations in these lessons. This release does not add a free-text/drawing schema, a graph evaluator or a lesson script runner. Guidance stays in the trusted built-in catalog layer; opening a guide creates an independent ordinary Graph preset/project with at most two labelled saved probes. The markers are evaluated from the canonical authored expression and disappear from the plot when their source becomes stale, hidden, invalid or non-positive on log axes. Desktop Inspector and native Analyze keep the steps available in the opened project and identify stale guidance after source/marker changes. Deleting or renaming the complete curated marker set removes the auto-recognition of that path rather than asserting a false match.

The three derivative/integral/asymptote guided copies reuse their reviewed v1 source scenes. The Taylor copy adds two normal editable comparison curves, `P1(x)=x` and `P3(x)=x-x^3/6`, beside the existing sine/derivative scene. Neither polynomial is a computed analysis result or a certified error bound. The integral's `1/3` is a reference derived from the antiderivative, not a precomputed app result. Asymptote guidance never places a marker at the undefined pole. Requested Analyze results retain their existing bounded numerical method and confidence labels; nothing runs or animates on open.

The original 20 v1 presets, their serialized bytes and all 20 frozen SVG/PNG previews remain unchanged. Guided copies use distinct `guide-*` IDs and normal capability-checked Graph serialization, undo, save/reopen and handoff paths. Gallery Open resumes a preserved edited guided copy on desktop; Fresh creates another independent one. Native opens via its existing atomic project launch, preserving current work.

## Verification

- Shared/desktop model suite: **278 passed** across 46 files, including four independent guides, capabilities, marker evaluation, stale source edits, Taylor authored expressions and unchanged v1 catalog bytes.
- Native model suite: **322 passed** across 58 files, including each guided copy through ordinary atomic launch, restart and portable handoff.
- Electron: **30/30** existing full Graph checks plus the new GGL13 guide check; Chromium: **48/48** across en-US/UTC and pl-PL/Auckland. GGL13 checks cover Learn discovery, ordered steps, opening, saved markers, edit-to-stale behavior, resume of an edited copy and Taylor curves. Desktop/web builds and root/renderer/native/parity strict types pass.
- Android Hermes bundle compilation passes (889 modules, approximately 6.23 MB).
- Frozen 20-preview check passes. An Android bundle compile is **not** an installed-device or signed-release acceptance.

Pending: physical Android/iOS phone/tablet lesson navigation, TalkBack/VoiceOver announcements, exact signed builds, desktop↔native guided-project transfer and the wider MOB-G13 release gate. This implementation does not certify integral error bounds, Taylor remainders or asymptotic limits from a plotted image.
