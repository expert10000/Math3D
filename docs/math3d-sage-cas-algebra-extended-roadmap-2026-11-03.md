# MATH3D — SageMath / CAS / Algebra: Extended Development Roadmap

**Date:** 2026-11-03  
**Baseline:** Math3D `main` at `674e9cf6`, as documented by the uploaded 20-screenshot Sage/CAS review  
**Status:** Proposed implementation plan; not a claim that proposed features already exist  
**Scope:** Desktop Electron, web, Workbooks, CAS / Algebra, Number Theory, Geometry, Topology, Mesh, scientific runtime and eventual mobile clients

**Repository adoption note (2026-11-03):** The supplied baseline records an earlier review at `674e9cf6`. This copy was integrated against `main` at `b63de9a0`, after the [desktop CAS](evidence/cas-algebra-desktop-2026-11-02.md) and [Number Theory Workbook](evidence/number-theory-workbook-2026-11-03/README.md) acceptance gates. Section 2.6 maps the proposal onto the current UI; all unimplemented items remain proposals. The complete supplied roadmap is retained below.

---

## 0. Executive direction

The existing Math3D Sage/CAS integration has crossed the critical feasibility threshold: Sage responds to real bounded requests, exact results are inspected, runtimes are discovered, error cases are typed, evidence can be saved in Workbooks, and trusted desktop Sage code can be executed deliberately. The next phase should not be a larger flat dropdown of operations. It should be a **persistent, typed, object-centric mathematical workspace**.

**Today:** Input → choose operation → Sage → inspect result.  
**Target:** Construct mathematical objects → choose context-aware operations / recipes → obtain typed exact results → verify and explain them → persist object dependencies → visualize / export / reuse them across modules.

The system should become a coherent bridge among SageMath, GAP, Singular, PARI, Math3D's own geometry/mesh systems, Workbooks and the eventual number-theory and topology environments. Preserve the current bounded operation interface as the safe, portable path. Preserve arbitrary Sage code as a separately trusted desktop capability, never as an implicit privilege of ordinary objects or Workbooks.

### 0.1 What is verified by the uploaded review

The review README describes unmocked Sage responses from **SageMath 10.10 in Docker** on `127.0.0.1:8767` for web captures, and **SageMath 9.5 in local WSL** for explicitly trusted Electron console and Workbook-code captures. Treat those as two compatibility targets; do not pretend the same package versions, capabilities or routes are automatically present in both.

| Existing area | Evidence from supplied 20-screen package | Direction |
|---|---|---|
| Symbolic CAS | Simplify, factor, expand, solve | Add typed expression objects, assumptions, domains, safe analysis recipes |
| Multivariate calculus | Gradient, Hessian, singularity check | Add critical-point and singular-locus workflows, Jacobian/tangent geometry |
| Matrix operations | Exact eigenvalues, characteristic polynomial | Add full linear algebra and canonical form dossiers |
| Polynomial operations | Roots, factorization, Gröbner basis | Add persistent polynomial rings, ideals, elimination, quotient rings |
| Elementary number theory | GCD, modular inverse and typed failure | Add congruences, finite rings, arithmetic object explorer |
| Infrastructure | Settled Local WSL / Docker capability discovery | Add versioned capability manifest and job policies |
| Dedicated module | Number Theory workspace | Share algebra objects, not duplicated Sage bindings |
| Workbooks | Exact request/result evidence, source, backend, version | Add typed object references, dependency tracking and invalidation |
| Electron | Explicitly trusted Sage console and trusted Workbook code cell | Retain trust boundary, introduce session/cell execution contracts |

**Out of scope for the immediate P0 milestone:** rebuilding the existing viewer, allowing arbitrary Sage code in the web service, exposing raw WSL/Python subprocess privileges to ordinary projects, or implementing every branch of algebra before object persistence is stable.

### 0.2 Core product principles

1. **Object first, operation second.** Build rings, fields, ideals, groups, matrices, modules and number fields as first-class persistent references, rather than copies of Sage source text.
2. **Exact mathematics by default.** Preserve base rings, domains, exact values, basis choices, embeddings and assumptions. Numerical approximations should be explicit derived results.
3. **Context-sensitive UI.** Selecting an ideal should expose ideal operations; selecting a number field should expose arithmetic, embeddings and prime decomposition.
4. **Shared kernel, domain-specific workspaces.** CAS, Algebra, Number Theory, Geometry and Topology present different workflows while sharing object IDs, task execution, provenance and export contracts.
5. **Reproducible calculations.** Record input hashes, dependencies, Sage version, backend, algorithms, proof flags when relevant, limits and result schemas.
6. **Defensive execution.** All portable operations are bounded; arbitrary code stays behind the explicit desktop trust gate and is never silently elevated through a recipe.
7. **Visual-first when mathematical.** Cayley graphs, subgroup lattices, field towers, algebraic varieties, tangent cones and Smith-form module decompositions should exploit Math3D visualization rather than show plain text only.
8. **Capability-driven compatibility.** SageMath 9.5 (WSL) and 10.10 (Docker) are distinct supported runtimes; features must be probed, not guessed from version numbers.
9. **Small additive commits.** Build typed adapters and vertical slices without destabilizing the current Services/Inspector and Workbook flows.
10. **Tests are mathematical, not just UI snapshots.** Compare known invariants, construct certificates where feasible, and check disagreement between compatible backends.

---

## 1. Target architecture

### 1.1 Layered architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                         MATH3D WORKSPACES                              │
│ CAS / Algebra | Number Theory | Geometry | Topology | Mesh | Workbooks  │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────┐
│                    MATHEMATICAL OBJECT REGISTRY                        │
│ Rings • Fields • Expressions • Polynomials • Ideals • Matrices         │
│ Modules • Groups • Extensions • Varieties • Maps • Provenance          │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────┐
│                  OPERATION REGISTRY / RECIPE ENGINE                    │
│ Typed inputs • capability constraints • validation • typed outputs    │
│ DAG dependencies • caching • cancellations • progress • audit         │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────┐
│                    SCIENTIFIC EXECUTION BROKER                         │
│ Local WSL Sage | Docker Sage | trusted desktop session | future worker │
│ backend resolution • resource limits • structured errors              │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────┐
│                       COMPUTATION ENGINES                              │
│ SageMath (incl. GAP/Singular/PARI as available) • later specialized    │
└───────────────────────────────┬────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────┐
│                       RESULT & SCENE BRIDGES                           │
│ Exact object results • Workbook evidence • GeometryDocument           │
│ MeshDocument • graph scenes • field towers • exports                  │
└────────────────────────────────────────────────────────────────────────┘
```

Sage orchestrates several underlying mathematical systems, but **do not assume every Sage runtime has every optional backend**. The runtime manifest must report installed packages / supported algorithms and typed fallbacks.

### 1.2 Ownership boundaries

| Package/layer (illustrative; adapt to real repository layout) | Owns | Must not own |
|---|---|---|
| `core/algebra-objects` | Object IDs, mathematical type/domain metadata, stable serialization, references | Sage subprocesses, UI panels |
| `core/algebra-ops` | Typed operation catalog and capabilities | Desktop trust or direct worker transport |
| `runtime/scientific-jobs` | Job lifecycle, budgets, cancellation, progress, provenance | Mathematical presentation |
| `adapters/sage` | Sage command templates, input validation, structured extraction | Workbooks state, React components |
| `features/algebra` | Builders, explorers, operation panels, dossiers | Bare execution privileges |
| `features/number-theory` | Arithmetic workflows and dedicated navigation | A second incompatible field-object schema |
| `features/workbook` | Cell graph, object refs, reproducibility records | Private Sage internal object pointers |
| `features/geometry-bridge` | Exact-to-geometry transformations and limits | Changing source ideals or polynomials |

Existing project document identity and revision semantics should be reused rather than inventing another parallel project hierarchy.

### 1.3 Typed object contract

A possible versioned TypeScript surface (illustrative, not tied to a particular package path):

```ts
export type AlgebraObjectKind =
  | 'integer-ring' | 'rational-field' | 'modular-ring' | 'finite-field'
  | 'polynomial-ring' | 'quotient-ring' | 'number-field' | 'padic-field'
  | 'expression' | 'polynomial' | 'ideal' | 'matrix' | 'vector-space'
  | 'module' | 'group' | 'group-homomorphism' | 'field-extension'
  | 'algebraic-variety' | 'algebraic-map' | 'linear-map';

export interface AlgebraObjectRef {
  objectId: string;
  revision: number;
}

export interface AlgebraObjectRecord {
  schemaVersion: 1;
  id: string;
  kind: AlgebraObjectKind;
  label: string;
  revision: number;
  definition: unknown; // discriminated by kind and validated at boundary
  domain?: AlgebraObjectRef;
  dependencies: AlgebraObjectRef[];
  contentHash: string;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface ExactResultEnvelope<T> {
  schemaVersion: 1;
  operationId: string;
  inputObjects: AlgebraObjectRef[];
  result: T;
  exactness: 'exact' | 'symbolic-conditional' | 'numerical';
  warnings: string[];
  provenance: ComputationProvenance;
}
```

Replace `unknown` with kind-specific validated discriminated unions in the production implementation; it is used above only to keep the architectural sketch short. Raw Python `repr`/`str` is **display text, not a trusted serialization format**.

Persist **declarative definitions** (e.g. base field, generator polynomial, variable names, monomial order), not serialized live Sage Python instances. Sage objects are reconstructed by the adapter from validated definitions, respecting the selected runtime and Sage version.

### 1.4 Object identity, revision and dependencies

Each created object needs:

- Stable project-local ID and human-readable alias, e.g. `R`, `I`, `K`, `G`, `A`.
- Immutable definition revision and deterministic definition hash.
- References to exact dependency revisions, not ambiguous current labels.
- Parent/base ring or field metadata and coercion map identity.
- Source document/cell ID, result origin, optional external artifact IDs.
- Result freshness state: `fresh`, `stale`, `unavailable`, `failed` or `unverified`.
- Import/export semantics and safe conflict handling for name collisions.
- Validation that a reference graph is acyclic for computed cell dependencies; explicitly model genuinely mutually recursive mathematical specifications separately.

Changing `R = QQ[x,y]` to `R = GF(5)[x,y]` must not silently reinterpret an existing ideal `I`. Show dependent objects as stale and request an explicit rebuild or fork. Display `R@3` when stable revision disambiguation matters.

### 1.5 Operation contracts

```ts
interface AlgebraOperationDefinition<Input, Output> {
  id: string;
  label: string;
  category: string;
  accepts: string[];          // kind/domain constraints
  capability: string;        // backend capability key
  validate(input: unknown): Input;
  estimateCost?(input: Input): 'small' | 'medium' | 'large' | 'unknown';
  outputSchema: string;      // stable structured result schema id
  deterministic: boolean;
  cachePolicy: 'none' | 'content-addressed';
  executionMode: 'bounded';  // arbitrary code uses a separate trusted API
}
```

Do not allow operation definitions to carry executable user-provided code when called by an untrusted frontend. Inputs are structured data validated against a finite catalog of server-side implementations.

---

## 2. UI architecture — Structures / Operations / Recipes

### 2.1 Algebra workspace shell

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ Project: Algebra experiments      CAS / Algebra      Runtime: Docker Sage 10.10│
├────────────────────┬─────────────────────────────────┬────────────────────────┤
│ STRUCTURES         │ MAIN WORKSPACE                  │ INSPECTOR              │
│ OPERATIONS         │                                 │                        │
│ RECIPES            │ [Ring/Field Builder]            │ Type and parent        │
│                    │ [Object or analysis dossier]    │ Exact output           │
│ R  QQ[x,y]         │ [Steps / algorithm]             │ Verification           │
│ I  <f,g>           │ [Visualization]                 │ Runtime / proof mode   │
│ K  Q(sqrt(5))      │                                 │ Dependencies           │
│ A  Matrix 3x3      │                                 │ Export / Save / Open   │
│                    │                                 │                        │
│ + New structure    │                                 │                        │
├────────────────────┴─────────────────────────────────┴────────────────────────┤
│ Jobs • status • memory/time budget • provenance • Workbook link              │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Structures** displays existing persistent mathematical objects and object builders. **Operations** retains the existing bounded Services calls plus context-aware commands. **Recipes** orchestrates a series of typed operations and produces analysis dossiers. Each can live as a tab inside the existing Services left-panel design rather than introducing a second competing navigation hierarchy.

### 2.2 New object flow

1. Press **+ New structure**.
2. Select a family: ring, field, polynomial ring, matrix, group, module, extension, etc.
3. Fill minimal defining fields, with live mathematical validation.
4. Show compact preview of exact Sage definition and the expected parent object.
5. Press **Create**; run a safe constructor/metadata probe.
6. Register object in the project and automatically select its Inspector.
7. Offer immediate contextual actions based on kind, base domain and runtime capabilities.

### 2.3 Action behavior and disabled states

Actions should expose why they are unavailable: “Requires a field”, “Requires square matrix”, “Not advertised by Sage 9.5 WSL runtime”, “Dimension too high for plot”, “Unknown exactness”, “Large job requires an explicit budget”. Never hide mathematical incompatibility as a generic spinner.

### 2.4 Inspector tabs

- **Result:** formulas, exact structures, matrices, factors, solution sets.
- **Structure:** parent, base, presentation, generators, degrees, dimensions.
- **Steps:** algorithmic explanation where derivable; never invent a Sage internal trace.
- **Validation:** check identities, inverse maps, substitution, residuals or certificates.
- **Execution:** actual backend, version, algorithm, time, proof flags, limits.
- **Dependencies:** object and cell provenance graph, freshness.
- **Visualize:** available graph, 2D/3D, field tower, lattice, finite group displays.
- **Export:** copy exact expression, save object, create Workbook cell, export LaTeX/JSON/scene.

### 2.5 UI accessibility and responsiveness

Use keyboard-first command search, collapsible sections, dense/detailed modes, mathematical rendering with accessible text equivalents, error messages attached to the invalid field, focus preservation after jobs, and responsive two-panel mode on tablet. On mobile, target **inspection and lightweight bounded requests first**, leaving heavy jobs to remote workers and trusted console execution desktop-only.

### 2.6 Where this belongs in the current Math3D UI

The primary entry point is the existing **CAS / Algebra** item in the top workspace navigation, not another global module. It currently opens `CASAlgebraWorkspace`, a specialization of `SageServicesWorkspace`. The current left panel is **Services**; the right **Inspector** has **Results** and **Runtimes** views. A result can be saved to Workbook. The header opens Workbook and, on supported desktop installations, the separately trusted Sage Console. **Number Theory** is already a peer top-level workspace using the same Services shell. The global **Compute → Runtimes** view remains the authority for runtime availability and diagnostics.

| UI location | Exists at repository adoption | Proposed addition and placement |
|---|---|---|
| Top navigation → **CAS / Algebra** | Dedicated workspace with bounded Sage Services and result Inspector | Keep this entry. Make it the home for persistent algebra objects and their actions. |
| CAS left panel → **Services** | Operation catalog, inputs, backend choice and execution | Evolve this panel into **Structures / Operations / Recipes** tabs. **Operations** contains the current Services flow, with existing presets and freeform bounded inputs still reachable. |
| CAS → **Structures** | No persistent algebra object list or builder | Add project-scoped object explorer and **+ New structure**. Selecting an object opens its dossier in the main area and Inspector. |
| CAS → **Operations** | Existing catalog and result cards | Filter and validate actions using the selected object's type, parent, exactness and advertised runtime capabilities. Preserve unlinked inputs for exploratory calculations. |
| CAS → **Recipes** | No typed multi-operation recipe UI | Add saved, bounded recipe templates and job progress after the object and dependency contracts exist. |
| CAS main area | The current two-column Services/Inspector shell has no object dossier canvas | Add builder, definition, derivation and visualization views. On wide desktop screens, place this between the left panel and Inspector. |
| CAS → **Inspector** | Results and Runtimes, exact result evidence, Workbook action | Extend with the proposed Result, Structure, Steps, Validation, Execution, Dependencies, Visualize and Export views. Retain the existing result card path while these arrive. |
| Top navigation → **Number Theory** | Dedicated bounded GCD and modular-inverse workspace | Keep the entry and domain-specific defaults; let it reference the same project algebra objects, especially `ZZ`, `Z/nZ` and finite fields. |
| **Workbook**, **Compute → Runtimes**, trusted **Sage Console** | Evidence storage, runtime diagnostics and explicitly trusted desktop code execution | Link saved object references and derived evidence to Workbook; keep runtime management in Compute and the Console's trust boundary explicit. |

**First-use path once Track A is delivered:** open **CAS / Algebra → Structures → + New structure**, choose **Polynomial ring**, set coefficient domain `QQ` and variables `x, y`, validate the exact definition, then **Create**. The object appears in the project explorer; selecting it shows its parent, generators and provenance. **Operations** offers applicable polynomial-ring actions, and **Save to Workbook** records a typed reference with exact result evidence. Reopening the project must restore the same object identity and definition. A dependent ideal must become stale if its parent definition changes; the UI must ask for an explicit recomputation or fork rather than silently reinterpret it.

**Responsive placement:** preserve the current Services/Inspector workflow throughout migration. On wide desktop screens, use left explorer, central builder/dossier and right Inspector. At narrower widths, make the explorer and Inspector collapsible and keep the active object and run state visible. On tablet, use the proposed two-panel mode; on mobile, begin with object inspection and bounded lightweight requests as in section 2.5. These layouts are design targets, not completed acceptance results.

### 2.7 Implementation attachment points and rollout gate

The present navigation is in `renderer/src/App.tsx`; `renderer/src/features/sageLab/CASAlgebraWorkspace.tsx` and `NumberTheoryWorkspace.tsx` specialize `SageServicesWorkspace.tsx`; the bounded operation UI is `renderer/src/features/scientificServices/ScientificServicesPanel.tsx`. Extend these shared seams rather than creating a second Sage transport or a parallel runtime settings page. Persist object definitions and references through the existing Project/Workbook architecture only after their versioned schema and dependency rules are defined. The precise files for new object storage are an implementation decision for A02, not a claim that a registry already exists.

| Sequence | UI and behavior that can ship | Acceptance gate |
|---|---|---|
| `SAGE-A01`–`A05` | Schema, registry, freshness and safe reconstruction foundations; current CAS Services UI remains the visible calculation path | Definition JSON roundtrip, invalid-definition rejection, stable project identity, stale descendants and bounded reconstruction without user code. |
| `SAGE-A06` | Add **Structures** tab and project object explorer beside current Services operations | Create, select, save, restart and reselect an object without losing its identity. |
| `SAGE-A07` | Add Ring/Field Builder in the CAS main area and object summary in Inspector | Build `ZZ`, `QQ`, `Z/nZ`, polynomial rings and finite fields; show field-level validation and exact parent metadata. |
| `SAGE-A08` | Connect the UI to real Sage capability reporting and cross-runtime fixtures | Compare supported fixtures on Sage 9.5 Local WSL and Sage 10.10 Docker where available; unavailable operations explain the actual runtime limitation. |

**Next implementation commit:** `SAGE-A01`, the versioned algebra object schema. Before adding visible controls, define discriminated object kinds, stable IDs/references, canonical definitions, versioning and validation. Its first gate is a serialized `QQ[x,y]` definition that roundtrips exactly while malformed domains, variables and references are rejected. The existing CAS and Number Theory calculations and Workbook evidence must continue to work.

**A01 implementation update (2026-11-03):** The [A01 acceptance record](evidence/sage-a01-schema-2026-11-03.md) covers the first schema-v1 slice in `@math3d/core`: integer and rational base domains, modular rings, canonical finite fields and polynomial rings. It validates exact revisioned parent references, computes the definition hash using the existing canonical SHA-256 contract, and rejects malformed or tampered JSON. This is a contract layer; object registry persistence, dangling-reference resolution, staleness and Sage reconstruction remain A02–A04. The next implementation gate is **SAGE-A02**, a project-scoped registry that saves and reopens records with stable IDs and explicit revision history.

**A02 implementation update (2026-11-03):** The [A02 acceptance record](evidence/sage-a02-project-registry-2026-11-03.md) covers Project-owned algebra object histories and the `.math3d` file transfer path. `Q` and `R = QQ[x,y]` survive independent import with the same identity, definitions and pinned parent revision. Duplicate IDs/revisions, missing parents and dependency cycles are rejected. Rename and fork produce explicit histories; archive/recover preserves references. The next gate is **SAGE-A03**: dependency freshness when a parent definition advances. The Structures UI remains A06.

**A03 implementation update (2026-11-03):** The [A03 acceptance record](evidence/sage-a03-dependency-freshness-2026-11-03.md) covers derived freshness for the Project algebra registry. A change from `R = QQ[x,y]` to `R = GF(5)[x,y]` makes objects pinned to the old definition stale, including transitive descendants, while preserving their exact historical records. A label-only revision does not invalidate mathematical dependents. Status and causes are reproducible after independent `.math3d` import; clearing staleness requires explicit new descendant revisions. The next gate is **SAGE-A04**: bounded Sage reconstruction from validated object definitions.

**A04 implementation update (2026-11-03):** The [A04 acceptance record](evidence/sage-a04-bounded-reconstruction-2026-11-03.md) covers a versioned object snapshot, deterministic parent-before-child reconstruction, structured result validation, and one bounded Docker Sage operation registered with the shared execution broker. Live Sage 9.5 in WSL verifies the same worker constructor code and script entry point; Docker HTTP execution remains unverified on this PC because Docker Desktop is unavailable. Local WSL and private gateway app routes do not advertise this new operation. The next gate is **SAGE-A05**: richer parent-domain and coercion metadata with explicit mathematical compatibility errors.

**A05 implementation update (2026-11-03):** The [A05 acceptance record](evidence/sage-a05-domain-coercion-2026-11-03.md) adds bounded inspection of two pinned Project revisions through the shared Sage broker. It returns exact parent descriptors, coefficient-domain references and directional coercion-map identities, with a typed `NO_CANONICAL_COERCION` result when Sage has no map. Live Sage 9.5 verifies `ZZ → QQ`, `QQ ↛ ZZ`, and incompatible `QQ[x,y]`/`GF(5)[x,y]` parents. The Structures UI remains **SAGE-A06**.

**A06 implementation update (2026-11-03):** The [A06 acceptance record](evidence/sage-a06-structures-ui-2026-11-03.md) adds a Project-scoped **Structures** tab beside the existing **Operations** flow, a saved object explorer, revision selector, dossier and Structure inspector. A small starter form creates validated `ZZ`, `QQ` and polynomial-ring records; the complete Ring and Field Builder remains **SAGE-A07**. An independent Electron restart reselected `R = Q[x,y]` with the same object ID and definition hash, and saving again through Projects retained both algebra objects. Recipes remain planned work.

**A07 implementation update (2026-11-03):** The [A07 acceptance record](evidence/sage-a07-ring-field-builder-2026-11-03.md) adds the full schema-v1 Ring and Field Builder in the CAS main area for `ZZ`, `QQ`, `Z/nZ`, canonical `GF(p^n)` and polynomial rings. Validation and an exact domain preview precede Project save; the builder invokes bounded Sage reconstruction when the Docker capability is available and states when it is unavailable. The dossier and Inspector show characteristic, field status, cardinality and zero divisors, with pinned polynomial parent metadata. The next gate is **SAGE-A08**: live capability reporting and cross-runtime fixtures on Sage 9.5 WSL and Sage 10.10 Docker when available. Quotient rings, number fields and p-adic fields remain later schema and UI slices in the broader P0 roadmap.

**A08 implementation update (2026-11-04):** The [A08 acceptance record](evidence/sage-a08-runtime-fixtures-2026-11-04.md) connects the Builder and Runtimes Inspector to route-filtered Sage capability probes and distinguishes unavailable, unadvertised and supported reconstruction. Seven versioned algebra fixtures compare exact mathematical signatures, IDs and definition hashes across Sage runtimes. All seven pass on real Sage 9.5 WSL; Docker is offline on this PC, so the real Sage 10.10 HTTP comparison remains pending and can be required with `--require-docker` once its pinned worker starts. A controlled HTTP test checks that the comparison detects mismatches. The next implementation gate is **SAGE-B01**: a typed operation registry based on object kind, parent domain and advertised runtime support.

**B01 implementation update (2026-11-04):** The [B01 acceptance record](evidence/sage-b01-typed-operation-registry-2026-11-04.md) adds a core registry for seven existing bounded Sage operations with kind/domain constraints, versioned input/output schema identifiers, broker capability keys, route requirements and strict request/result validation. The CAS Operations view lists compatible operations for the selected current, fresh object and explains excluded actions. `ZZ` GCD, `Z/nZ` inverse and direct-`QQ` polynomial factorization/Gröbner/roots are distinguished; the current polynomial worker's `QQ` base is not presented as a general finite-field polynomial operation. Freeform Services remain available. Contextual object-linked execution and evidence remain **B05**; the next implementation gate is **SAGE-B02**, the polynomial dossier recipe.

**B02 implementation update (2026-11-04):** The [B02 acceptance record](evidence/sage-b02-polynomial-dossier-2026-11-04.md) adds a bounded, versioned `QQ[x]` polynomial dossier recipe to the Sage worker, typed object operation registry and shared broker. It reports exact factorization and square-free decomposition, derivative and GCD, content and primitive part, irreducibility over `QQ`, discriminant and rational roots. A single JSON fixture is checked by Sage and TypeScript; SageMath 9.5 WSL ran the live cases and malformed-input checks. Docker HTTP execution awaits an available Docker service. Contextual run and saved evidence remain **B05**. The next implementation gate is **SAGE-B03**, exact matrix operations.

**B03 implementation update (2026-11-04):** The [B03 acceptance record](evidence/sage-b03-exact-matrix-2026-11-04.md) adds a bounded, versioned exact `QQ` matrix dossier to the worker, typed registry and broker. A selected rational-field object admits 1–8 by 1–8 canonical rational matrices. Results include RREF, pivots, rank, right-kernel and image bases, and minimal/characteristic polynomials for square matrices. The core parser verifies exact kernel and image witnesses. SageMath 9.5 WSL checked singular, rectangular, Jordan, rational-entry and zero matrices; the shared fixture also passes TypeScript validation. Docker HTTP execution awaits an available Docker service. The next gate is **SAGE-B04**, Smith and Hermite workflows.

**B04 implementation update (2026-11-04):** The [B04 acceptance record](evidence/sage-b04-smith-hermite-2026-11-04.md) adds bounded Smith and row-Hermite workflows over a selected `ZZ` object. A versioned result contains Smith diagonal and form, Hermite form, rank and the correctly ranked cokernel. The worker and core verify supplied unimodular transformations and exact identities, while an unavailable status makes missing transformations explicit. SageMath 9.5 WSL and TypeScript share the `(2,6,0)` fixture; rectangular and nontrivial transform cases also pass. Docker HTTP execution awaits an available Docker service. The next gate is **SAGE-B05**, contextual object-linked run controls and saved evidence.

**B05 implementation update (2026-11-04):** The [B05 acceptance record](evidence/sage-b05-contextual-evidence-2026-11-04.md) adds run controls in CAS → Algebra → Operations for the selected saved structure. The typed registry disables incompatible or unavailable actions with a reason. Successful broker results are schema checked and saved inside the `.math3d` Project with the pinned object revision and hash, request, result hash, Sage version, backend and job ID. The Project parser rejects missing targets, changed results and duplicate evidence IDs. **SAGE-B06** will put structured result and verification panels in the Inspector.

**B06 implementation update (2026-11-04):** The [B06 acceptance record](evidence/sage-b06-dossier-inspector-2026-11-04.md) connects selected saved evidence to structured **Results**, **Structure**, **Verification** and **Execution** views in the CAS Inspector. It renders exact matrices, polynomial facts and number-theory answers without a raw JSON dump. Verification recomputes GCD and inverse identities, reports checked matrix witnesses and transformations where available, and labels uncertified Sage claims as computed. Historical or stale sources remain visible. The next gate is **SAGE-B07**, recipe graphs with dependency-aware execution.

**B07 implementation update (2026-11-04):** The [B07 acceptance record](evidence/sage-b07-recipe-dag-2026-11-04.md) adds versioned algebra recipe graphs to `.math3d` Projects and enables CAS → Algebra → Recipes. Each bounded stage pins an object revision and output schema; dependency edges are typed and cycle-checked. The runner commits successful stage evidence separately, skips descendants of failures, continues independent branches and retains completed evidence on cancellation. Saved starters cover supported integer, rational, modular, finite-field and polynomial objects. The next gate is **SAGE-B08**, polynomial and matrix golden fixtures.

**B08 implementation update (2026-11-04):** The [B08 acceptance record](evidence/sage-b08-operation-goldens-2026-11-04.md) and versioned fixture corpus add exact polynomial, `QQ` matrix and `ZZ` Smith/Hermite outcomes plus invalid-input cases. All 16 cases pass on the local Sage 9.5 worker implementation; a controlled HTTP response proves the comparison and mismatch checks. The Docker Sage 10.10 route is unavailable on this PC, so live cross-version acceptance remains open and `--require-docker` fails until it can run. The next feature gate is **SAGE-C01**, Project ideal objects and an Inspector.

**C01 implementation update (2026-11-04):** The [C01 acceptance record](evidence/sage-c01-ideal-objects-2026-11-04.md) extends the Project algebra registry with immutable ideal revisions pinned to a `QQ` polynomial ambient ring. Structures can create and inspect bounded, syntax-validated generators, and an independent Project copy preserves the ideal ID, definition, hash and revision. Ideal operations remain unavailable until **SAGE-C02**, which adds bounded Gröbner and elimination workflows. The B08 real Docker 10.10 comparison remains open.

**C02–C04 implementation update (2026-11-04):** The [saved ideal workflow acceptance record](evidence/sage-c02-c04-ideal-workflows-2026-11-04.md) adds bounded Gröbner and elimination operations and a saved ideal recipe graph; typed membership with a normal form and positive/negative evidence; and a versioned quotient ring pinned to its ideal and ambient ring with a dimension query. Exact fixtures pass on local Sage 9.5. A desktop controlled-worker gate exports the Project and independently reopens its quotient and saved evidence in a fresh profile. The next feature gate is **SAGE-C05**, capability-gated syzygy and Hilbert operations. The live B08 Docker Sage 10.10 comparison remains open.

**C05 implementation update (2026-11-04):** The [C05 acceptance record](evidence/sage-c05-syzygy-hilbert-capabilities-2026-11-04.md) adds runtime-advertised generator syzygies and standard graded quotient Hilbert series, pinned Project evidence, and explicit unsupported reasons for absent capabilities, unproven homogeneity, lex order and advanced input bounds. Exact local Sage 9.5 fixtures pass. The next feature gate is **SAGE-C06**, operation budgets and cost warnings. The live B08 Docker Sage 10.10 comparison remains open.

**C06 implementation update (2026-11-04):** The [C06 acceptance record](evidence/sage-c06-operation-budgets-2026-11-04.md) adds exact standard/expanded ideal request profiles, conservative input-cost warnings, pre-dispatch and worker-side size checks, a subprocess wall-clock deadline, and saved budget provenance. Old budgetless Project evidence remains importable. The next roadmap feature is **SAGE-D01**, the number-field object builder. The live B08 Docker Sage 10.10 comparison remains open.

**D01 implementation update (2026-11-04):** The [D01 acceptance record](evidence/sage-d01-number-fields-2026-11-04.md) adds a bounded quadratic number-field definition pinned to a saved `QQ` revision, a Structures builder and dossier with exact basis and embedding facts, and safe Sage `NumberField` reconstruction. The `QQ(√5)` Project export independently reopens with the same object identity, definition and revision; reducible and wrong-parent examples are rejected. Local Sage 9.5 and desktop acceptance pass. The next feature is **SAGE-D02**, shared field and ideal references across Algebra and Number Theory. The B08 live Docker Sage 10.10 comparison remains open.

**Provenance and B08 gate update (2026-11-04):** The [saved-source and cross-runtime record](evidence/sage-provenance-cross-runtime-2026-11-04.md) covers Surface equation identity across app restarts, exact Workbook Sage code execution evidence, and Private gateway result envelope persistence. The required B08 comparison was rerun on Local WSL (16/16 Sage 9.5 cases); Docker Desktop could not initialize on this PC, so the live Docker comparison remains open. The concurrently delivered [C06 budget gate](evidence/sage-c06-operation-budgets-2026-11-04.md) is retained unchanged.

**D02–D04 implementation update (2026-11-04):** [D02](evidence/sage-d02-shared-number-theory-refs-2026-11-04.md) mounts the one Project algebra registry in CAS and Number Theory, so fields, polynomial ideals, recipes and evidence retain the same IDs and revisions across both workspaces. [D03](evidence/sage-d03-norm-trace-embeddings-2026-11-04.md) adds typed, exact norm, trace and embeddings for bounded quadratic elements with a checked degree product. [D04](evidence/sage-d04-prime-decomposition-2026-11-04.md) adds small-prime ideal factorization with `e`, `f`, norms, discriminant-based splitting checks and a saved recipe graph. The `QQ(√5)` local Sage 9.5 fixtures for `2`, `5`, and `11` and the controlled desktop export/fresh-profile import pass. The next feature gate is **SAGE-D05**, an extension tower viewer. The live B08 Docker Sage 10.10 comparison remains open.

**D05 implementation update (2026-11-05):** The [D05 acceptance record](evidence/sage-d05-field-tower-2026-11-05.md) adds a bounded saved quadratic-over-quadratic field extension and a Structures tower diagram with pinned inclusion maps, composition, defining-relation checks and `2×2=4` degree verification. Exact core, real local Sage 9.5 and controlled desktop export/fresh-profile import gates pass. The next feature is **SAGE-D06**, Galois analysis and subgroup views. The live B08 Docker Sage 10.10 comparison remains open.

**D06 implementation update (2026-11-05):** The [D06 acceptance record](evidence/sage-d06-galois-correspondence-2026-11-05.md) adds a bounded `QQ[x]` Galois operation, an exact permutation and fixed-field result contract, independent group and subgroup checks, and linked subgroup/intermediate-field diagrams. The `x⁴−2` local Sage 9.5 fixture gives `D4` of order eight and ten complete subgroup/fixed-field pairs; desktop Project export and fresh-profile reopen pass. The next feature is **SAGE-E01**, finite group objects. The [B08 live comparison](evidence/sage-b08-live-2026-11-05.md) closed its 16-case Sage 9.5/10.10 matrix with zero differences; live Docker D06 parity remains untested.

**E01 implementation update (2026-11-05):** The [E01 acceptance record](evidence/sage-e01-finite-group-objects-2026-11-05.md) adds versioned finite-group Project definitions for bounded permutation generators with verified relation words and finite abelian invariant-factor presentations. Structures previews and saves `C4`, `V4`, `S3`, `D4` and `Q8`; exact core and independent Project reopen gates pass. The next feature is **SAGE-E02**, capability-gated GAP operations.

**E02 implementation update (2026-11-05):** The [E02 acceptance record](evidence/sage-e02-gap-group-operations-2026-11-05.md) adds an advertised GAP-backed dossier for saved finite groups, pinned to their exact definition revision. Bounded order, center, conjugacy and complete subgroup/normality results are independently checked before Project evidence is saved. Five Sage 9.5/GAP 4.11.1 and Docker Sage 10.10/GAP 4.15.1 live fixtures, exact D4 cross-runtime invariants, forged-result rejection, live Docker HTTP dispatch, and desktop export/fresh-profile reopen pass. The next feature is **SAGE-E03**, Cayley and subgroup graph scenes.

**E03 implementation update (2026-11-05):** The [E03 acceptance record](evidence/sage-e03-finite-group-scenes-2026-11-05.md) adds interactive Cayley and subgroup cover diagrams derived from pinned E02 group evidence. Versioned scene JSON and SVG exports retain source hashes, runtime versions and a deterministic layout; standalone scene import rebuilds and verifies every node and edge. D4 exact topology, tamper rejection, desktop downloads, SVG metadata, visual layout and fresh-profile Project reopen pass. The next feature is **SAGE-E04**, module presentations.

**E04 implementation update (2026-11-05):** The [E04 acceptance record](evidence/sage-e04-module-presentations-2026-11-05.md) adds versioned free and presented modules with pinned `ZZ`, `QQ` or bounded `QQ` polynomial parents, an exact typed relation map `A:R^m→R^n`, and separate dimension-checked maps between saved free modules. Registry validation rejects wrong scalar domains, ranks and parent references; revision freshness tracks dependent modules. Core and actual desktop Project-package export/fresh-profile import gates pass. The next feature is **SAGE-E05**, module invariant factors.

**E01–E02 → D06 integration (2026-11-05):** The [linked Galois acceptance record](evidence/sage-d06-linked-group-partial-2026-11-05.md) makes the D06 group a revisioned E01 object pinned to polynomial-ring and result evidence. The existing E02 dossier can run on that group. `x⁴−2` remains a complete ten-subgroup order-eight view; an order-twelve quartic now has an explicitly partial eight-of-ten view. Core, local Sage 9.5, Docker Sage 10.10 and controlled desktop export/reopen gates pass. E03 scenes remain available for saved E02 results.

**E05 implementation update (2026-11-05):** The [E05 acceptance record](evidence/sage-e05-module-invariant-factors-2026-11-05.md) adds a typed Smith operation for saved `ZZ` modules with pinned module and ring snapshots. Exact unimodular transformations certify the free rank and torsion factors before Project evidence is saved. WSL Sage 9.5, Docker Sage 10.10, core rejection, desktop build and actual Project-package export/fresh-profile import gates pass. The next feature is **SAGE-E06**, chain complexes and homology.

**E06 implementation update (2026-11-05):** The [E06 acceptance record](evidence/sage-e06-chain-complex-homology-2026-11-05.md) adds a versioned three-degree chain object pinned to saved free `ZZ` modules and maps. Exact registry checks enforce map typing and `d₁d₂=0`; independently checked Smith witnesses certify the saved `H₀`, `H₁`, `H₂` free and torsion factors. WSL Sage 9.5, Docker Sage 10.10, core rejection/staleness, desktop build and actual Project-package export/fresh-profile import gates pass. The next feature is **SAGE-F01**, an algebraic-locus scene contract.

**F01 implementation update (2026-11-05):** The [F01 acceptance record](evidence/sage-f01-algebraic-locus-scene-2026-11-05.md) adds a standalone, versioned real-locus scene with full pinned `QQ` polynomial-ring or ideal source records, exact equations, Cartesian axes, bounded intervals and numerical precision. It saves an uncomputed Geometry document to the Project and rejects false rendered claims or mismatched source revisions on independent import. Core, desktop build, JSON export and actual Project-package export/fresh-profile import gates pass. The next feature is **SAGE-F02**, polynomial and ideal plot handoff.

**F02 implementation update (2026-11-05):** The [F02 acceptance record](evidence/sage-f02-bounded-real-locus-2026-11-05.md) adds bounded numerical sampling for one-variable real roots, two-variable implicit curves, three-variable implicit surfaces, and two-equation three-dimensional loci with a linear plane constraint. The sphere/plane intersection over `QQ[x,y,z]` renders as a curve. A versioned sample retains the complete F01 scene, declares its algorithm and sample count, and labels completeness as a bounded sample. Its Geometry checkpoint is validated against the exact pinned Project source on import. The next feature is **SAGE-F03**, singular-locus and tangent views.

**F03 implementation update (2026-11-05):** The [F03 acceptance record](evidence/sage-f03-singular-locus-tangent-2026-11-05.md) adds exact `QQ` hypersurface Jacobian equations and point-local tangent scenes pinned to the F01 source. A rational point inspector reports exact locus membership, Jacobian rank, multiplicity and the leading homogeneous tangent cone. The node `y²−x²(x+1)` has two real tangents; the cusp `y²−x³` has a repeated tangent and nonzero transverse cubic jet. The view saves as a validated Geometry checkpoint with a Project comparison adapter. Multi-equation ideals remain an explicit dimension-aware Jacobian-minors follow-up. The next feature is **SAGE-F04**, typed algebra object Workbook cells.

**F04 implementation update (2026-11-05):** The [F04 acceptance record](evidence/sage-f04-typed-workbook-cells-2026-11-05.md) adds a typed Algebra object Workbook block with an `algebra-object` output port. Each bounded local run pins a Project object ID, revision, definition hash and complete validated object record. The cell displays saved output without a runtime, but marks it stale when a newer revision or parent change exists. Explicit recompute updates to the latest fresh revision and retains prior runs. Project Workbook resource export/import, document view and publication manifest carry the typed source and output hashes. The next feature is **SAGE-F05**, execution certificates and provenance schemas.

**F04 saved-result extension (2026-11-05):** A Project reference block can also link a saved Sage algebra result. This separate [result-cell record](evidence/sage-f04-workbook-algebra-result-2026-11-05.md) retains its exact request, result, runtime, hashes and pinned object revision; explicit replay uses the bounded Sage job registry. It remains historical after a source edit, while the Algebra object block above recomputes its local registry snapshot against the latest revision.

**F05 implementation update (2026-11-05):** The [F05 acceptance record](evidence/sage-f05-execution-certificates-2026-11-05.md) adds a versioned, validated execution certificate to new object-linked Project algebra evidence. It pins operation schemas, request/result hashes and sizes, target and parent definitions, backend route, Sage version, elapsed time, warnings, known GAP subsystem version and declared ideal budgets. The Inspector displays it separately from mathematical Verification. Unknown algorithm, proof mode and memory remain unclaimed; legacy evidence still imports. The next feature is **SAGE-F06**, versioned capability manifests.

**F06 implementation update (2026-11-05):** The [F06 acceptance record](evidence/sage-f06-capability-manifests-2026-11-05.md) adds a hashed v1 capability manifest to each Sage route probe. Compute → Runtimes shows the reported version and operation-level support or deterministic unavailable reason. Broker discovery uses that same route-filtered manifest, so the displayed decision matches executable capability. Live Sage 9.5 WSL and Docker Sage 10.10 checks confirm their distinct operation sets. The next feature is **SAGE-F07**, bounded queue cancellation and budgets.

**F07 implementation update (2026-11-05):** The [F07 acceptance record](evidence/sage-f07-bounded-worker-2026-11-05.md) bounds Docker Sage admission, queue wait, wall/CPU time, memory, input and output. Queued cancellation never launches Sage; deadline cancellation kills the process group and cleans temporary files. The rebuilt Sage 10.10 service passes the worker gates and a real GCD request, and Compute → Runtimes displays its policy. The next feature is **SAGE-F08**, the real-backend regression suite.

**F08 implementation update (2026-11-05):** The [F08 acceptance record](evidence/sage-f08-real-backend-regression-2026-11-05.md) maps all 20 M0 review flows to a real WSL/Docker desktop suite. Its CAS gate checks exact matrix, polynomial and Gröbner results, while the existing Number Theory, Workbook, Console and code-cell gates verify persistence and trust. The suite found and fixed numeric zero matrix parsing. The next feature is **SAGE-G01**, finite-field exploration.

**G01 implementation update (2026-11-06):** The [G01 acceptance record](evidence/sage-g01-finite-field-explorer-2026-11-06.md) adds a bounded explorer for saved `GF(p^n)` objects. It enumerates at most 64 elements, reports the actual Sage defining polynomial, Frobenius orbit, trace, norm, minimal polynomial and primitive elements, and shows a multiplication table up to order 16. Project evidence verifies these values with independent exact polynomial arithmetic and survives export and reopen. The next feature is **SAGE-G02**, the p-adic workspace.

**G02 implementation update (2026-11-06):** The [G02 acceptance record](evidence/sage-g02-padic-workspace-2026-11-06.md) adds Number Theory's precision-explicit `Zp`/`Qp` panel. Each bounded study pins a saved `ZZ` or `QQ` parent, prime, precision, exact operands and optional simple-root Hensel input. Results distinguish exact source fractions from finite p-adic displays and expose valuation, absolute/relative precision, unit digits, precision loss and uncertain zero. Project import independently checks rational arithmetic, digits and Hensel congruence. The next feature is **SAGE-G03**, local extensions.

**G03 implementation update (2026-11-06):** The [G03 acceptance record](evidence/sage-g03-local-extensions-2026-11-06.md) adds a Number Theory view for saved quadratic fields at odd primes. It combines exact prime ideals with finite-precision `Qp` local models, showing splitting, ramification index, residue degree/order, uniformizer and split-root branches. Project import checks the discriminant classification, degree and norm identities, valuations and split-root congruences. Sage 9.5's `NumberField.completion()` is unimplemented, so these are explicitly labelled models from the pinned polynomial rather than canonical completion maps. The next feature is **SAGE-G04**, elliptic curve objects.

---

## 3. P0 — Algebra object registry

### 3.1 Required object kinds

| Domain | First-class objects | Core definition fields |
|---|---|---|
| Base arithmetic | `ZZ`, `QQ`, `Z/nZ` | modulus where relevant |
| Finite fields | `GF(p^n)` | `p`, `n`, generator name, defining irreducible polynomial or canonical policy |
| Polynomial rings | `R[x]`, `k[x,y,z]` | coefficient ring, variables, monomial order |
| Quotient rings | `R/I` | ring reference, ideal reference |
| Polynomials | `f ∈ R` | canonical term/coefficient representation, parent ref |
| Ideals | `I=(f1,...,fr)` | ring ref, generator refs or normalized generators |
| Matrices | `A ∈ Mat(m,n,R)` | dimensions, base ring, exact entries |
| Modules | `M`, presented module | base ring, generators, relation matrix |
| Groups | permutation, abelian, matrix, finitely presented | generators and typed representation |
| Number fields | `Q(a)=Q[x]/(f)` | irreducible defining polynomial, chosen generator |
| Field extensions | `L/K` | base field, defining data, embeddings |
| Varieties | `V(I)` and real locus | ideal ref, ambient coordinates, ground field |

### 3.2 Required operations

`create`, `validate`, `describe`, `clone`, `rename`, `fork`, `rebase` (explicit), `serialize`, `deserialize`, `compare`, `findDependencies`, `exportDefinition`, `openInWorkbook`, `openInAnotherWorkspace`.

### 3.3 Registry and compatibility tests

- Create, save, reopen each P0 object type with equal identity and definition.
- Definition hashing stable across supported OS environments.
- Renaming a variable does not mutate other objects silently.
- Cycles and dangling references rejected with actionable errors.
- Results from Sage 9.5 and 10.10 normalize to the same object schema when the mathematical value is equal.
- Symbolic string rendering never substitutes for mathematical equality testing.

---

## 4. P0 — Ring and Field Builder

### 4.1 Builder sections

```text
+ New structure

Type:
  ( ) Integer ring Z
  ( ) Rational field Q
  ( ) Modular ring Z/nZ
  ( ) Finite field GF(p^n)
  ( ) Polynomial ring
  ( ) Quotient ring
  ( ) Number field
  ( ) p-adic field [advanced]

Base domain:       QQ
Variable names:    x, y
Monomial order:    degrevlex
[Preview] [Validate] [Create R]
```

For modular rings, distinguish field behavior when `n` is prime from composite rings with zero divisors. For finite fields, check `p` prime, exponent `n ≥ 1`, and irreducibility of any supplied defining polynomial. Enforce generator naming and prohibit ambiguous implicit coercions.

### 4.2 Example: finite field explorer

```text
F = GF(7^2)
Characteristic         7
Order                 49
Degree                 2
Chosen generator       a
Defining polynomial    e.g. t^2 + 1 (irreducible over F7)

[Elements] [Frobenius] [Trace] [Norm]
[Minimal polynomial] [Primitive elements]
[Multiplication table] [Polynomial ring over F]
```

**Important:** A finite field presentation is not uniquely determined by its order. Store the actual defining polynomial/construction policy; do not imply two independently created `GF(49)` objects share a canonical generator without a specified isomorphism.

### 4.3 Ring explorer

Show coefficient ring, characteristic, commutativity, units when computable, zero divisors when applicable, and available coercions. For `QQ[x,y]`, show term order, exact parent, monomial basis conventions and example valid inputs.

### 4.4 Quotient ring builder

Select ring `R`, ideal `I ⊂ R`, inspect ideal compatibility, then build `R/I`. Provide residue class representation, reduction map and safe coercion behavior. Preserve ideal generators and the chosen reduction/normal-form convention.

---

## 5. P0 — Polynomial analysis dossier

### 5.1 One-click polynomial analysis

For `f(x)=x^5-2x^3+x-1` over `QQ[x]`, generate a structured dossier:

- Parent ring and coefficient domain.
- Degree, leading coefficient, constant coefficient, content, primitive part.
- Derivative, GCD `gcd(f,f')`, square-free status.
- Factorization over requested domains (`QQ`, suitable `GF(p)`, optionally algebraic closure).
- Irreducibility over its stated domain; separate irreducibility from square-freeness.
- Discriminant and resultant when supported.
- Exact rational roots, exact algebraic roots where feasible, numerical approximations with precision.
- Number of real roots, root isolation and separation where feasible.
- Companion matrix and characteristic polynomial relationship.
- Number-field/Galois actions only when prerequisites are satisfied.
- Computation budget and fallback result sections for expensive operations.

### 5.2 Separate domains of factorization

A factorization over `QQ` is not the same as one over `GF(p)` or over the complex numbers. Label each view with its coefficient domain, representation and proof status. Display “not computed” rather than “irreducible” when the relevant operation timed out or was unavailable.

### 5.3 Polynomial recipes

| Recipe | Pipeline | Output |
|---|---|---|
| Basic analysis | degree → derivative → square-free → factorization | dossier |
| Root analysis | factor/roots → exact isolation → numeric approximation | exact/numerical roots and plot |
| Parametric polynomial | assumptions → discriminant → special parameter values | parameter stratification |
| Minimal polynomial | define algebraic element → power basis or Sage minimal polynomial → verify | minimal polynomial certificate |
| Number-field from polynomial | irreducibility → field construction → basis/embeddings | `NumberFieldObject` |
| Galois-ready | square-free check → splitting-field strategy → group and generators | `GaloisAnalysisResult` |

### 5.4 Example acceptance cases

- `f=x^2-1` factors into `(x-1)(x+1)` over `QQ` and has rational roots ±1.
- `f=x^2+1` has no real roots and is irreducible over `QQ`, but reducible over `GF(5)`.
- `f=(x-1)^2` reports repeated-root status via `gcd(f,f')`.
- `f=x^4-2` is irreducible over `QQ` and can later be passed to the Galois workspace.

---

## 6. P0 — Expanded exact matrix algebra

### 6.1 Matrix operation families

| Family | Operations |
|---|---|
| Core | dimensions, base ring, determinant, trace, rank, transpose, inverse (where valid) |
| Linear systems | RREF where appropriate, solve `Ax=b`, nullspace/kernel, row/column spaces, image, consistency |
| Characteristic structure | characteristic polynomial, minimal polynomial, eigenvalues, eigenspaces, diagonalizability |
| Canonical forms | Jordan form over appropriate splitting fields, rational/Frobenius canonical form where supported |
| Integral/module forms | Hermite normal form, Smith normal form, invariant factors, elementary divisors |
| Bilinear forms | symmetric/Hermitian tests, Gram matrix, signatures/definiteness over suitable domains |
| Decompositions | LU/QR/SVD where supported, with exact vs numerical distinction |
| Operator bridge | minimal polynomial, nilpotent decomposition, invariant subspaces, geometry transformations |

### 6.2 Context-sensitive action policy

Do not show Jordan form as universally available over `ZZ` without domain extension. Do not claim every Smith normal form API returns transformation matrices over every supported base ring. Check assumptions, call capability-specific adapters and label decompositions accordingly.

### 6.3 Smith form and modules

For a matrix `A` over `ZZ`, compute diagonal invariants and—where available—unimodular transformation matrices `U,V` satisfying `U A V = D`. Verify `U`, `V` invertible over `ZZ` and verify the identity. Then construct the presented module `coker(A)` using the correct input/output free-module ranks.

**Illustration:** If the Smith diagonal entries are `2, 6, 0` for an endomorphism of `Z^3`, then

`coker(A) ≅ Z/2Z ⊕ Z/6Z ⊕ Z`.

Show the invariant-factor divisibility `2 | 6`. If only the diagonal entries are available, provide the decomposition without claiming verified basis transformations.

### 6.4 Matrix dossier UI

```text
MATRIX A — 3 x 3 over ZZ

Structure        integer matrix
Rank             2
Kernel rank      1
Determinant      0
Characteristic   ...
Minimal poly.    ...
Smith diagonal   (2,6,0)
Cokernel         Z/2 ⊕ Z/6 ⊕ Z

[Steps] [Verify U*A*V=D] [Create module]
[Plot map] [Open in Topology]
```

### 6.5 Test matrix

Create known small matrix fixtures: singular and nonsingular matrices over `QQ`, nilpotent and non-diagonalizable matrices, integer matrices with nontrivial Smith factors, matrices over finite fields, incompatible field/ring operations, and edge cases `0×0`, rectangular, and large sparse matrices.

---

## 7. P1 — Ideals and computational commutative algebra

### 7.1 Ideal workbench

Selecting an ideal should expose:

- Generator list and ambient polynomial ring.
- Reduced or standard Gröbner basis with explicit monomial order.
- Normal form and membership test `f ∈ I?` with witness where possible.
- Elimination ideals and projection interpretation.
- Dimension and zero-dimensionality status.
- Quotient algebra/ring `R/I`.
- Ideal sum, product, intersection, quotient/colon ideal.
- Saturation and radical where supported.
- Syzygy computations and free presentations (advanced).
- Hilbert series/polynomial and graded data (advanced, domain-dependent).
- Primary decomposition where supported and computationally feasible.
- Variety and singular-locus handoff.

### 7.2 Concrete example

Let `R=QQ[x,y]` and `I=(x²+y²-1, x-y)`.

With `x-y=0`, substitution gives `2x²-1=0`. Over an algebraic closure the ideal describes two points `(±1/√2, ±1/√2)`; over `QQ` there are no rational solutions. Display the ground field explicitly. The elimination polynomial depends on the chosen elimination variable and monomial order; never label a general Gröbner basis as an elimination basis without the corresponding hypothesis.

### 7.3 Gröbner flow

```text
Generators
   │
   ▼
Select base ring + monomial order
   │
   ▼
Compute and validate Gröbner basis
   ├──► reduce test polynomial (membership)
   ├──► eliminate selected variables
   ├──► quotient ring / normal forms
   └──► solve zero-dimensional system
```

### 7.4 Computational safety

Gröbner, primary decomposition and syzygy calculations can have extreme complexity. Introduce explicit term-count/degree/variable budgets; show estimated effort; allow cancellation; isolate workers; distinguish mathematically negative results from timeouts.

---

## 8. P1 — Field extensions and algebraic number theory objects

### 8.1 Number field builder

Define `K=Q(a)` with irreducible `f(a)=0`; store the defining polynomial, generator name and maps. For `K=Q(√5)`, the polynomial is `x²-5`, field degree is 2, signature `(2,0)`, discriminant 5, and ring of integers is `Z[(1+√5)/2]`. Distinguish the power basis `1,a` from an integral basis of the ring of integers.

### 8.2 Number field dossier

```text
NUMBER FIELD K = Q(a), a² = 5
Degree              2
Signature           (2,0)
Field discriminant  5
Power basis         1,a
Integral basis      1,(1+a)/2
Ring of integers    Z[(1+a)/2]

[Embeddings] [Norm] [Trace] [Minimal polynomial]
[Ideals] [Prime decomposition] [Units] [Class group]
[Galois] [Extend field] [Field tower]
```

### 8.3 Extension towers

```text
            Q(√2,√3)
               │ degree 2
             Q(√2)
               │ degree 2
                Q
```

Build a diagram from explicit field embeddings and inclusion maps. The diagram must verify the inclusions; user-created labels alone are not a mathematical certificate. Support composition of embeddings and tower-law degree checks `[L:Q]=[L:K][K:Q]` for finite extensions.

### 8.4 Number Theory integration

Keep Number Theory as a dedicated workspace, but consume shared `IntegerRing`, `ModularRing`, `PolynomialRing`, `NumberField`, `Ideal`, `FieldExtension` and `Embedding` object refs. Specialized Number Theory recipes should include splitting and ramification of primes, completions, p-adic arithmetic, norms/traces, local-global information and eventually class-field computations. Explicitly distinguish simple finite-field factorization from prime ideal decomposition in number fields.

---

## 9. P1 — Galois Explorer

### 9.1 Core workflow

```text
Polynomial f ∈ K[x]
   ↓ check separability / irreducibility / domain
Splitting field L/K
   ↓ compute automorphisms
Galois group G = Gal(L/K)
   ├── order, generators, permutation action
   ├── solvability, normal subgroups, conjugacy classes
   ├── subgroup lattice (if tractable)
   └── fixed fields / intermediate field lattice
```

### 9.2 Worked example

For `f=x⁴-2` over `Q`, its splitting field is `L=Q(2^(1/4), i)`, and the Galois group is dihedral of order 8 (`D4`, under the convention that `D4` denotes symmetries of the square). Store and display the exact permutation representation and convention rather than assuming all libraries use the same `D_n` notation.

### 9.3 Visual Galois correspondence

Display two linked lattices: field inclusions ordered by inclusion, and subgroups ordered by inclusion in the opposite direction. Selecting `H ≤ G` highlights `L^H`; selecting an intermediate field `E` highlights `Gal(L/E)`. Show indices/degrees and normality ↔ Galois property where applicable. Do not promise a complete lattice for computationally large groups: render a partial/truncated result with an explicit completeness label.

### 9.4 Capabilities

- Galois group of a polynomial over supported fields.
- Splitting field and degree.
- Permutation representation and generators.
- Subgroup enumeration for bounded small groups.
- Fixed fields when supported.
- Resolvents and discriminant diagnostics as later advanced features.
- Export subgroup lattice to graph scenes and extension tower to object diagrams.

---

## 10. P1 — Group Theory workspace

### 10.1 Supported types

Start with permutation groups, finite abelian groups, small matrix groups and finitely presented groups when supported. Add advanced groups only after base representations and transformation maps are stable.

### 10.2 Operations

| Family | Operations |
|---|---|
| Basic | order, generators, identity, element order, membership |
| Structure | center, commutator subgroup, abelianization, derived series, solvability |
| Subgroups | normality, conjugacy classes, subgroup lattice, cosets, quotients |
| Sylow | Sylow p-subgroups and corresponding structural information |
| Actions | permutation actions, orbits, stabilizers, homomorphisms |
| Representations | character tables for supported finite groups, representations and actions |
| Visual | Cayley graph, subgroup lattice, cosets, action orbits |

### 10.3 Example presets

`C_n`, `D_n`, `S_n`, `A_n`, `Q8`, `GL(2,F_p)` (within budgets). Provide clear notation and finite-size safeguards. Add a group comparison operation checking relevant invariants; matching invariants should never be presented as a proof of isomorphism.

### 10.4 GAP adapter

Treat GAP via Sage as a backend capability with explicit version/subsystem provenance. Normalize group presentations and generator permutations into typed JSON. Limit subgroup enumeration and character table work; show support levels per runtime.

---

## 11. P1 — Modules and finitely generated abelian groups

### 11.1 Why modules deserve their own workspace

Modules connect matrix algebra, polynomial algebra, homology, presentations and number theory. Introduce **free modules**, **submodules**, **quotients**, **finitely presented modules**, **maps**, **kernels**, **images**, **cokernels** and **invariant factors**.

### 11.2 Presented module builder

Create `M = R^n / im(A)` from a correctly typed relation map `A:R^m→R^n`; show generators, relations, ambient ring, and the induced module. Over `ZZ`, use Smith form for the structure theorem. Over polynomial rings, expose Gröbner/syzygy pathways where supported, without promising the same classification as over PIDs.

### 11.3 Module/Topology bridge

```text
Cellular chain complex
    C₂ --d₂--> C₁ --d₁--> C₀
              d₁∘d₂ = 0
                   ↓
          ker(d₁) / im(d₂)
                   ↓
            Homology H₁
                   ↓
      Smith normal form / invariant factors
```

Use the same matrix, module and map IDs in Algebra and Topology. Verify `d₁d₂=0` before producing homology. The relevant computation depends on coefficient ring and torsion policies.

---

## 12. P1 — Algebra → Geometry and Mesh bridge

### 12.1 Exact algebraic variety to geometry document

```text
Polynomial or ideal I in R[x,y,z]
        ↓
Algebraic set V(I)
        ↓ choose real locus and bounded viewport
Validated implicit / parametric representation
        ↓
GeometryDocument with provenance back to I
        ↓
Math3D viewer
        ↓ optional discretization
MeshDocument (derived artifact; not exact algebra)
```

A complex variety is not automatically a real 3D surface. The bridge must ask for real locus, slices, projected components or other representations. Handle dimensions 0,1,2 and higher distinctly.

### 12.2 Example

`I=(x²+y²+z²-1,x-y)` over `QQ[x,y,z]` describes an algebraic curve. Its real locus in `R³` is the circle obtained by intersecting the unit sphere with the plane `x=y`. Offer **Open real locus**, **show implicit constraints**, **slice**, and **generate mesh/curve sampling**. Label sampling as numerical and potentially incomplete.

### 12.3 Geometry artifact contract

The target document must record source object ID/revision, coordinate convention, declared domain (`R`, `C` or chosen slice), approximation tolerance, bounds, algorithm, detected singularity warnings, and whether the image is a guaranteed complete locus or only a bounded sampled rendering.

**F01 contract:** The initial `R` handoff records full pinned source definitions, exact equations, one to three direct Cartesian axes, finite bounds and a sample policy in an uncomputed Geometry document. `algorithm=null` and `completeness=unknown` explicitly precede sampling. Complex-domain and sliced representations remain future contract variants; F02 consumes this real-domain source for bounded plotting.

**F02 rendering:** Grid roots, marching squares and marching tetrahedra produce bounded numerical previews. A linear plane constraint provides a two-dimensional parameter domain for a second equation, including the sphere/plane example. Each sample embeds the F01 exact-source contract and identifies the method, evaluation count, warnings and bounded, potentially incomplete status. Unsupported higher-codimension systems fail explicitly. The Geometry checkpoint preserves the sample in a versioned source extension; it does not claim exact mesh topology or complete real-locus coverage.

### 12.4 Additional visual handoffs

- Parametric polynomial curve → Curve/Geometry module.
- Polynomial system → finite solution point cloud, if zero-dimensional and roots available.
- Jacobian matrix / tangent space → vectors and local planes.
- Group actions → orbit geometry.
- Matrix linear transformation → transformed 2D/3D objects.
- Finite field algebraic curve → point incidence graph, **not** a fake real geometric plot.

---

## 13. P1 — Singularities and local algebra explorer

### 13.1 Single hypersurface workflow

For `f(x,y,z)=0`, find candidate singular points by solving `f=0` together with all partial derivatives `∂f/∂x_i=0`; for a general ideal use the relevant Jacobian criterion under suitable hypotheses. The criterion and minors must be chosen according to dimension/codimension assumptions; do not simply equate “gradient zero” with every possible singularity test.

### 13.2 Local inspector

```text
SINGULARITY EXPLORER
Point p                  (0,0,0)
Equations satisfied      yes
Jacobian rank            ...
Expected local dimension ...
Tangent space            ...
Tangent cone             ...
Multiplicity             ... [if computed]
Hessian / quadratic jet  ... [if applicable]

[Translate point to origin]
[Show tangent cone]
[Show original and local model]
[Create geometry comparison scene]
```

### 13.3 Examples and tests

- Smooth sphere `x²+y²+z²-1=0` — no singular points over characteristic zero.
- Node `y²-x²(x+1)=0` — singular at origin, tangent cone with two lines over suitable field.
- Cusp `y²-x³=0` — singular at origin, tangent cone is a doubled line.
- Crossed surfaces and non-reduced schemes — explicitly distinguish set-theoretic geometry from scheme-sensitive multiplicity.

**F03 scope:** For a single hypersurface equation over `QQ`, show the exact unsolved system `f=∂f/∂x₁=⋯=0` and evaluate its Jacobian at a selected rational point inside the F01 bounds. Translate the polynomial exactly to that point to obtain the lowest nonzero homogeneous jet and tangent cone. Classify only the supported two-dimensional ordinary real node and ordinary cusp patterns; all other singular points stay unclassified. The global singular set is not solved, and multi-equation ideals need a dimension/codimension-aware minors criterion before classification.

---

## 14. P1 — Coercion, domains, assumptions and precision inspector

### 14.1 Why this is non-optional

The same-looking expression can have different meaning depending on parent, characteristic, precision, variable assumptions and field embeddings. A Sage-based mathematical platform should surface these semantics.

### 14.2 Parent/coercion panel

```text
Element              1/2 + x
Parent               QQ[x]
Base ring            QQ
Exact                yes
Constituent coercion ZZ → QQ → QQ[x]

[Show parent] [Show coercion map]
```

When two parents cannot be coerced, show an explicit typed incompatibility instead of a generic Sage Python traceback. Do not infer a universally valid coercion from a merely possible abstract isomorphism.

### 14.3 Assumptions and symbolic algebra

An expression like `sqrt(x²)=x` is not valid for unrestricted real `x`; `log(ab)=log(a)+log(b)` requires care about domains and branches. Track real/complex assumptions, sign restrictions and numerical precision as part of operation inputs and result provenance. Display conditional expressions or warnings rather than silently apply invalid identities.

### 14.4 Numerical vs exact

Every numerical result should show precision, rounding/approximation mode and relevant error-estimation method if available. Root approximations must never overwrite exact algebraic root objects. Mark computations that are heuristic, conditional or unproved according to backend behavior.

---

## 15. P1 — Provenance, certificates and mathematical verification

### 15.1 Execution provenance

Record: operation ID + schema version, source object content hashes and revisions, backend route, Sage version, subsystem when known (GAP/Singular/PARI/etc.), algorithm selection if known, input size, wall time, output status, limits, exactness, proof-mode flags when relevant, warnings and result hash.

Do not claim internal subsystem or algorithm unless the adapter explicitly selected it or the backend reports it. Do not claim peak memory without actual instrumentation. Do not claim `proof=true` globally verifies every mathematical algorithm; proof settings are operation-specific.

### 15.2 Certificate types

| Operation | Possible verification |
|---|---|
| Factorization | Multiply factors back to original polynomial including unit/content |
| Polynomial roots | Substitute into polynomial, exact when possible |
| Matrix inverse | Verify `AA⁻¹=I` and `A⁻¹A=I` |
| Smith decomposition | Verify `UAV=D`, unimodularity, diagonal divisibility |
| Gröbner basis | Check generator reductions; use backend-supported Gröbner verification when available |
| Ideal membership | Validate explicit combination witness where returned |
| Field extension | Check defining polynomial and embedding preservation |
| Group action | Check generator action obeys prescribed relations |
| Chain complex | Verify adjacent differential composition is zero |
| Geometry handoff | Check defining-polynomial residuals for generated samples; do not mistake sampling for exact completeness |

### 15.3 Evidence modes

- `COMPUTED`: backend supplied result.
- `CHECKED`: independent verification method completed.
- `CONDITIONAL`: explicitly depends on assumptions/proof settings.
- `PARTIAL`: truncated or incomplete answer under budget.
- `FAILED`: definitive operation failure with typed cause.
- `UNAVAILABLE`: unsupported runtime capability.

Use accurate badges and clear explanatory Inspector text, not broad “verified” labels for every Sage result.

---

## 16. P1 — Workbooks as mathematical dependency graphs

### 16.1 Typed cell families

1. Create Structure cell: ring, field, ideal, group, matrix, extension.
2. Bounded Operation cell: consumes object refs and produces exact typed result.
3. Analysis Recipe cell: orchestrates a defined DAG.
4. Visualization cell: references numerical/graph/scene artifact.
5. Explanation/Notes cell: richly formatted mathematical prose and equations.
6. Trusted Sage Code cell: existing desktop-only explicitly trusted operation with distinct execution permissions.

### 16.2 Example Workbook DAG

```text
Cell 1: R = QQ[x,y]
          │
          ▼
Cell 2: I = ideal(x²+y²-1, x-y)
          ├───────────────────┐
          ▼                   ▼
Cell 3: GB(I)           Cell 4: R/I
          │                   │
          ▼                   ▼
Cell 5: Eliminate      Cell 6: Quotient analysis
          │
          ▼
Cell 7: Solve and visualize
```

### 16.3 Freshness and invalidation

On edit of Cell 1, mark descendants stale. A stale result remains visible as historical evidence but is clearly separated from current computations. Provide “recompute descendants” with topological order, cancellation, failure isolation and no unintended execution of trusted Sage code. The user must explicitly authorize trusted cell runs under the existing trust model.

### 16.4 Reproducibility export

Export a Workbook to a portable manifest containing mathematical definitions, bounded operation specs, source hashes, result metadata and optionally embedded result snapshots. Trusted code exports must show an execution warning and must not auto-run on import. Provide a human-readable mathematical report and a machine-readable JSON manifest.

---

## 17. P1 — Scientific runtime design and security

### 17.1 Runtime selection

Support current Docker Sage and local WSL Sage with explicit capability probing. Record operationally whether an operation executes in stateless bounded mode, stateful trusted mode, or a future managed remote worker. Treat the provider choice as an execution policy, not a semantic property of algebraic objects.

### 17.2 Capability manifest

```json
{
  "schemaVersion": 1,
  "engine": "sage",
  "sageVersion": "10.10",
  "route": "docker",
  "operations": {
    "polynomial.factor": { "supported": true },
    "ideal.groebner": { "supported": true },
    "matrix.smith": { "supported": true },
    "numberfield.classgroup": { "supported": false, "reason": "not enabled" }
  },
  "limits": {
    "maxSeconds": 30,
    "maxResultBytes": 2000000
  }
}
```

The values above are only an **example schema**, not a verified runtime capability report. Runtime probes should supply real values.

### 17.3 Job lifecycle

`created → validating → queued → running → serializing → verifying → completed`, with terminal `cancelled`, `failed`, `timed-out`, `unsupported` and `partial` alternatives where meaningful. Attach correlation IDs, project/run context, bounded input representations and structured errors. Do not retain live Sage objects in a hidden process between ordinary bounded requests unless explicitly implementing a versioned session cache with recovery semantics.

### 17.4 Execution limits

Use configurable CPU/elapsed time, memory, output size, expression depth, polynomial degree, matrix dimensions, number of group/subgroup elements and graph size. Severe or unknown-cost jobs must require deliberate resource-budget approval. Support cancellation propagation to the actual worker process/container and clean up orphaned jobs and temporary artifacts.

### 17.5 Trust boundaries

- **Bounded APIs:** server-owned command implementations; inputs validated; no arbitrary imports, shell, Python expressions or deserialization hooks.
- **Trusted desktop Sage Console:** explicit session trust, transparent selected local runtime, isolated profile, job controls, clear warning about arbitrary code capabilities.
- **Trusted Workbook code:** never execute automatically on open, import, replay, sync, refresh, or dependency recomputation.
- **Web and mobile:** bounded calls only unless separately designing a robust remote sandbox; do not inherit desktop trust.
- **Results:** sanitize LaTeX, HTML, filenames and all text before rendering; use safe structured formats and no executable payloads.
- **Artifacts:** file outputs stay within managed job directories with size limits and cleanup.

---

## 18. P2 — Finite field explorer

### 18.1 Features

- Field builder `GF(p^n)` with validated construction.
- Element list/multiplication table for small fields only.
- Generator/minimal-polynomial inspector.
- Field trace and norm to chosen subfield.
- Frobenius map and its orbit decomposition.
- Multiplicative group and primitive elements.
- Factorization of polynomials over finite fields.
- Field isomorphisms with explicitly selected generators/embeddings.
- Finite-field linear algebra and arithmetic experiments.
- Finite algebraic-curve point counting and finite incidence graphics (later).

### 18.2 Visuals

Build Frobenius orbit graph, multiplication table heatmap, subfield lattice and finite geometry incidence diagrams. Clearly limit sizes to keep rendering and computation manageable.

---

## 19. P2 — p-adic and local field explorer

### 19.1 Basics

Construct `Q_p` and `Z_p` with explicitly chosen finite precision, p-adic valuations, units, residues, expansions, arithmetic, Hensel lifting and local roots. Explain that machine p-adic computations commonly operate at finite precision and may not establish exact equality/zero in the way users expect.

### 19.2 Higher-level algebra

Study local field extensions, ramification indices and residue degrees, uniformizers, local norms/traces and decomposition/inertia when supported. Link to Number Theory's prime decomposition and completions. Provide a diagram of global field → prime ideal → completion → local extension.

### 19.3 Precision UI

Every result displays absolute/relative precision as appropriate, valuation information, whether an operation lost precision, and whether zero/nonzero is fully determined.

---

## 20. P2 — Elliptic curves

### 20.1 Object definition

For a suitable field and nonsingular Weierstrass model, represent an elliptic curve with coefficients, base field and model identity. For short Weierstrass form `y²=x³+ax+b` (characteristic restrictions apply), check nonzero discriminant.

### 20.2 Operations

Discriminant, `j`-invariant, singularity check, point addition and group law, torsion, rank (qualified by computability/proof conditions), rational points where known, reduction modulo primes, point counting over finite fields, Frobenius, isogenies and optional L-series / advanced arithmetic where supported.

### 20.3 Visual

Real elliptic curve plots and geometric chord/tangent rule for appropriate fields, plus finite-field point diagrams for finite fields. Do not depict modular finite-field point addition as if it were continuous real geometry.

---

## 21. P2 — Advanced commutative algebra and algebraic geometry

After ideals/quotients and geometry handoffs stabilize, add:

- Hilbert series and Hilbert polynomial.
- Krull dimension and codimension with assumptions.
- Radical, primary decomposition and associated primes.
- Singular loci, Jacobian ideals, tangent spaces/cones.
- Elimination and implicitization; resultant/discriminant methods.
- Algebraic morphisms and rational maps, domain restrictions.
- Schemes versus classical solution sets (careful object distinction).
- Homogenization and projective space.
- Affine/projective varieties and chart navigation.
- Syzygies and free resolutions, Betti tables (advanced).
- Intersections with multiplicity in supported settings.
- Gröbner fans/term orders as later research-oriented visualizations.

**Important:** Build scheme-sensitive concepts on an appropriately typed `AffineScheme` / `ProjectiveScheme` layer eventually, rather than treating a displayed real locus as all algebraic geometry.

---

## 22. P2 — Representation theory and group actions

After Group and Module systems mature:

- Group actions on sets and vector spaces, orbit/stabilizer computations.
- Permutation representations and matrices.
- Character tables of supported finite groups.
- Irreducible representations, character inner products and decomposition over suitable fields.
- Group algebra examples and module-theoretic interpretation.
- Young diagrams/tableaux for symmetric-group representations (later).
- Graph-based action orbits, representation decomposition diagrams.

This creates a natural bridge to quantum mechanics/finite symmetry computations, but should not destabilize the core Algebra milestone.

---

## 23. Additional high-value platform capabilities

### 23.1 Mathematics-aware command palette

Typing `smith`, `prime decomposition`, `factor over`, or `show tangent cone` should find operations and recipes filtered by the selected object's type and current runtime capability.

### 23.2 Guided discovery and examples

Each object type should ship with curated sample constructions and exact expected outputs. Include failure examples, not only happy paths. Offer “Why unavailable?” descriptions and inline learning notes.

### 23.3 Comparison mode

Compare `factor(f)` over `QQ` vs `GF(5)`, algorithms for Gröbner bases, matrix results across two Sage backends, or exact symbolic roots vs approximations. Display mathematically significant differences and backend discrepancies, not raw string diffs.

### 23.4 History and branching

Let users fork objects and experiments (`I@2`, `I_variant`), pin results to Workbook revisions and recover deleted objects through existing project reversibility conventions if present. Avoid silently recycling names/IDs.

### 23.5 Batch experiments

Run a bounded parameter sweep over controlled values, e.g. factor one polynomial modulo small primes and summarize factorization patterns. Provide tables, charts and aggregate statistics, with deterministic parameter manifest and total job budget.

### 23.6 Teaching/exposition mode

Use two presentation levels: compact expert result and detailed worked explanation with definition, hypothesis checks, steps, verification and cross-links. Steps must be generated from known mathematical identities or actual algorithm traces, not fictional descriptions of backend internals.

### 23.7 API / extension surface

A plugin can register a *declarative bounded operation schema* and a trusted server-side adapter, with explicit capability and release version. Keep untrusted UI plugins from registering arbitrary Python execution routes.

### 23.8 Search and gallery

Create a searchable gallery of preset rings, groups, finite fields, modules, number fields and curves with versioned definitions and expected mathematical invariants. Integrate with the main Math3D gallery without mixing mathematical exactness with renderer performance claims.

---

## 24. Proposed implementation tracks and commits

These are **proposed commit identifiers**, not existing Git commits. Keep them small and adjust filenames to repository conventions. Each commit must retain the current CAS/Number Theory screenshot reproduction pathway and existing tests.

### Track A — Object foundation (P0)

| Commit | Suggested commit title | Implementation | Acceptance |
|---|---|---|---|
| `SAGE-A01` | `feat(algebra): introduce versioned algebra object schemas` | Kind unions, refs, definitions, validators | JSON roundtrip, invalid definitions rejected |
| `SAGE-A02` | `feat(algebra): add project algebra object registry` | Create, rename, fork, delete/recover, revisions | Stable project persistence |
| `SAGE-A03` | `feat(algebra): add dependency and staleness tracking` | Content hashes, DAG, invalidation | Editing parent marks descendants stale |
| `SAGE-A04` | `feat(sage): add object reconstruction adapters` | Deterministic Sage constructors from typed data | No arbitrary code in bounded API |
| `SAGE-A05` | `feat(algebra): add domain and coercion metadata` | Parent descriptors, map refs | Domain errors clearly explained |
| `SAGE-A06` | `feat(algebra-ui): add Structures tab and object explorer` | Left panel and Inspector integration | Persist/reselect object between sessions |
| `SAGE-A07` | `feat(algebra-ui): add Ring and Field Builder` | ZZ, QQ, modular, polynomial, finite field | Validation and exact object summary |
| `SAGE-A08` | `test(algebra): add roundtrip and cross-runtime fixtures` | Sage 9.5/10.10 compatibility matrix | Core object fixtures pass |

### Track B — Operations and dossiers (P0)

| Commit | Suggested commit title | Implementation | Acceptance |
|---|---|---|---|
| `SAGE-B01` | `feat(algebra): add typed operation registry` | Input constraints, capability mapping, output schemas | Operations filtered by kind/domain |
| `SAGE-B02` | `feat(algebra): add polynomial dossier recipe` | Factor, square-free, derivatives, discriminant, roots | Known fixture passes |
| `SAGE-B03` | `feat(algebra): expand exact matrix operations` | RREF, kernel, image, minimal poly | Exact small matrices pass |
| `SAGE-B04` | `feat(algebra): add Smith and Hermite workflows` | Canonical form and optional transforms | Verify algebraic invariants |
| `SAGE-B05` | `feat(algebra-ui): add context-sensitive actions` | Actions by selected object | Invalid operations disabled with reason |
| `SAGE-B06` | `feat(algebra-ui): add dossier Inspector` | Results, structure, verification, execution | Structured panels from real Sage |
| `SAGE-B07` | `feat(algebra): add reusable recipe DAG engine` | Typed stages, dependencies, partial failures | Cancels/retains partial evidence |
| `SAGE-B08` | `test(algebra): add polynomial and matrix goldens` | Exact identities and failure cases | Deterministic on supported runtimes |

### Track C — Computational algebra (P1)

| Commit | Suggested commit title | Implementation | Acceptance |
|---|---|---|---|
| `SAGE-C01` | `feat(algebra): add ideal object and inspector` | Ambient ring, generators, revision | Can save/reopen an ideal |
| `SAGE-C02` | `feat(algebra): add groebner and elimination recipes` | Orders, reductions, elimination | Verify simple systems |
| `SAGE-C03` | `feat(algebra): add ideal membership and normal form` | Typed membership and optional witness | Check positive/negative fixtures |
| `SAGE-C04` | `feat(algebra): add quotient rings and dimension` | R/I, dimension queries | Grounded parent and result |
| `SAGE-C05` | `feat(algebra): add syzygy and Hilbert capability gates` | Advanced operations if supported | Explicit unsupported cases |
| `SAGE-C06` | `feat(algebra): add operation budgets and cost warnings` | Degree/size constraints | No unbounded work by default |

### Track D — Number theory and field extensions (P1)

| Commit | Suggested commit title | Implementation | Acceptance |
|---|---|---|---|
| `SAGE-D01` | `feat(algebra): add number field object builder` | Defining polynomial, basis, embeddings | `Q(sqrt(5))` dossier |
| `SAGE-D02` | `feat(number-theory): share field and ideal object refs` | Unified object cross-workspace | No duplicate serialization schemas |
| `SAGE-D03` | `feat(number-theory): add norm trace and embeddings` | Typed maps and results | Tower/basis consistency |
| `SAGE-D04` | `feat(number-theory): add prime decomposition recipe` | Prime ideal factors, e/f | Verify fundamental examples |
| `SAGE-D05` | `feat(algebra): add extension tower viewer` | Typed field inclusion graph | Degree products checked |
| `SAGE-D06` | `feat(algebra): add Galois analysis and subgroup views` | Group and fixed field operations | `x^4-2` order 8 fixture |

### Track E — Groups and modules (P1)

| Commit | Suggested commit title | Implementation | Acceptance |
|---|---|---|---|
| `SAGE-E01` | `feat(algebra): add finite group object schemas` | Group presentations, generators | Stable small group fixtures |
| `SAGE-E02` | `feat(algebra): add GAP capability operations` | Order, center, subgroups, conjugacy | Correct group invariants |
| `SAGE-E03` | `feat(algebra-ui): add Cayley and subgroup graph scenes` | Graph layout/export | Bounds and diagram provenance |
| `SAGE-E04` | `feat(algebra): add module presentations` | Free/quotient modules and maps | Map dimensions correct |
| `SAGE-E05` | `feat(algebra): add module invariant factor explorer` | Smith→module interpretation | Known torsion/free rank cases |
| `SAGE-E06` | `feat(topology): link chain complexes and homology` | Chain maps, boundary validation | `d²=0`, correct homology fixtures |

### Track F — Geometry and scientific platform (P1)

| Commit | Suggested commit title | Implementation | Acceptance |
|---|---|---|---|
| `SAGE-F01` | `feat(geometry): add algebraic locus scene contract` | Source refs, domain, bounds, precision | Exact source retained |
| `SAGE-F02` | `feat(geometry): add polynomial and ideal plot handoff` | Real curves and implicit surfaces | Sphere/plane intersection works |
| `SAGE-F03` | `feat(geometry): add singular-locus and tangent views` | Jacobian/tangent-cone scenes | Cusp/node examples differentiated |
| `SAGE-F04` | `feat(workbook): add typed algebra object cells` | Cell output refs and staleness | Reopen and recompute bounded cells |
| `SAGE-F05` | `feat(sage): add execution certificate and provenance schemas` | Runtime/algorithm/verifier info | Inspectable structured evidence |
| `SAGE-F06` | `feat(runtime): add versioned Sage capability manifests` | WSL/Docker feature probing | Unsupported cases deterministic |
| `SAGE-F07` | `feat(runtime): add bounded queue cancellation and budgets` | Real worker stop, cleanup | Job timeout truly terminates work |
| `SAGE-F08` | `test(sage): add end-to-end real backend regression suite` | UI + backend + persistence | Baseline 20-review cases retained |

### Track G — Advanced algebra (P2)

| Commit | Suggested commit title | Implementation | Acceptance |
|---|---|---|---|
| `SAGE-G01` | `feat(algebra): add finite field explorer` | Frobenius, trace/norm, elements | Small field invariants pass |
| `SAGE-G02` | `feat(number-theory): add p-adic workspace` | Qp/Zp, precision, Hensel lifting | Precision labels correct |
| `SAGE-G03` | `feat(number-theory): add local extensions` | Ramification/residue data | Known field examples |
| `SAGE-G04` | `feat(algebra): add elliptic curve objects` | Nonsingular model, invariants | Curve arithmetic fixtures |
| `SAGE-G05` | `feat(geometry): add elliptic curve visualization` | Real and finite field distinct views | Correct visualization labeling |
| `SAGE-G06` | `feat(algebra): add advanced ideal invariants` | Radical, Hilbert, primary decomp | Explicit capability and budgets |
| `SAGE-G07` | `feat(algebra): add representations and group actions` | Orbit/stabilizer, characters | Small group case checks |
| `SAGE-G08` | `feat(algebra): add projective/affine geometry objects` | Maps, schemes, charts | Type safety and handoffs |

### Track H — Product polish, pedagogy and extensibility (P2)

| Commit | Suggested commit title | Implementation | Acceptance |
|---|---|---|---|
| `SAGE-H01` | `feat(algebra-ui): add mathematics command palette` | Search actions and recipes | Capability-aware keyboard UI |
| `SAGE-H02` | `feat(algebra): add backend and domain comparison views` | Side-by-side certified differences | Avoid string-only equality |
| `SAGE-H03` | `feat(workbook): export reproducible algebra manifest` | JSON + human report | Import cannot auto-run code |
| `SAGE-H04` | `feat(algebra-gallery): add curated algebra examples` | Fields, groups, ideals, modules | Exact expected answers |
| `SAGE-H05` | `feat(algebra): add parameter sweep recipes` | Bounded combinatorial experiments | Global budget and repeatability |
| `SAGE-H06` | `docs(algebra): add detailed tutorials and math verification` | Worked steps + backend notes | Reviewer can reproduce examples |

---

## 25. Release milestones

### Milestone M0 — Current baseline preserved

Existing 20-review flows remain functional: simplify, symbolic factor, expand, solve, gradient, Hessian, singularity check, exact eigenvalues and characteristic polynomial, polynomial roots/factorization/Gröbner, GCD, modular inverse, typed error, runtime discovery, Number Theory, Workbook evidence, trusted Electron console and Workbook Sage code cell.

**Gate:** Capture reproduction is green against configured real test backends and existing project builds remain unchanged.

### Milestone M1 — Mathematical objects MVP

Ring/Field Builder, project object registry, typed definitions, revisions, domain metadata, algebra left panel and persistent object Inspector. **Gate:** create `R=QQ[x,y]`, close/reopen, select and use it in a bounded operation with intact parent/revision.

### Milestone M2 — Useful advanced Algebra MVP

Polynomial analysis dossier; exact matrix extension; Smith/Hermite where supported; typed recipes and validation. **Gate:** fixtures demonstrate exactness and correct failure semantics.

### Milestone M3 — Computational algebra

Ideals, Gröbner/elimination/membership, quotient ring, ground-field-aware solutions. **Gate:** complete `I=(x²+y²-1,x-y)` dossier and preserve it in Workbook.

### Milestone M4 — Number Theory/Galois/Groups

Number fields, field tower, elementary prime decomposition, Galois analysis, group operations and small lattice views. **Gate:** construct `Q(√5)` and analyze `x⁴-2` without duplicated object models.

### Milestone M5 — Geometry and topology bridge

Real algebraic locus → GeometryDocument; singularity local scene; module/Smith → homology bridge. **Gate:** reproducible scenes and verified algebra/geometry sources.

### Milestone M6 — Advanced laboratories

Finite fields, p-adics, elliptic curves, deeper commutative algebra and optional representation theory. **Gate:** capability-aware operation contracts and no regression to M0–M5.

---

## 26. Cross-runtime and quality strategy

### 26.1 Backend test grid

| Dimension | Required cases |
|---|---|
| Runtime | Docker Sage 10.10, local WSL Sage 9.5 when available |
| Trust | Bounded web operation, explicitly trusted desktop console, trusted Workbook cell |
| Mathematics | ZZ, QQ, modular composite, finite field, polynomial ring, matrix, ideal, number field |
| Outcome | Success, invalid input, unsupported capability, timeout, cancellation, stale object |
| Persistence | Save/reopen, fork, dependency edit, version migration |
| Output | Exact symbolic, numerical/approximate, conditional, partial/truncated |

### 26.2 Invariants to enforce

- Ring/field metadata matches actual backend parents.
- Matrix shape and base domain cannot silently change.
- A returned exact factorization multiplies back correctly.
- Gröbner outputs are tied to term order and coefficient field.
- Number field defining polynomial and embedding maps are preserved.
- Module decomposition accounts for free rank and torsion factors.
- Geometry scenes retain exact source object and numerical rendering provenance.
- Cancellation cannot return the previous successful result as if it were a new one.
- No untrusted object definition can bypass bounded execution.

### 26.3 Performance and telemetry

Track median/p95 runtime per operation category, worker startup overhead, cancellation latency, output size, cache hit rate, memory budget exceedance and number of stale/failed results. These are local engineering metrics; do not invent a benchmark target until representative Math3D workloads have been measured.

### 26.4 Documentation and reproducibility

Each feature should include: reference example, mathematical prerequisites, supported base domains, API schema, version/adapter notes, failure cases, budget behavior, example screenshot and repeatable automated tests. Keep curated advanced examples aligned with the computational assumptions of supported runtimes.

---

## 27. Three high-value end-to-end demonstrations

### Demo A — From an ideal to a visual curve

1. Create `R=QQ[x,y,z]` in the Ring Builder.
2. Create `I=(x²+y²+z²-1,x-y)`.
3. Inspect ideal and its Gröbner basis in chosen order.
4. Request real locus and choose bounds.
5. Produce a sourced curve scene in Geometry.
6. Optionally sample and export a derived mesh/curve artifact.
7. Save the entire chain as bounded Workbook cells.
8. Change one generator, observe stale downstream results and explicitly recompute.

**Proves:** objects, ideals, recipes, scene handoff, dependency DAG and provenance.

### Demo B — From an integer matrix to homology

1. Create integer matrix `A` representing a presentation map.
2. Compute Smith form and verify transformation when available.
3. Construct `coker(A)` and its finite torsion/free decomposition.
4. Display invariant factors with their correct coefficient ring.
5. Embed this matrix in a validated chain complex if applicable.
6. Display computed homology and save as a reusable Algebra/Topology object.

**Proves:** exact matrix algebra, modules, chain complexes and topology integration.

### Demo C — From a polynomial to Galois correspondence

1. Create `f=x⁴-2` in `QQ[x]`.
2. Inspect irreducibility and discriminant in polynomial dossier.
3. Construct the splitting field through a supported Sage recipe.
4. Compute Galois group and explicit action, expected order 8.
5. Render subgroup and intermediate-field views where available.
6. Export an exact field tower and a documented Workbook explanation.

**Proves:** polynomial analysis, extensions, groups, Galois viewer and reproducibility.

---

## 28. Risks, boundaries and non-goals

| Risk | Mitigation |
|---|---|
| Feature explosion in flat Services dropdown | Object-aware operation registry and recipe groupings |
| Sage version/API mismatch | Runtime manifest, adapter negotiation, 9.5/10.10 compatibility tests |
| Wrong mathematical domain | Parent inspector, explicit coercions and domain-specific rendering |
| Expensive or nonterminating computations | Budgets, queue, cancellation, bounded previews, partial results |
| Misleading mathematical certainty | Exactness/proof/verification status on every critical result |
| Unsafe arbitrary code | Trusted desktop-only execution path separate from bounded operations |
| Stale saved results | Revisioned refs and DAG invalidation |
| Equating numerical plots with exact varieties | Exact source + approximation metadata + completeness disclaimer |
| Coupling to one worker | Typed engine-independent operation/result envelopes |
| UI complexity | Progressive disclosure: compact summary → detailed Inspector → advanced recipe |
| Premature generality | Implement vertical slices and explicit supported types before abstractions expand |

**Not immediate goals:** a fully general computer algebra interpreter, automatic mathematical theorem proving, unrestricted cloud Python, a universal scheme engine, or solving every hard algebraic number theory problem. Those may be separate research projects; the platform should accurately bound what it can compute.

---

## 29. Recommended execution order

**Sprint sequence (order is deliberate; no duration estimate implied):**

1. **A01–A05:** Object contracts, persistence, revisions, exact parent metadata.
2. **A06–A08:** Structures tab, Ring/Field Builder, real-runtime schema tests.
3. **B01–B02 and B05–B06:** Operation registry, polynomial dossier, contextual UI and Inspector.
4. **B03–B04 and B07–B08:** Advanced matrices, Smith/Hermite, recipe DAG, mathematical fixtures.
5. **C01–C06:** Ideals, Gröbner, quotient rings, safeguards.
6. **F04–F08:** Workbook typed refs and scientific execution/provenance hardening (some pieces can begin earlier when needed).
7. **D01–D06:** Field extensions, Number Theory integration and Galois Explorer.
8. **E01–E06:** Groups, modules, lattice visualizations and topology bridge.
9. **F01–F03:** Algebra → Geometry and singularity visualization.
10. **G01–G08:** Advanced branches when platform contracts are proven.
11. **H01–H06:** Discovery, comparison, gallery, exports, teaching workflows.

Some tasks naturally overlap, but avoid implementing full Galois/group/variety UI before the object registry and runtime contracts are established.

---

## 30. Final product vision

The mature Math3D Sage environment should not merely answer “What is the factorization of this polynomial?” It should support a complete mathematical investigation:

```text
DEFINE
Ring, Field, Group, Matrix, Ideal, Module, Variety
    │
    ▼
ANALYZE
Typed operations and multi-step exact recipes
    │
    ▼
VERIFY
Invariants, identities, algorithm conditions, backend evidence
    │
    ▼
UNDERSTAND
Dossiers, algebraic diagrams, field towers, lattices, plots
    │
    ▼
CONNECT
CAS ↔ Number Theory ↔ Geometry ↔ Topology ↔ Mesh
    │
    ▼
PRESERVE
Versioned objects, Workbook dependency graph, reproducible results
```

**Immediate implementation recommendation:** begin with `AlgebraObject` contracts, the Ring/Field Builder and Analyze-object dossiers, while preserving the existing Services and trusted Sage workflows. These three features give Math3D the foundation to absorb future algebra without repeatedly redesigning the UI, backend or project model.

---

## Appendix A — Useful Sage reference categories (verify against runtime)

- SageMath reference manuals: https://doc.sagemath.org/html/en/reference/
- Polynomial rings: https://doc.sagemath.org/html/en/reference/polynomial_rings/
- Matrices: https://doc.sagemath.org/html/en/reference/matrices/
- Groups: https://doc.sagemath.org/html/en/reference/groups/
- Number fields: https://doc.sagemath.org/html/en/reference/number_fields/
- Finite rings and fields: https://doc.sagemath.org/html/en/reference/finite_rings/
- Arithmetic curves: https://doc.sagemath.org/html/en/reference/arithmetic_curves/

The reference links are starting points for API discovery, not evidence that every listed operation has an identical API across both installed Sage versions.

## Appendix B — Suggested project deliverables

```text
sage-algebra-roadmap/
  00-ROADMAP.md                       (this document)
  schemas/algebra-object.schema.json
  schemas/algebra-operation.schema.json
  schemas/result-envelope.schema.json
  schemas/runtime-capabilities.schema.json
  examples/polynomial-dossier.json
  examples/matrix-smith-module.json
  examples/ideal-to-geometry.json
  examples/number-field-tower.json
  examples/galois-lattice.json
  tests/fixtures/                      (exact expected mathematical results)
  tests/runtime-compatibility/         (Sage 9.5 vs 10.10)
  ui/wireframes/                       (Structure / Operations / Recipes)
```

These are recommended future deliverables, not files claimed to already exist in the repository.
