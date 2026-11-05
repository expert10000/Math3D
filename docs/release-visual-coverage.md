# Main release visual coverage

Capture baseline: 5–6 November 2026. Browser images come from the deployed public app; the first desktop set came from Math3D main commit `55a0196fe63ca16f49c97ff1aead7e41105e0ede` plus the Field Explorer contrast fix. New Surfaces, Mesh and Geometry analysis panels were captured from main commit `ede51af86dcc46775399f8a642d301b07451adc7`. The 2026-09-16 desktop screenshots and the October quantum design captures are excluded.

## Current count and requested target

| Collection | Current distinct PNGs | Requested target | Next coverage |
| --- | ---: | ---: | --- |
| General features | 9 workspace/gallery views | 100 | Capture meaningful presets, projects, analyses, exports, and mobile journeys across modules. |
| Graph module | 26 graph scenes (28 including workspace and gallery) | about 50 | Add authoring, measurements, inspector, parameter, export, and analysis states. |
| Scientific Field Explorer | 33 source, view, layout, and inspector states | about 50 | Add scalar and complex fields, derived operations, trajectories, and saved results. |
| Quantum integration | 47 verified scene views and variants | 100 | Add source inspection, reciprocal space, plot selection, Project reopen, and exact Lab handoff. |
| Analysis in each module | 4 Surfaces, 5 Mesh, 4 Geometry, and 3 Field Explorer views | about 50 per module | Add result-bearing states and other modules. Do not count tab-only or duplicate images. |

These numbers measure distinct current screenshots, not feature completion. They are an initial public gallery, not a claim that the main release targets are met.

## Capture and publication

- `node scripts/capture-release-public-web.mjs` refreshes the browser workspace and Graph Gallery images from the public Pages app.
- After `npm run build:core`, `node scripts/capture-quantum-review.mjs apps/public-site/src/assets/release-quantum-current` refreshes verified desktop quantum scenes.
- After `npm run build:core`, `node scripts/capture-release-field-explorer.mjs` refreshes desktop Field Explorer sources, views, and inspector states.
- After `npm run build:core`, `node scripts/capture-release-analysis-panels.mjs` refreshes the full-height left and right analysis views from a fresh desktop profile per module.
- `npm run build:public-site` verifies every referenced PNG, including portrait panel captures, and builds the static site.
- The 128-image gallery is published by `.github/workflows/docs-pages.yml` at `https://expert10000.github.io/Math3D/landing/release-gallery.html` after the Pages workflow completes. The separate Sites gallery remains an earlier 115-image snapshot.

Use 1600 × 1000 at device scale 2 for browser captures, PNG for text and line art, settled renders, no debug overlays or stale transition states, and a descriptive caption. A reviewer should inspect every new batch at full size before adding it to the public manifest.

GitHub Pages hosts static HTML, JavaScript, and PNGs. It does not host the Python worker, Sage service, or desktop file-system APIs. If visitors must run those features in the browser, deploy their backend separately and connect the web app to it. The gallery can remain on Pages either way.
