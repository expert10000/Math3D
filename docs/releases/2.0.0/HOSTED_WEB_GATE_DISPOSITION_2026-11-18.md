# Hosted web gate disposition — repaired 2026-11-19

**Cloudflare Pages build status: repaired for `866340c50065ff52300e13d903e74c33347a7aed`.** This closes the three production build failures observed on 2026-11-18/19. It does not qualify the broader hosted browser journeys in release closure items 15–16 or change the Windows release gates.

## Diagnosis

The canonical [GitHub Pages build and deploy](https://github.com/expert10000/Math3D/actions/runs/44502222107) passed on `866340c`. Cloudflare cloned the same repository commit successfully, then failed in project-specific build settings:

| Pages project | Failing setting and observed error | Corrected production build command | Output |
| --- | --- | --- | --- |
| `math3d` | Ran the root `build:public-site` script from `apps/public-site`, where it does not exist. | `npm ci && npm --prefix renderer ci && npm run build:public-site` | `apps/public-site/dist` |
| `math3ds` | Skipped dependency installation, leaving `pngjs` unavailable to the Gallery build. | `npm ci && npm --prefix renderer ci && npm run build:public-site` | `apps/public-site/dist` |
| `math3d-app` | Installed only `renderer`; Vite could not resolve the root workspace dependency `base-64`. | `npm ci && npm --prefix renderer ci && npm run build:web:pages` | `apps/web/dist` |

All three projects now build from the repository root. Existing environment variables and build comments were retained. The original logs and their SHA-256 hashes are preserved in the local Cloudflare triage record; GitHub's old failed check contexts still point to those failed deployments. The observed cause was build configuration, not a demonstrated quota or GitHub clone failure.

## Same-commit rerun and live check

After the settings change, Cloudflare successfully rebuilt the original `866340c` commit for [math3ds](https://dash.cloudflare.com/92c37cab8c839c9c1813f2d1d92f8b49/pages/view/math3ds/6d40dd23-2f73-4dee-94b5-872668290d7e), [math3d](https://dash.cloudflare.com/92c37cab8c839c9c1813f2d1d92f8b49/pages/view/math3d/2ed33cdc-6e77-47a8-808c-672ec5e728da), and [math3d-app](https://dash.cloudflare.com/92c37cab8c839c9c1813f2d1d92f8b49/pages/view/math3d-app/2b50b6c4-86da-467f-95ce-13c2fbfe0b5e). Chrome loaded `math3ds.pages.dev`, `math3dlab.com`, and `math3d.pages.dev` with the rebuilt public site, and `app.math3dlab.com` rendered the interactive sphere. The app alias briefly served stale HTML during the deployment transition; a subsequent navigation loaded the new assets. No further setting change was made.

This is production build and initial-load evidence on one commit. Verify fresh preview status on the next PR push and keep release items **15 and 16 open** until hosted Project/source persistence, authorized worker routes, external scene transport, permissions, failure behavior, import/export/reopen, layout, locale, and offline-after-load journeys pass on exact deployed bytes. The platform matrix must continue to describe hosted browser support as limited until then. Windows signing, live Sage, installed journeys, upgrade, and GA audit remain separate gates.
