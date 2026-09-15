# Replayable Complex sessions (C09)

C09 defines `.math3d-complex` as canonical JSON using the
`math3d.complex-session` format. A session contains the authoritative
`ComplexAnalysisDocument`, a checkpoint plus reversible command log and cursor,
compact F06 result envelopes, explicit unavailable artifact references, and engine
availability metadata.

Save/reopen never embeds sampled grids or silently recomputes missing work. F07
payloads reopen as `unavailable / payload-not-embedded`; external Sage provenance is
retained while its runtime state reopens as `needs-compute`.

Legacy C02 document snapshots migrate to an empty replay checkpoint. Existing result
references are marked unavailable and a migration diagnostic asks the user to
recompute rather than fabricating provenance.

The structured notebook export contains source generation, normalized AST, and
allowlisted derivative/poles/residue/series requests. It contains no Python, shell,
`eval`, or arbitrary Sage source.
