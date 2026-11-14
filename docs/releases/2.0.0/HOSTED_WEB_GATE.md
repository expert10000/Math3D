# M3D20-15 — hosted web qualification

**Review date:** 2026-11-14. **Status:** open. This receipt covers the public GitHub Pages host, not a signed Windows candidate or the broader browser journeys in TODO #16. The successful [Docs Pages deployment](https://github.com/expert10000/Math3D/actions/runs/43595558137) published source `afbed18ac9b46f35a091faa615e952d4f8d5b9c0`. The scientific import and cold-reopen check below was repeated after that deployment completed.

## Deployment and PR checks

- The documented public app at [GitHub Pages](https://expert10000.github.io/Math3D/app/) returned HTTP 200 and loaded the MATH3D workspace. Its publisher is `.github/workflows/docs-pages.yml`; the cited run passed both build and deploy jobs.
- Cloudflare's `math3d`, `math3d-app`, and `math3ds` checks report **Build failed** on each of [PR #53](https://github.com/expert10000/Math3D/pull/53), [#54](https://github.com/expert10000/Math3D/pull/54), and [#55](https://github.com/expert10000/Math3D/pull/55). The same three checks failed on unrelated `main` commits `e77ad753` and `d15c694e`, and the checks on `afbed18a` were also red during this review. GitHub check output contains no build log or error line; its detail links open the Cloudflare dashboard, which redirected this reviewer to sign-in. The exact Cloudflare build failure is therefore **undetermined**, and these checks do not establish a regression in the three PRs.
- GitHub Pages and the Cloudflare projects are distinct deployments. A successful GitHub Pages run does not clear the Cloudflare checks. The public `math3d-app.pages.dev` and `math3ds.pages.dev` roots returned HTTP 200 during review, while `math3d.pages.dev` returned 522; those responses do not establish the code revision or the cause of a failed Cloudflare build.

Cloudflare build-log handoff for the same `afbed18a` source commit: [math3d](https://dash.cloudflare.com/?to=/92c37cab8c839c9c1813f2d1d92f8b49/pages/view/math3d/08f946cd-3fb5-42ce-bbe0-df8d353ac06b), [math3d-app](https://dash.cloudflare.com/?to=/92c37cab8c839c9c1813f2d1d92f8b49/pages/view/math3d-app/94ab7b26-afbd-4e09-ae42-02f8a2c3e67c), and [math3ds](https://dash.cloudflare.com/?to=/92c37cab8c839c9c1813f2d1d92f8b49/pages/view/math3ds/fb5dd768-3942-4e85-825b-167d27bf0fbd). These links require access to the Cloudflare account.

## Observed hosted capabilities

| Area | Check on the public GitHub Pages app | Result and claim boundary |
| --- | --- | --- |
| Basic browser storage | Opened the Minimal Surface Study starter in a fresh browser session, reloaded, declined workspace autosave recovery, and opened Projects. | The saved library still contained the starter Project. This is one Project persistence round trip, not full TODO #16 qualification. |
| Browser file permission and source intake | Selected a ZIP of the checked-in `tests/fixtures/scientific-scene/vortex-volume.sscene` through the hosted Project import picker. The review named *Swirling flow* and reported four available, hash-verified sidecars. | The picker and current-page verification worked. No server upload or general external-scene permission policy was established. |
| Scientific source cold reopen | Opened the verified imported Project, then reloaded and reopened its saved copy on deployed `afbed18a`. | Initially the viewer reported verified samples for `vortex-volume`; after reload it reported **“verification failed; repair or relink the source”** and **“Scientific vector fields require the desktop source verifier.”** Persistent hosted scientific-source availability is **not qualified**. |
| Worker and Sage routes | Compute Center on the hosted app showed Python worker, VTK, CGAL, and all Sage routes unavailable. GET requests to `/api/worker/diagnostics` at the host root, `/Math3D/`, and `/Math3D/app/` returned HTTP 404. | The published static host has no authorized worker gateway. Do not claim hosted worker-backed computation or Sage execution. Browser-local JavaScript and Web Worker indicators are separate facilities. |

The [web app guide](../../../apps/web/README.md) already states that the GitHub Pages bundle lacks a backend by default. The import/reopen observation does not test a malicious archive, revoked browser storage, a different browser profile, network interruption, authenticated gateway access, or an installed package.

## Closure handoff

1. A Cloudflare account operator should open the build logs linked from the three failed checks on a single commit, record the first failing command and error, and compare each project's root directory, build command, output directory, Node version, and environment with the corresponding repo build and the working Docs Pages workflow. Re-run all three projects on the same reviewed commit and retain the log URLs. Do not infer the error from the GitHub status alone.
2. Keep the hosted claim **limited**. To promote external scientific scenes, fix or explicitly exclude the cold-reopen path, then prove verified bytes survive a fresh browser session, changed/missing source refusal, and export/import on the deployed revision. This is separate from the source-build Field flagship journey.
3. An advertised hosted worker operation needs a deployed, authenticated gateway with an operation allowlist, quotas, origin and credential policy, live health/capability evidence, and tested denial, timeout, and offline paths. The current static host supplies none of that. If no gateway is planned for 2.0, keep worker-backed operations out of the hosted claim.
4. Finish the Project, Study, Workbook, import/export, locale, narrow-layout, and offline-after-load host journeys in TODO #16 before broadening the public capability matrix. Bind the receipts to one deployment revision and its published asset identity.

TODO #15 remains open; the observations support a limited static browser claim only.
