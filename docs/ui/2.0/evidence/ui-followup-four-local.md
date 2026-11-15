# SURF-03, CA-04, SURF-04, MESH-03 source-build evidence

Date: 2026-11-15. Branch: `codex/ui-followup-four`. Draft [PR82](https://github.com/expert10000/Math3D/pull/82). Production source built at `7dbd7e571614a42bb0379581036dc184a67c32f1` with `dirty: false`; `dist/build-identity.json` records renderer SHA-256 `92a8d8722797d8cb26e8de68e5ce10974097238aa6835114ba9d2a227db27d14`. This is a source build, not an installed or signed candidate.

- `npm run typecheck:noemit`: PASS, exit 0. It began before the final test-only navigation correction; scoped CI repeats typecheck at the PR head.
- `npm run build:core`: PASS, exit 0; 2,408 Vite modules transformed.
- Native Electron Playwright, `--workers=1 --retries=0`: PASS, five tests, zero skips. Command: `npx playwright test tests/e2e/surface-functional.spec.ts tests/e2e/complex-numerical-results.spec.ts tests/e2e/complex-exact-mvp.spec.ts tests/e2e/mesh-operations-card.spec.ts --grep 'Test 3|Test 8|publishes qualified numerical evidence|analyzes 1/z|expands rows' --workers=1 --retries=0 --reporter=list`.
- Surface tests checked compute readiness beside Curvature Run and Source→Mesh lineage/available geometry before Bake, then a live/baked Mesh Analysis round trip. Complex tests checked the preflight before numerical publication and exact 1/z analysis. Mesh test checked the top action bar on a real Decimate result and used its Details action to focus the result.
- An initial Complex test run failed before the new preflight assertion because the older test selected the main Residue view but left Inspector on Monodromy. The test now opens Inspector → Provenance → Residue explicitly. Both Complex tests passed after the correction; no production change was needed.

The focused [Windows workflow](https://github.com/expert10000/Math3D/actions/workflows/ui-followup-four-scoped.yml) checks the PR merge preview and uploads source identity and native results. Windows CI, other PR overlap review, broader scientific acceptance, and signed candidate qualification remain separate.
