# GF-17–19 implementation checkpoint

This checkpoint adds bounded local topology, explicit two-source field comparison, and verified complex-plane analysis to the existing Field Explorer and complex-field workspace. It does not close the verified bundled-source foundation exit gate.

## GF-17: local topology and separatrices

The saved equilibrium construction remains the identity of a local candidate. A fresh equilibrium search must match its source ID, revision, structural hash, source hash, position, and residual. Eigendirections are offered only for a converged candidate with a finite Jacobian, resolved eigenanalysis, condition estimate below `1e8`, three separated nonzero real eigenvalues, and small eigenvector residuals. Complex, repeated, near-zero, or poorly conditioned roots have no branch action. Every label says **Local**.

For each eligible direction, the user can seed both signs at `0.01 × min(axis span)` from the equilibrium. Stable branches integrate backward; unstable branches integrate forward. Integration uses the existing bounded trajectory solver with at most 512 steps. The saved polyline Curve records the source generation, equilibrium ID and hash, eigenvalue/vector, signed offset, solver method, stop reason, step counts, and local classification. Project reopen retains the Curve; changing or removing its source or equilibrium makes it stale. Scientific-bundle branches still need a verified integration sampler.

## GF-18: field comparison

The first gate compares **two authored analytic 3D vector sources**. Admission requires distinct Project source IDs; identical Cartesian axis names, units, bounds, and vector component units; and an explicit `cartesian-identical` frame, `analytic-direct` interpolation, `identical` units, and `complete-or-withhold` coverage policy. A user-selectable 5, 9, 13, or 16 point lattice per axis stays within 4096 evaluations. Each point produces vector difference magnitude, signed scalar magnitude difference, and angular error. Zero vectors have undefined angular error; failed expression samples become coverage gaps. Region summaries contain count, mean, maximum, RMS where applicable. Incomplete coverage withholds comparison values.

The compact Project result pins both source IDs, revisions, and structural hashes; a relation records both sources in order. Reopen retains the result and detects either missing or changed source. The Field Explorer panel shows both provenances and the withholding reason. Resampling scientific bundles, comparing independent scalar datasets, and exporting comparison profiles to Graphs require separate verified alignment and handoff work; these are not inferred from this analytic gate.

## GF-19: complex-field analysis

The existing 3D complex-field workspace rereads real and imaginary planes through the desktop verifier and checks each plane checksum against the manifest. It computes `|ψ|²` and domain-color RGBA only from aligned verified planes. Zero or nonfinite magnitude is transparent and excluded from density. The display can switch between domain coloring and density.

An interior rectangular contour uses wrapped adjacent phase changes at full and half grid resolution. Winding is an integer only if both sums agree with that integer within 0.05 turns. Undefined contour points or near-π jumps make the winding unavailable; disagreements report inconclusive. The result shows real and imaginary source resource/plane hashes and counts. This is a discrete contour measurement of sampled data, not evidence of holomorphicity.

## Verification and remaining gates

Focused fixtures cover diagonal saddle directions, stable/backward and unstable/forward Curve promotion, Project save/reopen and stale detection; two-source comparison and change withholding; and a verified synthetic complex vortex with density, masking, converged winding, checksum rejection, and undefined contour handling. Desktop gates save and reopen the local Curve and two-source result, then reopen a verified 3D complex field, switch density/domain color, and withhold analysis when its imaginary resource changes. The verified bundled-source magnitude → slice → profile foundation exit gate remains open and must close before the full second-delivery milestone is claimed.
