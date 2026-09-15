# Complex Analysis command boundary

C04 defines command-owned mutation for `ComplexAnalysisDocument`. The registered
commands cover function definition, parameters, domain, sampling, contours and
paths, branch policy, covering settings, Möbius transformations, committed
selection, analysis requests, and 3D value-surface requests.

`ComplexAnalysisCommandAdapter` is the compatibility bridge for current React lab
state. Candidate state is compared and committed in the migration order specified
by the roadmap. Interactive and imported commands use the same validator/projector
registry and therefore produce the same canonical document.

Text entry remains a transient preview until `commitFunction` is called. Hover,
dragging, animation, and panel state never create commands. A committed mathematical
change advances the document revision, recomputes its structural hash, marks retained
results unavailable, and clears selection and pending requests. Analysis, selection,
and value-surface requests carry the exact current revision/hash.

The adapter provides reversible semantic edits, undo/redo, controlled import origin,
and a parity method for the existing panels. Legacy setters may prepare a candidate,
but only the command transaction publishes authoritative document state.
