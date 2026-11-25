# Hosted web qualification — 2026-11-25

**Disposition:** hosted browser support remains **Limited**. Cloudflare serves the frozen 2.0 app source, and the tested browser Project journeys pass. The authorized worker and private Sage routes are not deployed on the production hostname, so release closure items 15–16 remain open.

## Exact deployed target

- Production: `https://app.math3dlab.com/`; immutable deployment: `https://3c7cedfa.math3d-app.pages.dev/`. The [Cloudflare Pages app check on `8cfe56c6074b832b4e821a7149d40554d6626622`](https://github.com/expert10000/Math3D/commit/8cfe56c6074b832b4e821a7149d40554d6626622/checks) succeeded and points to deployment `3c7cedfa-385f-475e-8043-e438a1640f64`.
- At 2026-11-25 09:45 UTC, both hostnames returned identical `index.html` bytes: 2,232 bytes, SHA-256 `AE1B90BDA5E952EF24D3C7281A4A4D05FBFB25E0A26B307841C5491E9ECF1A99`. Both referenced `assets/index-Cxh6JZbr.js`, whose 4,403,473 bytes matched at SHA-256 `DBA0F0565EACECF61E5C5B77A3C28E09CAD968AFD6F70E5A6A1580FB0C1238EB`. The production Pages alias also returned the same HTML.
- The Git trees for `apps/web`, `renderer/src`, and `packages/core` at the deployed commit are identical to frozen app source `300d2420b0cbdac0f04fb9a10fd424ac55f1403a`. This is source-tree identity for those paths plus deployed-byte identity to the immutable build, not a claim that every generated file has been independently reproduced.

## Live Chromium journeys

Headless Chromium 156.0.8078.4 on Windows used clean browser contexts against the production hostname on 2026-11-25. No page errors were observed in these journeys.

| Gate slice | Observed result |
| --- | --- |
| Project, Workbook, Note | Imported `tests/fixtures/project-workbook-note-journey.json` (11,037 bytes), saw verified Graph and Curve source compatibility, opened Project `math3d:project:e5a400fab3b2e2a5024ab1a72f19bece`, opened its Workbook and Note, and read the saved derivative text. |
| Persistence and transfer | Downloaded a resource-inclusive Project package (15,173 bytes; SHA-256 `5DE033C56848E549E00D6DEB7203FF5C05C0773B237506620B6BBB0D9D3837E5`), reopened the same Project after reload, then imported it in a clean `pl-PL` browser context with the same identity and verified resources. |
| Offline after load | After opening the Project, switched the context offline. `navigator.onLine` became false while the Workbook list and saved Note bytes remained available in the already loaded page. Cold offline navigation was not tested; no service worker controlled the initial page. |
| Storage denied | Simulated the browser refusing the persistent-storage probe. Both Project import actions were disabled and the UI said “Local persistent storage is blocked or unavailable.” |
| Narrow layout and locale | At 390 × 844 with `pl-PL`, the Projects panel occupied x=10..380 and the document width remained 390; no horizontal page overflow. This verifies layout and locale tolerance for this path, not translated Polish copy or every workspace. |
| Scientific ZIP and sidecars | Imported a 50,028-byte ZIP made from `tests/fixtures/scientific-scene/vortex-volume.sscene`. The import review identified four verified sidecars. Exported a 251,782-byte Project package with three `scientific-component` resources and one `scientific-manifest`, then opened it in a clean browser context. A copy missing the required `up` component was rejected, offered no Open action, and left the active Project unchanged. |

The scientific ZIP result covers a direct vector-grid import and portable Project transfer. It does not qualify attaching an external `.sscene` reference, relinking a missing folder, or QWZ/SSH/hydrogen scene transport. The tested Project packages are local browser storage and downloads, not a server-side account sync. The UI copy is English under `pl-PL`.

The [390 px Projects capture](../../evidence/hosted-web-2026-11-25/projects-390-pl.png) shows the measured narrow layout.

## Deployment blocker: API paths are static fallbacks

With `Accept: application/json`, all of these production GETs returned HTTP 200, `text/html`, and the app's `index.html`: `/api/worker/diagnostics`, `/api/worker/cgal/health`, `/api/sage-private/session`, and `/api/sage-private/health`. Empty JSON POSTs to `/api/worker/jobs` and `/api/sage-private/session` returned HTTP 405. In the Compute Center, Python and VTK reported “Invalid python worker diagnostics response”; Sage routes were unavailable. This is a missing backend route, not evidence of an authenticated gateway, quota, or transfer limit. The Cloudflare Pages build repair only deploys static `apps/web/dist`; the separate Node proxy described in `apps/web/README.md` is not part of that output.

No Pages Functions, `_routes.json`, `_redirects`, or Wrangler route configuration is checked into the repository for this app. The Cloudflare dashboard required sign-in during this follow-up, so private dashboard rules were not inspected. The deployed responses establish that the tested paths reach the static SPA fallback; they do not establish every private dashboard setting.

### Inputs required for a hosted compute route

1. Route only the intended `/api/worker/*` and `/api/sage-private/*` paths from the app's HTTPS origin to running backend services, before the SPA fallback. Keep compute responses JSON with correct status codes and bypass HTML and asset caching. The current Pages build command (`npm ci && npm --prefix renderer ci && npm run build:web:pages`) emits `apps/web/dist` only; it does not run `apps/web/server/worker-proxy.cjs`.
2. For worker operations, provide a long-lived Node proxy with its Python worker and required native CGAL/VTK/Volume dependencies, bounded requests, health diagnostics, job cancellation, logs, and a version matched to the deployed app. A public authorization and admission policy is required before exposing this route. The proxy's `MATH3D_MOBILE_PAIR_TOKEN` is optional, while the browser bridge sends no bearer token. Publishing the existing `/api/worker/*` proxy without another access control would expose compute endpoints to the public.
3. For private Sage, run that proxy on loopback behind an HTTPS reverse proxy with `MATH3D_SAGE_WEB_AUTH_MODE=hosted`, `MATH3D_SAGE_WEB_ORIGIN=https://app.math3dlab.com`, a 32-character-or-longer `MATH3D_SAGE_WEB_SESSION_SECRET`, distinct access keys in `MATH3D_SAGE_WEB_USERS_JSON`, and an absolute durable, restricted `MATH3D_SAGE_WEB_STATE_FILE`. Provide `MATH3D_SAGE_GATEWAY_URL` and `MATH3D_SAGE_GATEWAY_TOKEN` for a live private gateway backed by SageMath. The [gateway runbook](../../../services/sage-gateway/README.md) defines these settings and the one-job and ten-requests-per-minute user limits. Credentials belong in service secrets, not Pages assets or repository files.
4. On the resulting exact deployment, verify unauthenticated and cross-origin denial, valid sessions, quota and revocation after restart, live worker and Sage results, cancellation, source and version agreement, backend outage responses, and a browser-visible recovery path. If an authorized worker service is not provided, build with `VITE_MATH3D_WORKER_PROXY_ENABLED=0` and keep those hosted operations explicitly unsupported rather than showing a broken proxy route.

To close item 16, extend the live browser matrix to external scene reference/relink, larger source packages, full Study editing, save/reopen after a true browser restart, permission denial and quota recovery, multiple locales and narrow layouts, and offline-after-load work beyond the already-loaded Project view. Keep the platform matrix at **Limited** meanwhile.

These checks did not change Cloudflare settings or GitHub Release asset links. No Pages build quota or transfer quota failure appeared in the tested path.
