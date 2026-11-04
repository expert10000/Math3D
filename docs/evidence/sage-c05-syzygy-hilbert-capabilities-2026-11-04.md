# SAGE-C05 syzygy and Hilbert capability gates — 2026-11-04

## Delivered

CAS → Algebra → Operations now offers **Generator syzygies** on a saved ideal and **Quotient Hilbert series** on a saved quotient ring when the Docker Sage route advertises the matching operation. The worker probes those Sage APIs before adding either operation to `/health`; an older or incapable worker leaves the corresponding control disabled with a route-specific reason. Each request uses the C02–C04 versioned ideal envelope with pinned object, ideal and ambient ring revisions and hashes. Both results can be saved as Project evidence and inspected after independent import.

The syzygy result is a matrix whose columns follow the pinned generator order. Before returning it, the worker checks each row's exact linear combination of those generators is zero. The Inspector identifies this as a worker check and displays the rows without claiming an independent app-side symbolic proof.

The Hilbert result is the **standard graded quotient** `R/I` series, numerator and Krull dimension. It is available only for a direct `QQ` polynomial ring in a graded monomial order and generators whose homogeneity the app can conservatively establish. The worker additionally checks Sage's `is_homogeneous()` before computation. A homogeneous expression with unsupported parenthesized syntax remains disabled until a stronger grading parser is added; the app does not infer grading from a merely syntactically valid ideal.

Both advanced operations use at most two variables and three generators, in addition to the C02–C04 polynomial syntax, degree, term and output limits. C06 will extend budget and cost presentation. Unsupported cases are explicit: unavailable runtime operation, lex order for Hilbert, nonhomogeneous or unproven generator syntax, and advanced input size above the C05 bound.

## Acceptance

For `R = QQ[x,y]` with `degrevlex`, `I = ⟨x,y⟩` and quotient `R/I`, live local Sage 9.5 returns the generator syzygy row `[-y, x]`, Hilbert series `1`, numerator `t^2 - 2*t + 1`, and dimension `0`. The worker fixtures check those exact values and reject lex order, a nonhomogeneous generator, too many variables or generators, and an unknown request field. Core tests gate missing advertised capabilities, check unsupported domains and result shape, and independently reopen pinned syzygy and Hilbert evidence. Desktop acceptance uses a controlled HTTP worker to check both run controls, disabled nonhomogeneous Hilbert, Project export and fresh-profile result inspection.

The local worker test uses real Sage 9.5 arithmetic. The desktop HTTP fixture tests routing, UI and persistence; it does not claim a live Docker Sage 10.10 result. **B08's live Docker Sage 10.10 comparison remains open.**

## Next

**SAGE-C06** adds operation budgets and cost warnings. Complete B08's live 10.10 comparison when its Docker runtime is available.
