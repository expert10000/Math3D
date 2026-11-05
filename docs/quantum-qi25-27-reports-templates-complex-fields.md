# QI-25–27: reports, Study templates and complex fields

Implemented 2026-11-05 across Theory Lab and Math3D.

## Reports

Theory Lab exports a self-contained `.qreport` folder from an independently reopened saved run. It includes exact input/result bytes, an optional binary artifact, a full-sample SVG figure, numerical settings, source and file hashes, and a validation summary. Unsupported uncertainty or convergence claims are explicitly absent. A changed source artifact blocks export. See Theory Lab `docs/QI25_27_REPORTS_COMPLEX_FIELDS.md` for the format.

## Reusable Math3D Study layouts

`QuantumStudyDocument` has optional `templateId` metadata. The five layouts are QWZ curvature/bands, SSH finite chain/bands, Rice–Mele periodic/finite pump, Hofstadter bulk/strip and hydrogen density/phase. A Project can build a template from admitted read-only scene documents. Source selection requires the same exact run ID, result SHA-256 and model. The required scene roles are checked from scene object IDs or scene IDs, and unavailable views are refused. Hydrogen uses two layout panels against one verified complex-field scene; the user selects the named quantity in its field viewer. Layout and selected objects are stored separately from the scene datasets. Changing rows/columns or a panel selection cannot modify source hashes.

Existing QWZ and Hofstadter handoffs receive their matching template metadata when their supplied roles match. Older Study documents without `templateId` remain valid. Project saves reverify the attached quantum sources.

## Complex-field viewing

Theory Lab's verified viewer adds amplitude and two signed-component zero surfaces alongside density, signed components and cyclic phase. The component surfaces are display geometry; their intersection is a complex node. Absolute phase and signed components depend on arbitrary global phase. Math3D's independently verified field slice now includes `|ψ|` amplitude, and its saved Field view state accepts that display quantity. Phase remains undefined at near-zero density.

Verification: focused Theory Lab figure/field tests and Math3D Study/field tests passed. The Math3D worktree's local workspace links were pointed to this checkout before running its tests. Desktop Study handoff and Field Explorer flows are checked with Playwright.
