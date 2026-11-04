# GF-10 — oriented polyline and line integral

**Status:** first analytic-source Project and Field Explorer gate implemented, 2026-11-04.

The shared `ScientificSelection` contract now accepts a bounded 3D `oriented-polyline`: 2–64 ordered physical vertices, open or closed path, and explicit forward or reverse direction. It is saved in the Project's `scientificSelections` collection with an authored stable ID, Cartesian axis labels and units, and the exact vector-document generation. Existing point, axis-line, plane and region selections retain their schema and meaning. Reversing or editing a path retains its ID and changes its geometry hash.

An authored expression vector field can be integrated along the saved path. The first method is segmentwise composite Simpson quadrature with eight cells per segment and a Richardson error estimate from coarse/fine evaluations. It has a hard 8,192-evaluation cap. The integrand is `F(r) · dr`, with direction applied to the complete value. Circulation requires a closed path. All vector components and coordinate axes must share compatible declared units; no conversion is inferred. The result records units, method, value, error estimate, segment coverage, physical length coverage, orientation, source generation, selection ID/hash, and a summary hash in the existing Project result collection. A Project relation links the source to the result.

Out-of-domain or undefined segments are excluded as whole segments. A partial result reports covered segments and length plus a partial numerical sum, but withholds a complete value and error estimate. Open circulation, unsupported scientific-bundle sources, or incompatible units are unavailable. The Project reader withholds values when the source, selection, or compact result changes. Scientific-bundle execution awaits the verified transfer path in the foundation exit gate.

Field Explorer offers a vertex editor, closure and orientation controls, an explicit save step, line-integral or circulation measurement, and saved-result status. The focused tests cover conservative and rotational analytic oracles, sign reversal, incomplete paths, bounded evaluations, source/selection withholding, and Project save/reopen. The desktop gate covers saving a rotational circulation, reversing its path, and reopening the Project with the new result current and the old result withheld.

The [verified bundled-source foundation exit gate](graph-field-explorer-convergence-roadmap-2026-11-03.md) remains open.
