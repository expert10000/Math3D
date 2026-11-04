# GF-05 — shared derived profile provenance

**Status:** first GF-04 profile presentation implemented, 2026-11-04.

## Contract

`buildDerivedProfileProvenance` projects a saved Project magnitude → plane slice → line profile chain and an optional GF-04 cache result into one read-only record. It keeps the original source ID, revision and structural hash separate from the Project's current source revision/hash. It reports the three saved operation identities and parameters, physical plane and line coordinates, units, requested sample count, actual available rows, and the method only if a result supplied one. A result is current only if the Project recipe key, source generation, axis, unit and sample count match and the source verifier approves the saved generation. Otherwise it exposes zero rows and an explicit reason: no computation, changed source, unverified or missing source, changed recipe, or mismatched result.

The same `DerivedProfileProvenanceCard` renders the record in the Graph inspector and Field Explorer inspector. The desktop adapter runs the existing GF-04 broker job for verified authored expression sources. It never treats an unverified scientific bundle as an analytic source. The numerical result stays in the job cache; Project save/reopen preserves intent and requires source verification before any cached row is released.

Verified transfer coverage is optional. The projection accepts it only for a current scientific-bundle source and a matching source generation, with valid per-component sample hashes and bounded chunk/tile counts. It does not derive coverage from the recipe, infer it from sample count, or display it for the analytic fixture. Scientific-bundle profile execution remains outside GF-04/GF-05's implemented backend.

## Review gate

`renderer/src/kernel/derivedProfileProvenance.test.tsx` computes the fixture's real 17-sample GF-04 result, checks pinned source and physical operation metadata, and renders the identical data in both views. It reopens the Project, un-verifies the source and then changes the source revision; both presenters explain why values are withheld while preserving the original pin. It checks that a recipe without a result has no invented method or coverage. A second fixture creates a scientific-bundle chain and obtains actual verified three-component slice evidence; coverage appears only with its matching generation and an approving verifier.
