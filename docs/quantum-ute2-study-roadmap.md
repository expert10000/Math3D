# UTe2 Study consumer roadmap

**Started 26 November 2026.** This is a feature track for a new Theory Lab scientific journey, not a Math3D 2.0 GA journey. The [Theory Lab source and producer plan](https://github.com/expert10000/theory-lab/blob/main/docs/UTE2_JOURNEY_ROADMAP.md) owns the physics and immutable runs. The user-supplied nine-page UTe2 chapter is pinned there by SHA-256, but its PDF is not republished in either repository.

## Consumer boundary

Math3D will visualize and cite verified Theory Lab results. It will not fit the material, choose a UTe2 pairing symmetry, minimize the Landau functional, diagonalize a BdG matrix, or calculate a Chern number on import. The October 2026 ultrasound work supports thermodynamic multicomponent competition and a fluctuation regime; the chapter's 2×2 BdG, p_x/p_y, and square-lattice chiral examples are pedagogical. A toy Chern number or edge state must never be presented as a measured UTe2 topological phase or Majorana observation.

## Product journey

1. **Source:** Open a Lab-produced, hash-verified run and scene bundle. Identify its model class (`two-component GL`, `single-sector BdG`, or `class-D lattice toy`), parameter conventions, solver method, source chapter section, and whether a value is observed, inferred, or calculated in a toy model.
2. **Study:** Create a Project-owned Quantum Study from exact GL minima/phase-map or k-space energy/gap/phase scenes. Persist immutable source fingerprints and separate mutable camera, selection, and layout state. Reopen the exact source before showing selected values.
3. **Inspect:** A GL selection can show supplied free-energy/minimum and stability values. A BdG selection can show supplied momentum, energies, weights, gap and phase with undefined phase at nodes. A topology selection can show a supplied invariant only with a full-gap and convergence receipt. Never infer missing samples, phase, experimental boundary positions, or topology from colors.
4. **Cite and transfer:** Export a bounded JSON evidence report and a Workbook citation with run/result/scene/dataset hashes, units, numerical method and omissions. Reopen after restart and Project transfer. Changed or absent source withholds values and labels the reason.

## Delivery order and gates

| Step | Math3D delivery | Acceptance |
| --- | --- | --- |
| M3D-UTe2-0 — intake **done** | Record the source claim boundary and consumer plan while Theory Lab pins the chapter. | No new UTe2 support claim, Project type, or release gate is inferred from the document. |
| M3D-UTe2-1 — GL consumer **done, source checkout** | Admit the Lab-produced `two_order_landau` GL scene with dimensionless axes, stationary/stable/global roles, source digest and candidate-minimum receipt. Save one source-pinned Project Study and Workbook citation. | Exact bundle verification, layout/save/restart, tamper refusal, and no extrapolated phase boundary passed with the frozen Lab fixture. Installed binaries remain untested. |
| M3D-UTe2-2 — BdG consumer | Add linked energy, gap and complex-pairing panes with independently verified source arrays and node masks. | Coordinate/array/unit match, undefined-node handling, source mutation, Project transfer. |
| M3D-UTe2-3 — conditional topology | Display the Lab's convergence and full-gap qualification alongside a supplied invariant and optional edge scene; withhold it at gap closure. | Gapped/trivial/transition fixtures, independent source recheck, explicit toy-model labels. |
| M3D-UTe2-4 — installed pair | Exercise one exact installed Lab producer and Math3D consumer through fresh launch, saved Project, restart, export, transfer and source mutation. | Matched binary/source/scene hashes, reproducible visual review and written claim limits. |

The first consumer uses Theory Lab's UTe2-4 scene producer without a schema change. Its `quantum-scene/v1` fixture contains four stationary candidates and stable/global role subsets from one bounded, dimensionless Landau result. Math3D reopens the exact bundle before showing a selected candidate and checks its free energy against declared coefficients; it does not minimize or extrapolate a phase diagram. `npm run test:quantum:ute2-landau` covers import, altered and forged source refusal, Project save/restart, selection, and value withholding after source mutation. The chapter PDF remains local and is absent from the fixture. Next is M3D-UTe2-2's BdG consumer; the installed-pair gate is still separate. This track is independent of QI-40 installed-pair certification, trusted Windows GA signing, and deferred memory qualification.
