import { useEffect, useState } from "react";
import { analyzeBiquadraticExtensionFromDefinition, analyzeFiniteGroup, analyzeQuadraticNumberField,
  createGaloisGroupObject, inspectProjectAlgebraFreshness,
  type AlgebraObjectRecord, type AlgebraObjectRef,
  type AlgebraRecipeGraph, type Math3DProject, type ProjectAlgebraEvidence } from "@math3d/core";
import type { SageGaloisResult, SageModuleInvariantResult, SageChainHomologyResult } from "@math3d/core";
import SageServicesWorkspace, { type SageServicesWorkspaceProps } from "./SageServicesWorkspace";
import SageRingFieldBuilder from "./SageRingFieldBuilder";
import SageFieldTowerViewer from "./SageFieldTowerViewer";
import SageGaloisViewer from "./SageGaloisViewer";
import SageFiniteGroupViewer from "./SageFiniteGroupViewer";
import SageIdealBuilder from "./SageIdealBuilder";
import SageFiniteGroupBuilder from "./SageFiniteGroupBuilder";
import SageModuleBuilder from "./SageModuleBuilder";
import SageChainComplexBuilder from "./SageChainComplexBuilder";
import SageModuleInvariantViewer from "./SageModuleInvariantViewer";
import SageChainHomologyViewer from "./SageChainHomologyViewer";
import SageObjectOperations from "./SageObjectOperations";
import SageRecipes from "./SageRecipes";
import SageAlgebraEvidenceInspector from "./SageAlgebraEvidenceInspector";
import { algebraEvidenceInspectorModel } from "./algebraEvidenceInspectorModel";
import { createQuotientStarter, describeStructure, resolveStructureSelection, selectedStructure,
  structureDisplay, structureSelectionKey, type StructureStarterKind } from "./sageStructuresModel";

export type CASAlgebraWorkspaceProps = Omit<SageServicesWorkspaceProps, "structures"> & {
  onOpenConsole: () => void;
  workspaceContext?: "cas" | "number_theory";
  project: Math3DProject | null;
  onCreateStructure: (record: AlgebraObjectRecord) => void | Promise<void>;
  onSaveEvidence: (evidence: ProjectAlgebraEvidence) => void | Promise<void>;
  onSaveRecipe: (recipe: AlgebraRecipeGraph) => void | Promise<void>;
  onAppendRecipeEvidence: (base: Math3DProject, evidence: ProjectAlgebraEvidence) => Math3DProject | Promise<Math3DProject>;
  onOpenProjects: () => void;
};

const action = { border: "1px solid #b9cce3", borderRadius: 7, background: "#fff", color: "#183b70",
  padding: "7px 10px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" } as const;
const kindLabel: Record<StructureStarterKind, string> = {
  "integer-ring": "Integer ring ZZ", "rational-field": "Rational field QQ", "modular-ring": "Modular ring Z/nZ",
  "finite-field": "Finite field GF(p^n)", "polynomial-ring": "Polynomial ring",
  "number-field": "Quadratic number field",
  "field-extension": "Quadratic field extension",
};
const readSavedSelection = (project: Math3DProject | null): unknown => {
  if (!project) return null;
  try { const saved = localStorage.getItem(structureSelectionKey(project.identity.id)); return saved ? JSON.parse(saved) : null; }
  catch { return null; }
};

export default function CASAlgebraWorkspace({ project, onCreateStructure, onSaveEvidence, onSaveRecipe,
  onAppendRecipeEvidence, onOpenProjects, workspaceContext = "cas", ...props }: CASAlgebraWorkspaceProps) {
  const [selection, setSelection] = useState<AlgebraObjectRef | null>(() =>
    resolveStructureSelection(project, readSavedSelection(project)));
  const [selectionFocus, setSelectionFocus] = useState(0);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(() =>
    project?.algebraEvidence?.find((item) => item.request.target.objectId === selection?.objectId)?.id ?? null);
  const [evidenceFocus, setEvidenceFocus] = useState(0);
  const [builder, setBuilder] = useState<"ring" | "ideal" | "group" | "module" | "chain" | null>(null);
  const [quotientName, setQuotientName] = useState("");
  const [quotientError, setQuotientError] = useState("");
  const [groupError, setGroupError] = useState("");

  useEffect(() => {
    setSelection((current) => resolveStructureSelection(project,
      current && project?.algebraObjects?.some((entry) => entry.id === current.objectId)
        ? current : readSavedSelection(project)));
  }, [project?.identity.id, project?.identity.revision]);
  useEffect(() => {
    const evidence = project?.algebraEvidence?.find((item) => item.id === selectedEvidenceId);
    if (evidence && evidence.request.target.objectId !== selection?.objectId)
      setSelection(evidence.request.target);
  }, [project?.identity.revision, selectedEvidenceId]);

  const select = (ref: AlgebraObjectRef) => {
    setSelection(ref);
    setSelectionFocus((value) => value + 1);
    setSelectedEvidenceId(null);
    if (project) try { localStorage.setItem(structureSelectionKey(project.identity.id), JSON.stringify(ref)); }
    catch { /* Selection still works when local storage is unavailable. */ }
  };
  const chosen = selectedStructure(project, selection);
  const selectedEvidence = project?.algebraEvidence?.find((item) => item.id === selectedEvidenceId &&
    item.request.target.objectId === chosen?.record.id) ?? null;
  const evidenceModel = project && selectedEvidence ? algebraEvidenceInspectorModel(project, selectedEvidence) : null;
  const savedGaloisGroup = selectedEvidence && selectedEvidence.request.operation === "sage.galois.analyze"
    ? project?.algebraObjects?.find((entry) => { const definition = entry.revisions.at(-1)?.definition;
      return definition?.kind === "finite-group" && definition.source?.evidenceId === selectedEvidence.id; }) : null;
  const inspectEvidence = (id: string) => {
    const evidence = project?.algebraEvidence?.find((item) => item.id === id);
    if (evidence && evidence.request.target.objectId !== selection?.objectId) {
      setSelection(evidence.request.target);
      try { localStorage.setItem(structureSelectionKey(project!.identity.id), JSON.stringify(evidence.request.target)); }
      catch { /* Inspector selection remains available without local storage. */ }
    }
    setSelectedEvidenceId(id);
    setEvidenceFocus((value) => value + 1);
  };
  const freshness = project ? inspectProjectAlgebraFreshness(project) : [];
  const status = chosen ? freshness.find((item) => item.objectId === chosen.entry.id) : null;
  const parent = chosen?.record.definition.kind === "polynomial-ring"
    ? selectedStructure(project, chosen.record.definition.coefficientDomain)?.record
    : chosen?.record.definition.kind === "number-field"
      ? selectedStructure(project, chosen.record.definition.baseField)?.record
    : chosen?.record.definition.kind === "field-extension"
      ? selectedStructure(project, chosen.record.definition.baseField)?.record
    : chosen?.record.definition.kind === "ideal"
      ? selectedStructure(project, chosen.record.definition.ambientRing)?.record
      : chosen?.record.definition.kind === "quotient-ring"
        ? selectedStructure(project, chosen.record.definition.ambientRing)?.record
        : chosen?.record.definition.kind === "finite-group" && chosen.record.definition.source
          ? selectedStructure(project, chosen.record.definition.source.ring)?.record
        : chosen?.record.definition.kind === "module"
          ? selectedStructure(project, chosen.record.definition.baseRing)?.record : null;
  const idealParent = chosen?.record.definition.kind === "quotient-ring"
    ? selectedStructure(project, chosen.record.definition.ideal)?.record : null;
  const mapSource = chosen?.record.definition.kind === "module-map"
    ? selectedStructure(project, chosen.record.definition.sourceModule)?.record : null;
  const mapTarget = chosen?.record.definition.kind === "module-map"
    ? selectedStructure(project, chosen.record.definition.targetModule)?.record : null;
  const summary = chosen && project && chosen.record.kind !== "ideal" && chosen.record.kind !== "quotient-ring" &&
    chosen.record.kind !== "finite-group" && chosen.record.kind !== "module" && chosen.record.kind !== "module-map" &&
    chosen.record.kind !== "chain-complex"
    ? describeStructure(chosen.record, project) : null;

  const explorer = <div data-testid="cas-structures-explorer" style={{ display: "grid", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <h2 style={{ fontSize: 16, margin: 0, whiteSpace: "nowrap" }}>Project structures</h2>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("ring")}>+ New structure</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("ideal")}>+ New ideal</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("group")}>+ New group</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("module")}>+ New module</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("chain")}>+ New chain complex</button>
      </div>
    </div>
    {!project && <div role="status" style={{ fontSize: 12 }}>Open or create a Project to save algebra structures.
      <div style={{ marginTop: 8 }}><button type="button" style={action} onClick={onOpenProjects}>Open Projects</button></div>
    </div>}
    {project && <div className="sage-structure-list" aria-label="Saved algebra objects">
      {(project.algebraObjects ?? []).length ? [...project.algebraObjects!].sort((a, b) =>
        a.revisions[a.revisions.length - 1].label.localeCompare(b.revisions[b.revisions.length - 1].label))
        .map((entry) => {
          const latest = entry.revisions[entry.revisions.length - 1];
          const fresh = freshness.find((item) => item.objectId === entry.id);
          return <button type="button" key={entry.id} aria-current={selection?.objectId === entry.id}
            onClick={() => select({ objectId: entry.id, revision: latest.revision })}>
            <strong>{latest.label}</strong> <span style={{ fontSize: 11 }}>@{latest.revision}</span>
            <div style={{ fontSize: 12 }}>{structureDisplay(latest, project)}</div>
            <small>{entry.archived ? "Archived" : fresh?.status === "stale" ? "Stale parent" : "Current"}</small>
          </button>;
        }) : <div role="status" style={{ fontSize: 12, color: "#64748b" }}>No structures in this Project yet.</div>}
    </div>}
    {project && <SageFieldTowerViewer project={project} selected={selection} onSelect={select} onInspectEvidence={inspectEvidence} />}
  </div>;

  const dossier = builder === "ring" && project ? <SageRingFieldBuilder key={project.identity.id} project={project}
    onCreate={onCreateStructure} onCreated={(ref) => { select(ref); setBuilder(null); }} onCancel={() => setBuilder(null)} />
    : builder === "ideal" && project ? <SageIdealBuilder key={project.identity.id} project={project}
      onCreate={onCreateStructure} onCreated={(ref) => { select(ref); setBuilder(null); }} onCancel={() => setBuilder(null)} />
    : builder === "group" && project ? <SageFiniteGroupBuilder key={project.identity.id} project={project}
      onCreate={onCreateStructure} onCreated={(ref) => { select(ref); setBuilder(null); }} onCancel={() => setBuilder(null)} />
    : builder === "module" && project ? <SageModuleBuilder key={project.identity.id} project={project}
      onCreate={onCreateStructure} onCreated={(ref) => { select(ref); setBuilder(null); }} onCancel={() => setBuilder(null)} />
    : builder === "chain" && project ? <SageChainComplexBuilder key={project.identity.id} project={project}
      onCreate={onCreateStructure} onCreated={(ref) => { select(ref); setBuilder(null); }} onCancel={() => setBuilder(null)} />
    : chosen && project ? <div data-testid="cas-selected-structure" style={{ display: "grid", gap: 14 }}>
    <div><div style={{ fontSize: 11, color: "#64748b" }}>Structure dossier</div>
      <h2 style={{ margin: "3px 0", fontSize: 21 }}>{chosen.record.label}</h2>
      <div style={{ fontSize: 17 }}>{structureDisplay(chosen.record, project)}</div></div>
    <label style={{ display: "grid", gap: 4, maxWidth: 240, fontSize: 12 }}>Revision
      <select aria-label="Structure revision" value={chosen.record.revision}
        onChange={(event) => select({ objectId: chosen.record.id, revision: Number(event.target.value) })}>
        {chosen.entry.revisions.map((item) => <option key={item.revision} value={item.revision}>{item.label}@{item.revision}</option>)}
      </select>
    </label>
    <dl className="sage-structure-facts">
      <dt>Kind</dt><dd>{chosen.record.kind === "chain-complex" ? "ZZ chain complex" : chosen.record.kind === "module" ? "Presented module" : chosen.record.kind === "module-map" ? "Module map" : chosen.record.kind === "finite-group" ? "Finite group" : chosen.record.kind === "ideal" ? "Polynomial ideal" : chosen.record.kind === "quotient-ring"
        ? "Quotient ring" : kindLabel[chosen.record.kind as StructureStarterKind] ?? chosen.record.kind}</dd>
      <dt>Status</dt><dd>{chosen.entry.archived ? "Archived" : chosen.record.revision !== chosen.entry.revisions.length ? "Historical revision" : status?.status === "stale" ? "Stale parent" : "Current"}</dd>
      {summary && <><dt>Characteristic</dt><dd>{summary.characteristic}</dd>
        <dt>Field</dt><dd>{summary.field}</dd><dt>Cardinality</dt><dd>{summary.cardinality ?? "Infinite"}</dd>
        <dt>Zero divisors</dt><dd>{summary.zeroDivisors}</dd><dt>Exact arithmetic</dt><dd>Yes</dd></>}
      {parent && <><dt>{chosen.record.kind === "module" ? "Base ring" : chosen.record.kind === "ideal" || chosen.record.kind === "quotient-ring" ? "Ambient ring" : chosen.record.kind === "number-field" || chosen.record.kind === "field-extension" ? "Base field" : "Coefficient domain"}</dt><dd><button type="button" style={action} onClick={() => select({ objectId: parent.id, revision: parent.revision })}>{parent.label}@{parent.revision} · {structureDisplay(parent, project)}</button></dd></>}
      {mapSource && <><dt>Source module</dt><dd><button type="button" style={action} onClick={() => select({ objectId: mapSource.id, revision: mapSource.revision })}>{mapSource.label}@{mapSource.revision}</button></dd></>}
      {mapTarget && <><dt>Target module</dt><dd><button type="button" style={action} onClick={() => select({ objectId: mapTarget.id, revision: mapTarget.revision })}>{mapTarget.label}@{mapTarget.revision}</button></dd></>}
      {idealParent && <><dt>Ideal</dt><dd><button type="button" style={action} onClick={() => select({ objectId: idealParent.id, revision: idealParent.revision })}>{idealParent.label}@{idealParent.revision}</button></dd></>}
      {chosen.record.definition.kind === "ideal" && <><dt>Generators</dt><dd>{chosen.record.definition.generators.join(", ")}</dd>
        <dt>Validation</dt><dd>Bounded exact polynomial syntax</dd></>}
      {chosen.record.definition.kind === "polynomial-ring" && <>
        <dt>Variables</dt><dd>{chosen.record.definition.variables.join(", ")}</dd>
        <dt>Monomial order</dt><dd>{chosen.record.definition.monomialOrder}</dd></>}
      {chosen.record.definition.kind === "modular-ring" && <><dt>Modulus</dt><dd>{chosen.record.definition.modulus}</dd></>}
      {chosen.record.definition.kind === "finite-field" && <><dt>Degree</dt><dd>{chosen.record.definition.degree}</dd>
        <dt>Generator</dt><dd>{chosen.record.definition.generator}</dd><dt>Construction</dt><dd>Canonical Sage finite field</dd></>}
      {chosen.record.definition.kind === "finite-group" && (() => {
        const facts = analyzeFiniteGroup(chosen.record.definition);
        return <><dt>Order</dt><dd>{facts.order}</dd><dt>Elements of order 2</dt><dd>{facts.involutionCount}</dd>
          <dt>Representation</dt><dd>{facts.representation}</dd>
          <dt>Presentation</dt><dd>{facts.presentation}</dd>
          <dt>Generators</dt><dd>{facts.generatorOrders.map((item) => `${item.name}: order ${item.order}`).join("; ")}</dd>
          <dt>Checked relations</dt><dd>{facts.checkedRelations.join("; ") || "None"}</dd>
          {chosen.record.definition.representation === "permutation" && <><dt>Permutation degree</dt><dd>{chosen.record.definition.degree}</dd>
            <dt>Generator images</dt><dd>{chosen.record.definition.generators.map((item) => `${item.name}: [${item.images.join(", ")}]`).join("; ")}</dd></>}
          {chosen.record.definition.representation === "abelian" && <><dt>Invariant factors</dt><dd>{chosen.record.definition.invariantFactors.join(" | ")}</dd></>}
          {chosen.record.definition.source && <><dt>Source polynomial</dt><dd>{chosen.record.definition.source.polynomial}</dd>
            <dt>Splitting field</dt><dd>{chosen.record.definition.source.splittingPolynomial}</dd>
            <dt>Pinned evidence</dt><dd>{chosen.record.definition.source.evidenceId}</dd></>}
        </>;
      })()}
      {chosen.record.definition.kind === "module" && <>
        <dt>Ambient free module</dt><dd>R^{chosen.record.definition.ambientRank}</dd>
        <dt>Generators</dt><dd>{chosen.record.definition.generators.join(", ")}</dd>
        <dt>Relation map</dt><dd>A: R^{chosen.record.definition.relationMap.domainRank} → R^{chosen.record.definition.ambientRank}</dd>
        <dt>Relation matrix</dt><dd>{chosen.record.definition.relationMap.domainRank === 0 ? "Zero map (free module)" :
          chosen.record.definition.relationMap.matrix.map((row) => `[${row.join(", ")}]`).join("; ")}</dd>
        <dt>Interpretation</dt><dd>{chosen.record.definition.relationMap.domainRank === 0 ? "Free module" :
          "Presented quotient R^n / im(A); no classification asserted"}</dd>
      </>}
      {chosen.record.definition.kind === "module-map" && <>
        <dt>Map dimensions</dt><dd>R^{chosen.record.definition.domainRank} → R^{chosen.record.definition.codomainRank}</dd>
        <dt>Matrix</dt><dd>{chosen.record.definition.matrix.map((row) => `[${row.join(", ")}]`).join("; ")}</dd>
        <dt>Typing</dt><dd>Source and target are free modules over the same pinned ring</dd>
      </>}
      {chosen.record.definition.kind === "chain-complex" && <>
        <dt>Chain modules</dt><dd>{chosen.record.definition.modules.map((ref, degree) =>
          `C${degree}: ${selectedStructure(project, ref)?.record.label ?? ref.objectId}@${ref.revision}`).join("; ")}</dd>
        <dt>Boundaries</dt><dd>{chosen.record.definition.boundaries.map((ref, index) =>
          `d${index + 1}: ${selectedStructure(project, ref)?.record.label ?? ref.objectId}@${ref.revision}`).join("; ")}</dd>
        <dt>Chain condition</dt><dd>Exact d₁d₂ = 0 checked over ZZ</dd>
      </>}
      {chosen.record.definition.kind === "number-field" && (() => {
        const facts = analyzeQuadraticNumberField(chosen.record.definition.definingPolynomial,
          chosen.record.definition.generator);
        return <><dt>Defining polynomial</dt><dd>{facts.definingPolynomial}</dd>
          <dt>Degree</dt><dd>2</dd><dt>Signature</dt><dd>({facts.signature.join(", ")})</dd>
          <dt>Polynomial discriminant</dt><dd>{facts.polynomialDiscriminant}</dd>
          <dt>Field discriminant</dt><dd>{facts.fieldDiscriminant}</dd>
          <dt>Power basis</dt><dd>{facts.powerBasis.join(", ")}</dd>
          <dt>Integral basis</dt><dd>{facts.integralBasis.join(", ")}</dd>
          <dt>Embeddings of {facts.generator}</dt><dd>{facts.embeddingImages.join("; ")}</dd>
          <dt>Ring of integers</dt><dd>{facts.ringOfIntegers}</dd></>;
      })()}
      {chosen.record.definition.kind === "field-extension" && (() => {
        if (parent?.definition.kind !== "number-field") return null;
        const facts = analyzeBiquadraticExtensionFromDefinition(parent.definition.definingPolynomial,
          parent.definition.generator, chosen.record.definition.radicand, chosen.record.definition.generator);
        return <><dt>Relative polynomial</dt><dd>{facts.relativePolynomial}</dd>
          <dt>Base degree</dt><dd>{facts.baseDegree}</dd><dt>Relative degree</dt><dd>{facts.relativeDegree}</dd>
          <dt>Absolute degree</dt><dd>{facts.absoluteDegree}</dd><dt>Tower law</dt><dd>2 × 2 = 4</dd>
          <dt>Absolute basis</dt><dd>{facts.absoluteBasis.join(", ")}</dd>
          <dt>Base generator image</dt><dd>{parent.definition.generator} ↦ {parent.definition.generator} · [{facts.baseGeneratorImage.join(", ")}]</dd>
          <dt>Relation checks</dt><dd>{facts.baseRelation}; {facts.extensionRelation}</dd></>;
      })()}
    </dl>
    {chosen.record.kind === "ideal" && <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <label>Quotient name <input aria-label="Quotient name" value={quotientName}
        onChange={(event) => setQuotientName(event.target.value)} placeholder={`${chosen.record.label} quotient`} /></label>
      <button type="button" style={action} onClick={() => { try {
        if (!project) return;
        const record = createQuotientStarter(project, quotientName || `${chosen.record.label} quotient`,
          { objectId: chosen.record.id, revision: chosen.record.revision }, crypto.randomUUID());
        void Promise.resolve(onCreateStructure(record)).then(() => { select({ objectId: record.id, revision: 1 });
          setQuotientName(""); setQuotientError(""); }).catch((error) => setQuotientError(String(error)));
      } catch (error) { setQuotientError(String(error)); } }}>Save quotient ring</button>
      {quotientError && <span role="alert">{quotientError}</span>}
    </div>}
    {status?.causes.length ? <div role="status" style={{ color: "#9a3412", fontSize: 12 }}>Stale because a pinned parent definition advanced: {status.causes.map((item) => `${item.objectId}@${item.pinnedRevision} → @${item.currentRevision}`).join(", ")}.</div> : null}
  </div> : <div role="status" style={{ fontSize: 12, color: "#64748b" }}>{project ? "Select a saved structure to inspect its definition." : "Open a Project to inspect its structures."}</div>;

  const inspector = chosen ? <dl className="sage-structure-facts" data-testid="cas-structure-inspector">
    <dt>Object ID</dt><dd>{chosen.record.id}</dd>
    <dt>Revision</dt><dd>{chosen.record.revision}</dd>
    <dt>Definition hash</dt><dd>{chosen.record.contentHash}</dd>
    <dt>Parent revisions</dt><dd>{chosen.record.dependencies.length ? chosen.record.dependencies.map((ref) => `${ref.objectId}@${ref.revision}`).join(", ") : "None"}</dd>
    {chosen.record.definition.kind === "ideal" && <><dt>Ambient ring</dt><dd>{parent?.label}@{parent?.revision}</dd>
      <dt>Generators</dt><dd>{chosen.record.definition.generators.join(", ")}</dd></>}
    {chosen.record.definition.kind === "quotient-ring" && <><dt>Ambient ring</dt><dd>{parent?.label}@{parent?.revision}</dd>
      <dt>Ideal</dt><dd>{idealParent?.label}@{idealParent?.revision}</dd></>}
    {chosen.record.definition.kind === "number-field" && <><dt>Base field</dt><dd>{parent?.label}@{parent?.revision}</dd>
      <dt>Defining coefficients</dt><dd>{chosen.record.definition.definingPolynomial.join(", ")}</dd></>}
    {chosen.record.definition.kind === "field-extension" && <><dt>Base field</dt><dd>{parent?.label}@{parent?.revision}</dd>
      <dt>Adjoined radicand</dt><dd>{chosen.record.definition.radicand}</dd></>}
    {chosen.record.definition.kind === "finite-group" && <><dt>Exact group order</dt><dd>{analyzeFiniteGroup(chosen.record.definition).order}</dd>
      <dt>Representation</dt><dd>{chosen.record.definition.representation}</dd></>}
    {chosen.record.definition.kind === "module" && <><dt>Base ring</dt><dd>{parent?.label}@{parent?.revision}</dd>
      <dt>Ambient rank</dt><dd>{chosen.record.definition.ambientRank}</dd>
      <dt>Relation rank</dt><dd>{chosen.record.definition.relationMap.domainRank}</dd></>}
    {chosen.record.definition.kind === "module-map" && <><dt>Source</dt><dd>{mapSource?.label}@{mapSource?.revision}</dd>
      <dt>Target</dt><dd>{mapTarget?.label}@{mapTarget?.revision}</dd>
      <dt>Matrix dimensions</dt><dd>{chosen.record.definition.codomainRank} × {chosen.record.definition.domainRank}</dd></>}
    {chosen.record.definition.kind === "chain-complex" && <><dt>Coefficient ring</dt><dd>ZZ</dd>
      <dt>Chain groups</dt><dd>{chosen.record.definition.modules.map((ref, degree) =>
        `C${degree}: ${selectedStructure(project, ref)?.record.label ?? ref.objectId}@${ref.revision}`).join("; ")}</dd>
      <dt>Chain condition</dt><dd>d₁d₂ = 0</dd></>}
    <dt>Current dependents</dt><dd>{status?.directDependents.length ? status.directDependents.length : "None"}</dd>
    {summary && <><dt>Characteristic</dt><dd>{summary.characteristic}</dd><dt>Field</dt><dd>{summary.field}</dd>
      <dt>Cardinality</dt><dd>{summary.cardinality ?? "Infinite"}</dd><dt>Zero divisors</dt><dd>{summary.zeroDivisors}</dd></>}
  </dl> : <div role="status" style={{ fontSize: 12 }}>Select a structure in the Project explorer.</div>;

  return <SageServicesWorkspace {...props} onResult={(record) => { setSelectedEvidenceId(null); props.onResult(record); }}
    context={workspaceContext} title={workspaceContext === "cas" ? "CAS / Algebra" : "Number Theory"}
    description={workspaceContext === "cas"
      ? "Exact symbolic, polynomial, matrix, algebraic geometry, and number theory operations."
      : "Exact arithmetic and saved number-field objects in the shared Project algebra registry."}
    testId={workspaceContext === "cas" ? "cas-algebra-workspace" : "number-theory-workspace"} structures={{ projectId: project?.identity.id ?? null,
      projectTitle: project?.metadata.title ?? null,
      selectionKey: selection ? `${selection.objectId}@${selection.revision}:${selectionFocus}` : null,
      explorer, dossier, inspector,
      evidence: evidenceModel && selectedEvidence ? {
        focusKey: `${selectedEvidence.id}:${evidenceFocus}`,
        result: <><SageAlgebraEvidenceInspector model={evidenceModel} section="result" />
          {selectedEvidence.request.operation === "sage.galois.analyze" &&
            <SageGaloisViewer key={selectedEvidence.id} result={selectedEvidence.result as SageGaloisResult}
              groupLabel={savedGaloisGroup?.revisions.at(-1)?.label} saveError={groupError}
              onOpenGroup={savedGaloisGroup ? () => select({ objectId: savedGaloisGroup.id,
                revision: savedGaloisGroup.revisions.length }) : undefined}
              onSaveGroup={!savedGaloisGroup && project ? () => {
                try { const record = createGaloisGroupObject(project, selectedEvidence);
                  void Promise.resolve(onCreateStructure(record)).then(() => {
                    setGroupError(""); select({ objectId: record.id, revision: 1 });
                  }).catch((error) => setGroupError(String(error))); }
                catch (error) { setGroupError(String(error)); }
              } : undefined} />}
          {selectedEvidence.request.operation === "sage.group.dossier" && project &&
            <SageFiniteGroupViewer key={selectedEvidence.id} project={project} evidence={selectedEvidence} />}
          {selectedEvidence.request.operation === "sage.module.invariantFactors" &&
            <SageModuleInvariantViewer key={selectedEvidence.id}
              result={selectedEvidence.result as SageModuleInvariantResult} />}
          {selectedEvidence.request.operation === "sage.chain.homology" &&
            <SageChainHomologyViewer key={selectedEvidence.id}
              result={selectedEvidence.result as SageChainHomologyResult} />}</>,
        structure: <SageAlgebraEvidenceInspector model={evidenceModel} section="structure" />,
        verification: <SageAlgebraEvidenceInspector model={evidenceModel} section="verification" />,
        execution: <SageAlgebraEvidenceInspector model={evidenceModel} section="execution" />,
      } : undefined,
      operations: <SageObjectOperations project={project} selectedEvidenceId={selectedEvidenceId}
        onInspectEvidence={inspectEvidence} onSaveEvidence={async (evidence) => {
          await onSaveEvidence(evidence);
          inspectEvidence(evidence.id);
        }} target={chosen ? { objectId: chosen.record.id, revision: chosen.record.revision } : null} />,
      recipes: <SageRecipes project={project} target={chosen ? { objectId: chosen.record.id,
        revision: chosen.record.revision } : null} onSaveRecipe={onSaveRecipe}
        onAppendEvidence={onAppendRecipeEvidence} onInspectEvidence={inspectEvidence} /> }} />;
}
