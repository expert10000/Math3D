# 2.0 desktop accessibility source pass

**Evidence date:** 2026-11-15. **Source baseline:** `2cf4b6a4b096ff08f3e7c8e928c542d25acca065` plus this accessibility change. **Host:** Windows NT 10.0.26200.0, Node 24.19.0, Electron 39.2.6. This is a clean source build in a disposable Electron profile, not a signed or installed 2.0 candidate.

The focused Playwright run passed 3/3 tests in `tests/e2e/release20-desktop-accessibility.spec.ts`. It used keyboard Enter to open a Surface guided Project, open the Field Project, return a selected Graph row to its exact Field probe, and open Algebra examples in CAS. The four guided cards expose distinct article and action names, including the QWZ verified-scene chooser. Project and Field handoffs now place focus on the destination heading; closing Field returns focus to Graphs navigation. Project save/open feedback remains a `role="status"` announcement, and changed Field source refusal is a `role="alert"` announcement. At 760 × 680, the four cards and open Project panel stayed within the viewport. Under `prefers-reduced-motion: reduce`, button transitions resolve to 0.01 ms.

The QWZ chooser was checked for an accessible name, enabled state, and narrow layout. Its existing source handoff journey was rerun separately below. Live Sage computation was outside this accessibility pass. No screen reader speech output was recorded; this pass verifies DOM roles, names, focus, keyboard activation, layout, and reduced-motion behavior.

| Local source check | Result |
| --- | --- |
| `npm run build:core` followed by `npm run build:renderer` after the edits | Passed |
| `npx tsc -p renderer/tsconfig.app.json --noEmit` and `npx tsc -p tests/e2e/tsconfig.json --noEmit` | Passed |
| `npx playwright test tests/e2e/release20-desktop-accessibility.spec.ts --reporter=list` | 3 passed |
| `npx playwright test tests/e2e/project-surface-ridge-publication.spec.ts tests/e2e/quantum-qi08-study-handoff.spec.ts tests/e2e/project-field-flagship-journey.spec.ts --reporter=list` | 3 passed |

The Algebra card's CAS entry was exercised here; the live Sage journey remains under the separate journey qualification gate.

## Source-build captures

Every image below is a **source-build capture**, taken from the disposable Electron profile after the accessibility changes. The card crops show the four advertised journeys; the narrow capture shows the open Surface Project and its focused heading. None is an installed-candidate or signed-installer screenshot.

| Capture | SHA-256 |
| --- | --- |
| [Surface card](evidence/m3d20-19-desktop-accessibility-source-2cf4b6a4/source-build-surface-card.png) | `0923354427ee90260049d7f97a9312a0381ee11b50212d9f692c7599eab6ea7f` |
| [QWZ card](evidence/m3d20-19-desktop-accessibility-source-2cf4b6a4/source-build-qwz-card.png) | `e471f07cd5defab6c5ea97e2340a95a260e70af8d19fb5950790e2fc1e549f80` |
| [Algebra card](evidence/m3d20-19-desktop-accessibility-source-2cf4b6a4/source-build-algebra-card.png) | `cd67a815b3322f3c4e8781dd37a2d499342c69e465b7c854e746040da797f1e7` |
| [Field card](evidence/m3d20-19-desktop-accessibility-source-2cf4b6a4/source-build-field-card.png) | `b7d68a3699253c07bc98cc5822286b115ded027accabd4988cb94248662a7a25` |
| [Surface Project at 760 px](evidence/m3d20-19-desktop-accessibility-source-2cf4b6a4/source-build-surface-narrow-project.png) | `503b023807d04c5e5316d356ee6033d91e49708e3ed22c41a8b068227c3ae47d` |

## Remaining checklist #19 gate

Repeat the image and claims review against the exact signed Windows candidate, capture installed-candidate images, and complete publication review. This source pass does not close that gate.
