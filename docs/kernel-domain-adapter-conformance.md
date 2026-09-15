# Kernel domain-adapter conformance

GK03 establishes a reusable, framework-neutral migration gate for Math3D domain
adapters. A module is not kernel-migrated merely because its user interface works;
its authoritative adapter must pass the same lifecycle vocabulary.

## Document contract

`runDomainAdapterConformance` accepts a small fixture around a real adapter and
checks strict identity, transient preview, one-revision structural commits, atomic
rejection, undo/redo, replay, save/reopen parity, and isolated queries. The fixture
returns canonical snapshots, so it works in Vitest today and can be reused by
browser and desktop test adapters without importing React or Three.js.

Topology and Complex Analysis are the reference implementations. Their production
command adapters—not mock kernels—run through the same fixture. Existing focused
suites remain authoritative for result provenance, artifacts, jobs, cancellation,
deadline behavior, stale publication, relations, dependency invalidation,
persistence, and capability routing; `test:kernel:gk03` composes those suites into
one gate.

## Selection contract

`runSelectionConformance` checks the shared selection lifecycle independently of a
particular viewer:

- hover remains transient;
- selection commit and empty-space clear follow the declared history policy;
- structural changes preserve only stable identities or clear stale selections;
- a committed selection can locate its source entity; and
- Inspector reads cannot mutate selection authority.

The reference fixture uses the released `UnifiedSelectionSet` implementation.
Geometry, Mesh, Surface, Curve, and Volume must provide equivalent fixtures before
their kernel migration group closes.

## Gate

Run `npm run test:kernel:gk03`. The command executes the reusable fixtures, the
Topology and Complex command/persistence suites, and the existing cross-cutting
dependency, artifact, and scientific-job suites, followed by repository typecheck
and core builds.
