# SURF-05 source-built Surface journey

Status: draft source-built Windows qualification. Initial local source was PR #92 `3533661072e986f691eca894716523dab45db71f`; the 11-case gate was rerun after rebasing on its newer production source `5cd220b5d2812a471c332278131214627cf05867`. The stronger recipe test branch head `7e7f354c794df23009781e0f0b9e2a3c6849f9ca` was exercised locally: 11 passed, 0 skipped, 0 retries, 1.3 minutes. This branch adds native tests and a scoped workflow; it does not edit production code. CI must report its own checkout SHA before its PASS is attributed to that head.

## Native evidence matrix

| Journey part | Native assertion | Status and boundary |
| --- | --- | --- |
| Implicit Sphere, parametric Torus, spline Bezier and Weierstrass Enneper | `surf05-recipes.spec.ts` switches to each default recipe, checks the named canonical source and canvas, inspects domain/sampling/units/backend readiness, runs curvature and checks current statistics. | Local PASS. The result is sampled/approximated; this does not certify every preset or numerical accuracy independently. |
| Parametric analysis and saved result | `surface-functional.spec.ts` Test 3 runs curvature, checks method/readiness/result, saves, compares and recomputes. | Local PASS. Existing computation provenance remains a dependency-freshness claim, not independent mathematical certification. |
| Source change after analysis | `surf05-recipes.spec.ts` saves Torus curvature, switches to a spline source, checks the prior saved reference is retained and no old curvature statistics publish into the new source. | Local PASS. The new source reports `unavailable` until analyzed. |
| Derived bake and mapped return | `surface-functional.spec.ts` Tests 7 and 8 check live, regenerated, baked and detached Mesh states, geometry bytes, Mesh Analysis and return to the Torus mapped selection. | Local PASS. This is the native source-built representation journey. |
| Promote | `surf05-recipes.spec.ts` invokes **Promote to SurfaceMesh**, observes the Mesh workspace and `Source: Param: Torus` / `baked from param` lineage. | Local PASS. No claim of exact analytic geometry for the sampled Mesh. |
| Saved Project, resource transfer and cold reopen | `saved-surface-workflow.spec.ts` edits Weierstrass formula/domain, tests undo/redo, creates two linked Mesh generations, runs saved analyses, edits a Mesh so earlier results become historical, exports three verified resources, imports into a new profile and cold reopens. | Local PASS. Exact saved results, Surface formula, Mesh generations and historical status are asserted after reopen. |
| Local Surface result reload | `surface-functional.spec.ts` Test 11 saves curvature and a baked Mesh then reloads and checks both references. | Local PASS. Local reload is distinct from the full Project transfer above. |

Local command: `npx playwright test tests/e2e/surf05-recipes.spec.ts tests/e2e/saved-surface-workflow.spec.ts tests/e2e/surface-functional.spec.ts --grep 'SURF-05|PRJ31–33|Test (3|7|8|11)' --workers=1 --retries=0 --reporter=list`. Native Electron on Windows; zero retries. `npm run build:main`, `NODE_OPTIONS=--max-old-space-size=8192 npm run build:renderer` and `npm run typecheck:noemit` were also executed on the refreshed source. The scoped workflow repeats the 11 native cases at its checkout and uploads the exact checkout SHA and JSON results.

## Remaining boundaries

- Installed Windows executable, installer/upgrade and release E8 are not covered here.
- The four recipe checks establish current default-source computation with visible method inputs. Detailed parameter/domain edits are exercised on saved Weierstrass, while implicit custom-expression and parametric/spline parameter validity retain their existing owner suites. No universal numeric backend certification is claimed.
- Missing-resource safe withholding, late Job completion after a source generation changes, offline runtime recovery and cross-frame/unit rejection need separate negative-path receipts before SURF-05 can be promoted to a complete release acceptance claim.
- PR #92 combined source integration and this stacked test branch require exact-head CI review before merging. Do not transplant a local PASS to a later PR #92 head without rerunning.
