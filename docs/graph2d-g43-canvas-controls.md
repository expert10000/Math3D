# G2D43 — saved probes and parameter cards

Desktop/web and native now share the bounded saved-probe policy. Pinning reevaluates the canonical explicit-function expression within its authored domain rather than trusting sampled coordinates. Saved probes support rename, delete, locate and show/hide. Locate centers valid observations on linear/log viewports. They stay available when desktop selection is cleared. Source changes mark observations stale; invalid, stale, hidden and non-positive log coordinates do not appear as current plot evidence.

Visible probes have coordinate labels with bounded placement and overlap suppression. Visibility is an optional validated `graph2d.probe-visibility.v1` capability; older documents without it retain their previous serialization. Probe edits use existing reversible commands and portable save/handoff validation.

Parameter cards reuse the existing parameter component, preview session and deterministic player. Opening cards never starts animation. Scrub/play remain transient; Apply commits, Cancel/Reset return to the committed value, and Configure opens the full controls. Desktop cards sit beside the plot; native Cards uses the existing phone sheet/tablet side placement.

Verification includes malformed/stale/domain/log coordinates, source identity and undo, bounded label placement, legacy capability handling, real Chromium pin/hide/undo/rename/save/reopen and parameter preview/cancel/apply/play/reset. Combined software acceptance is recorded in the final delivery evidence. Physical phone/tablet, signed Android/iOS and screen-reader checks remain pending.
