# G2D34 visual, numerical and migration corpus

Implemented 2026-09-28. Automated runtime comparisons are separate from [MOB-G13 physical acceptance](mobile-graphs-g11-g13-acceptance.md).

## Maintained inputs and oracles

`packages/core/fixtures/graph2d/parity-corpus-v1.json` contains 13 language-neutral recipes: quadratic, reciprocal pole, explicit/parametric/polar half-undefined domains, tiny and extreme domains, parametric/polar circles, implicit circle, strict disk, piecewise jump and point-series missing-row gap. All seven Graph kinds are represented. `tests/fixtures/graph2dParityCorpus.ts` builds ordinary core documents and separate point tables; it adds no platform schema.

Independent analytic checks cover coordinates/radii, contour residuals, region predicates, strict boundaries, missing rows, gap separation and open piecewise endpoints. All emitted coordinates must be finite and samples stay within policy. The mobile projector additionally checks bounded line/fill counts and finite native geometry, without modifying canonical source.

Undefined explicit/path cells stop refining at a bounded resolution (four pixel tolerances, at least one pixel; path cells use parameter fraction and the larger viewport dimension). They remain gaps with `unresolved-cell` diagnostics and `converged: false`. This fixes half-undefined domains exhausting the budget before the valid half, including low-policy phone/tablet requests. Narrow valid islands can still be missed; the scan does not prove absence.

## Runtime comparisons

- `test:graph2d:parity:unit` runs 16 corpus tests in separate Node processes with UTC and Pacific/Auckland timezone environments. Full documents, rounded derived geometry, deterministic v0 migration/diagnostics and Curve/revolution/extrusion snapshots have identical portable report hashes. On this Windows host both processes report `en-US`, despite different `LANG` variables; locale independence is checked by the real browser contexts and by rejecting localized comma/Arabic numeric input as portable numeric syntax.
- `test:graph2d:parity:web` runs shipped browser assets in Chromium under `en-US`/UTC and `pl-PL`/Pacific-Auckland. A real sampling Worker receives the same fixture requests, and every returned field is compared against Node output. It then opens each fixture through the shipped handoff UI, checks rendered SVG paths/fills/endpoints/data gaps, captures the viewer and verifies worker ownership is released. Optional external analysis backends are unavailable in this test; Graph sampling remains local.
- Cross-runtime coordinate comparisons allow absolute error `1e-8` or relative error `1e-12`, whichever is larger. Analytic residual tolerance is `1e-10`; grid-derived circle residual tolerance is `0.03`. Array topology, strings, identifiers and diagnostics must match. Screenshots are review artifacts, not pixel-perfect font/GPU equivalence claims.
- Mobile projection/model coverage runs in Node. Neither these comparisons nor Android bundle success demonstrate Hermes/iOS runtime or physical UI parity. Run the same committed fixtures on exact release devices and attach that evidence to G13.

The corpus also covers v0/v1/future schemas, AST/source identity corruption, checksum-checked sidecar failure, unknown capabilities, cancelled/stale publication tokens, explicit deadline exhaustion and promotion geometry. Session/result staleness and conflict handling are covered by [G2D33](graph2d-g33-round-trip-acceptance.md).

## Recorded checks

- Node 24.16.0: two runs of 16 corpus tests passed with matching portable report hash `74b2dea28ada11fe283a234c278591e6c1ab51488bad6269d994a865917a90b2`.
- Chromium: both locale/timezone projects passed, each exercising all 13 worker and UI fixtures; 26 viewer captures generated under `output/graph2d-parity`. Reviewed representative square-root valid-half and strict-disk captures.
- Focused desktop suite: 97 tests in 28 files passed.
- Mobile model/service suite: 227 tests in 48 files passed.
- Corpus, E2E, Node/renderer and mobile no-emit TypeScript checks passed; production core/renderer and web builds passed. All 19 built Electron Graph/handoff scenarios passed after the sampling fix.

```powershell
npm run test:graph2d:parity
npm run test:graph2d:desktop:unit
npm run test:graph2d:mobile:unit
npm run typecheck:noemit
npm --prefix apps/mobile run typecheck
```

Regenerate/review captures after algorithm changes. Keep fixture sources and numeric/diagnostic oracles together; increase tolerances only with a documented mathematical or runtime reason. Never promote generated software reports into physical-device attestations.
