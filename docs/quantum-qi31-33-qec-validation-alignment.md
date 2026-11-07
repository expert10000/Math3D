# QI-31–33: QEC evidence, validation and comparison alignment

Implemented 2026-11-05 across Theory Lab and Math3D.

## QI-31

Theory Lab Atlas presents a pinned three-qubit repetition-code evidence record. The reviewer verifies the source SHA-256, round order, stabilizer syndromes against recorded X faults, defect changes, final single-error correction and residual logical result. The example deliberately demonstrates a logical failure after two faults. It is bounded evidence, not a general decoder, threshold study or worker simulation.

## QI-32

Theory Lab's Runs provenance view reopens the saved result and artifact, then measures population normalization, trace, damped-oscillator density-matrix Hermiticity or resolved eigenvector orthogonality when those data are available. It displays producer invariant and resolution status, cutoff sensitivity, warnings, and unavailable checks. Math3D's scene inspector adds a companion dashboard for verified source identity, mapped/deferred geometry, producer invariant status and limitations. Math3D does not recompute Hamiltonian checks from scene geometry.

## QI-33

The saved-run A/B panel defaults to exact shared coordinates. An explicit option aligns compatible scalar series by linear interpolation over their overlap, with unit conversion limited to declared compatible coordinate/value units. It never extrapolates or invents error bars; the result carries policy and uncertainty flags. For resolved two-level eigenstates, squared overlaps match states without comparing gauge-dependent amplitudes. Degenerate, missing or ambiguous state pairs are withheld.

Focused tests cover source tampering, syndrome consistency, logical outcome, physical-check availability, unit conversion, overlap-only interpolation, exact-default behavior, and eigenstate matching guards.
