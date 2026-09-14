# Topology v1 canonical regression corpus

T01 freezes the reviewed mathematical expectations that later Topology v1 commits
must preserve or intentionally migrate.  The data lives in
`tests/fixtures/topology-v1/canonical-regression-corpus.json`; the fixture contains no
algorithm implementation and the T01 commit changes no production or persistent-
format code.

## Inventory

The corpus contains exactly ten cases:

- point and circle as minimal CW complexes;
- an independently authored two-bigon sphere;
- the released torus, cylinder, Möbius-band, RP², and Klein-bottle teaching presets;
- the Moore space `M(Z/3,1)` as one vertex, one loop, and one degree-three 2-cell;
- a deliberately invalid complex with a dangling edge endpoint and face attachment.

Preset-backed cases freeze released preset identity and behavior.  Explicit CW cases
avoid treating a display mesh or diagram as the definition of the space.  The corpus
does not add, rename, reclassify, or alter a teaching preset.

## Authority policy

Every claim carries one of four authorities:

- `exact` — finite incidence, integer boundary matrices, chain condition, integral
  homology, or mod-2 homology computed from the declared complex;
- `certified-within-model` — surface eligibility and classification under the
  finite-2-complex link/manifold checks;
- `unsupported` — output deliberately withheld because a prerequisite fails;
- `illustrative` — a diagram or R³ realization that helps teaching but proves no
  topology.

No pixels, camera state, animation phase, layout, timestamps, frame times, sampled
points, or numerical tolerances are mathematical oracles.  Stable realization ID
suffixes and kinds are checked only as illustrative source-to-view compatibility.

An ineligible surface is not necessarily an invalid CW complex.  Point, circle, and
Moore-space incidence supports exact cellular algebra while failing the stricter
closed/bordered-surface link conditions.  Their classification result therefore
certifies ineligibility within the model instead of assigning a surface name.

## Expected layers

Each fixture declares:

- canonical vertex/edge/face counts;
- structural validity and cellular-algebra eligibility;
- required focused diagnostic codes;
- exact `d1` and `d2` matrices, or explicit unavailability;
- integral group notation, independent mod-2 dimensions, and H1 torsion;
- surface-classification status, eligibility, and label;
- one exact source-cell-to-canonical-cell reference;
- one illustrative realization example where a current teaching view exists.

Tests replay every fixture twice and compare canonical hashes.  Exact boundary and
homology assertions use the existing reviewed implementation, while the fixture
schema/inventory and authority rules are checked separately so malformed corpus data
cannot silently weaken coverage.

## Invalid-case rule

The invalid fixture intentionally preserves enough source structure to locate both
errors.  Structural validation must report `edge/dangling-endpoint` on edge `bad` and
`attachment/dangling-edge` on face `f`.  Boundary construction, homology, and surface
classification must all remain unsupported and must publish no value.

This is the fail-closed baseline for T04 and later job-routing work: viewability of a
legacy or invalid source never authorizes best-effort formal algebra.

## Migration contract for T02 and later

T02 may wrap these sources in a versioned `TopologyDocument`, and T03 may replace the
current canonicalizer contract, but a changed fixture fact must be named explicitly
in that commit.  In particular, later work must distinguish:

- source-schema migration from a mathematical change;
- canonical-cell renaming from changed incidence;
- algebra artifact storage from changed matrix entries;
- improved recognition from certified classification;
- a changed R³ realization from changed topology.

Adding a stronger theorem is allowed only with a correspondingly stronger authority
and reviewed fixture expectation.  Illustrative output must never be promoted to an
exact or certified oracle merely because it looks correct.
