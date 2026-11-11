# M3D20-09 UI coherence acceptance

**Scope:** source-checkout acceptance for the connected research path. These runs do not certify an installed 2.0 package or external producer scenes.

| Host | Route exercised | Result |
| --- | --- | --- |
| Windows Electron source build | Guided Gallery → saved Study → result → Workbook → Note → source → Gallery after Project save and app restart | Connected route passes; Back to source restores keyboard focus to the module workspace |
| Windows Electron source build | CAS GF(5) save → Open Projects → Gallery provenance | Saved definition and exact revision visible after return |
| Windows Electron source build | 760 px Study view and 200% zoom | Two source panes stack; citation/source status remains reachable by keyboard |
| Local Chromium preview | Desktop-only Edge Path Study, normal and 390 px viewports, en-US/UTC and pl-PL/Auckland | Four browser cases pass; read-only preview keeps Study sources, citation status, Note status and host limit visible; long resource IDs wrap inside 390 px |
| Renderer model | 11 flagship research narratives through changed source, missing sidecar and independent import; palette citation after source edit | 16 model cases pass; historical pins stay historical; missing evidence is not promoted to current |

The eight focused Windows Electron interaction cases pass together. The global Ctrl+K palette combines app commands with saved Project research objects. A command that cannot open remains searchable and displays its host, Project state or resource reason. Workbook and citation selections use the existing verified payload opener; source documents use the existing Project navigation gate.

## Captures and build receipts

[Guided Study](media/ui/ui-guided-study.png), [source pins](media/ui/ui-guided-study-source-pins.png), [research palette](media/ui/ui-research-palette.png) and [narrow browser preview](media/ui/ui-browser-narrow-preview.png) have adjacent [desktop](media/ui/ui-desktop-build-identity.json) and [browser](media/ui/ui-browser-build-identity.json) build identity receipts. These are source-build captures. Their receipts include the source commit and renderer or web output hash; the desktop source had test-worktree changes at capture time. They are not installed release candidate screenshots.

## Reproduce

1. Run `npx vitest run renderer/src/projects/researchCommands.test.ts renderer/src/projects/flagshipNarrativeMatrix.test.ts --maxWorkers=1`.
2. Run `npx tsc -p renderer/tsconfig.app.json --noEmit` and `npm run build:core`.
3. Run `npx playwright test tests/e2e/project-curated-gallery.spec.ts tests/e2e/research-command-palette.spec.ts tests/e2e/project-study-compact.spec.ts tests/e2e/research-navigation-acceptance.spec.ts --reporter=list`.
4. Build web and run `npx playwright test -c playwright.graph2d.config.ts tests/graph2d-web/curatedGalleryFallback.spec.ts --reporter=list`.

**Remaining gates:** installed desktop package, hosted browser, Android device, external QWZ/SSH/hydrogen bundles, dark/light theme and high contrast snapshots, and full keyboard/zoom coverage across the other ten built-in routes. The [Gallery matrix](CURATED_STUDY_GALLERY.md) tracks those separately.
