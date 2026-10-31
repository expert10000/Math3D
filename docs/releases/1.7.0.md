# Math3D 1.7.0

This release adds read-only, source-verified scientific scenes and stronger
Project comparison while keeping scientific calculations in their producers.
The existing Geometry, Mesh, Surface, Graph, Volume, and Project workspaces
remain available.

## Scientific scenes and Theory Lab

- Open Theory Lab `.qscene` bundles in Math3D to inspect supplied orbital
  fields, lattices, bands, Berry data, and bounded topology studies. Exact
  sample inspection and source hashes keep displayed values tied to the saved
  result. Math3D does not calculate those quantum results.
- The Theory Lab handoff can return from a selected scene sample to its exact
  saved run. The installed-app path verifies the run ID and result SHA-256.
- A lightweight `.sscene` interchange path accepts bounded external scalar
  grids from the pinned reference Python publisher. External producer identity
  is not authenticated by a file hash.
- The Scientific Field Explorer can inspect verified vector, scalar, and
  complex layers, link physical selections to Graphs, and reopen saved
  source-backed results. Derived divergence and curl-magnitude summaries are
  explicitly scoped to their sampled regions and units.

## Projects and comparison

- Projects retain references to verified scientific sources without embedding
  large numerical arrays. Missing or changed sources withhold the affected
  values until relinked and reverified.
- Saved Mesh, Geometry, and bounded Surface documents can be compared side by
  side. Workbook reports and exports identify exact source revisions and
  distinguish verified alignment from operator-asserted alignment. Legacy
  sources without coordinate metadata do not gain a verified alignment claim.
- The published v1.6.0 Project and settings migration path is covered by a
  separate installed-app upgrade gate.

## Release checks

The stable release workflow builds Windows and Linux packages and archives
their hashes. On separate fresh Windows runners, it installs the exact final
Math3D and Theory Lab installer files, creates a saved Lab run and `.qscene`
through the installed Lab UI, and verifies the selected source-run handoff.
It also installs the published v1.6.0 Math3D package first, saves a Project and
setting, upgrades with those same final files, and checks that both survive.
Publication is gated on both results and on matching installer hashes. The
release artifacts include the candidate manifest and signoff evidence.

The Android companion remains separately versioned at 1.6.0. This desktop
release does not add a quantum worker or native scientific compute engines to
Math3D, and it does not certify new mobile hardware or iOS support.

Detailed scope and evidence: [quantum integration roadmap](docs/math3d-quantum-integration-roadmap.md),
[scientific field roadmap](docs/scientific-field-explorer-roadmap.md), and
[installed-app signoff](docs/stable-two-app-signoff.md).
