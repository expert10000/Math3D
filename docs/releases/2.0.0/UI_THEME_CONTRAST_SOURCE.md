# Research route theme and zoom source check

**Scope:** Windows Electron source build at code commit `7e0dee6f63fd78e8634551b6c5d79513d076857a`, 1280 × 900 viewport with 200% document zoom. The renderer hash and clean source state are in the [build identity](media/ui/theme-contrast/source-build-identity.json). This is source-build evidence, not an installed or signed candidate.

The Guided Catenary Study route was exercised from Gallery through saved Study and its source pins, into the Workbook outline, block editor and live preview, then back to the Graph source. The route passed in light, dark and Playwright forced-colors emulation. At 200% zoom, the Workbook sections stack vertically, remain reachable by scrolling, and have no horizontal overflow. Study source panes also have no horizontal overflow. The keyboard reaches the Study Citations and Source panes, and returning to Graph source focuses the module workspace. Dark Gallery requirements and Study/Workbook headings meet the test's 4.5:1 text-contrast threshold.

| Mode | Source-build captures |
| --- | --- |
| Light | [Gallery](media/ui/theme-contrast/light-gallery-source-build.png) · [Study](media/ui/theme-contrast/light-study-source-build.png) · [Workbook outline](media/ui/theme-contrast/light-workbook-source-build.png) · [editor](media/ui/theme-contrast/light-workbook-editor-source-build.png) · [preview](media/ui/theme-contrast/light-workbook-preview-source-build.png) · [Graph source](media/ui/theme-contrast/light-source-source-build.png) |
| Dark | [Gallery](media/ui/theme-contrast/dark-gallery-source-build.png) · [Study](media/ui/theme-contrast/dark-study-source-build.png) · [Workbook outline](media/ui/theme-contrast/dark-workbook-source-build.png) · [editor](media/ui/theme-contrast/dark-workbook-editor-source-build.png) · [preview](media/ui/theme-contrast/dark-workbook-preview-source-build.png) · [Graph source](media/ui/theme-contrast/dark-source-source-build.png) |
| Forced colors | [Gallery](media/ui/theme-contrast/high-contrast-gallery-source-build.png) · [Study](media/ui/theme-contrast/high-contrast-study-source-build.png) · [Workbook outline](media/ui/theme-contrast/high-contrast-workbook-source-build.png) · [editor](media/ui/theme-contrast/high-contrast-workbook-editor-source-build.png) · [preview](media/ui/theme-contrast/high-contrast-workbook-preview-source-build.png) · [Graph source](media/ui/theme-contrast/high-contrast-source-source-build.png) |

The [manifest](media/ui/theme-contrast/manifest.json) records each capture's byte count and SHA-256 hash. The source build was made with `npm run build:core`, followed by `npm run build:renderer` after the final CSS change. Renderer and E2E TypeScript checks passed. The final Playwright command passed 5/5 cases:

```powershell
$env:MATH3D_UI_CAPTURE_DIR=(Join-Path $PWD 'test-results\theme-contrast')
npx playwright test tests/e2e/project-research-theme-contrast.spec.ts tests/e2e/project-study-compact.spec.ts tests/e2e/research-navigation-acceptance.spec.ts --reporter=line
```

**Boundary:** forced colors is Chromium emulation inside Windows Electron. Native Windows high-contrast settings, other Guided journeys, installed packages, and signed-candidate captures remain separate checks.
