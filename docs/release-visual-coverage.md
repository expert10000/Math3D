# Main release visual coverage

Capture baseline: 5 November 2026. Browser images come from the deployed public app; desktop images come from Math3D main commit `55a0196fe63ca16f49c97ff1aead7e41105e0ede` plus the Field Explorer contrast fix on this branch. The 2026-09-16 desktop screenshots and the October quantum design captures are excluded.

## Current count and requested target

| Collection | Current distinct PNGs | Requested target | Next coverage |
| --- | ---: | ---: | --- |
| General features | 9 workspace/gallery views | 100 | Capture meaningful presets, projects, analyses, exports, and mobile journeys across modules. |
| Graph module | 26 graph scenes (28 including workspace and gallery) | about 50 | Add authoring, measurements, inspector, parameter, export, and analysis states. |
| Scientific Field Explorer | 33 source, view, layout, and inspector states | about 50 | Add scalar and complex fields, derived operations, trajectories, and saved results. |
| Quantum integration | 47 verified scene views and variants | 100 | Add source inspection, reciprocal space, plot selection, Project reopen, and exact Lab handoff. |
| Analysis in each module | 3 Field Explorer Analyze panels; other modules not systematically captured | about 50 per module | Define a per-module shot list and capture result-bearing states. Do not count tab-only or duplicate images. |

These numbers measure distinct current screenshots, not feature completion. They are an initial public gallery, not a claim that the main release targets are met.

## Capture and publication

- `node scripts/capture-release-public-web.mjs` refreshes the browser workspace and Graph Gallery images from the public Pages app.
- After `npm run build:core`, `node scripts/capture-quantum-review.mjs apps/public-site/src/assets/release-quantum-current` refreshes verified desktop quantum scenes.
- After `npm run build:core`, `node scripts/capture-release-field-explorer.mjs` refreshes desktop Field Explorer sources, views, and inspector states.
- `npm run build:public-site` verifies that every gallery entry has a matching PNG at least 1400 × 900 and within the expected size range. It then builds the static site.
- The 115-image gallery is currently public at `https://math3d-current-release-gallery.frizzylinden.chatgpt.site/release-gallery.html`. This static deployment was built from the same site assets as this branch.
- `.github/workflows/docs-pages.yml` publishes the landing page from `main`. Its gallery URL is `https://expert10000.github.io/Math3D/landing/release-gallery.html` after the Pages workflow completes.

Use 1600 × 1000 at device scale 2 for browser captures, PNG for text and line art, settled renders, no debug overlays or stale transition states, and a descriptive caption. A reviewer should inspect every new batch at full size before adding it to the public manifest.

GitHub Pages hosts static HTML, JavaScript, and PNGs. It does not host the Python worker, Sage service, or desktop file-system APIs. If visitors must run those features in the browser, deploy their backend separately and connect the web app to it. The gallery can remain on Pages either way.
