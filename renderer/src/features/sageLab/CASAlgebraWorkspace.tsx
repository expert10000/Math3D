import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeBiquadraticExtensionFromDefinition, analyzeFiniteGroup, analyzeQuadraticNumberField,
  ellipticCurveFacts,
  createGaloisGroupObject, inspectProjectAlgebraFreshness,
  projectSavedAlgebraLocusEvidence, resolveProjectAlgebraLocusInspection,
  type AlgebraObjectRecord, type AlgebraObjectRef,
  type AlgebraRecipeGraph, type Math3DProject, type ProjectAlgebraEvidence,
  type ProjectAlgebraLocusReturn, type ProjectAlgebraLocusInspection,
  type SageAlgebraicLocusScene, type SageAlgebraicLocusSample,
  type SageAlgebraicSingularityScene } from "@math3d/core";
import type { SageGaloisResult, SageModuleInvariantResult, SageChainHomologyResult, SageFiniteFieldResult } from "@math3d/core";
import SageServicesWorkspace, { type SageServicesWorkspaceProps } from "./SageServicesWorkspace";
import SageRingFieldBuilder from "./SageRingFieldBuilder";
import SageFieldTowerViewer from "./SageFieldTowerViewer";
import SageGaloisViewer from "./SageGaloisViewer";
import SageFiniteGroupViewer from "./SageFiniteGroupViewer";
import SageGroupActionViewer from "./SageGroupActionViewer";
import SageIdealBuilder from "./SageIdealBuilder";
import SageFiniteGroupBuilder from "./SageFiniteGroupBuilder";
import SageModuleBuilder from "./SageModuleBuilder";
import SageChainComplexBuilder from "./SageChainComplexBuilder";
import SageModuleInvariantViewer from "./SageModuleInvariantViewer";
import SageChainHomologyViewer from "./SageChainHomologyViewer";
import SageFiniteFieldViewer from "./SageFiniteFieldViewer";
import SagePadicWorkspace from "./SagePadicWorkspace";
import SageLocalExtensionWorkspace from "./SageLocalExtensionWorkspace";
import SageEllipticCurveBuilder from "./SageEllipticCurveBuilder";
import SageEllipticCurveVisualization from "./SageEllipticCurveVisualization";
import SageAlgebraicLocusBuilder from "./SageAlgebraicLocusBuilder";
import SageAlgebraicLocusPlot from "./SageAlgebraicLocusPlot";
import SageAlgebraicSingularityView from "./SageAlgebraicSingularityView";
import SageSchemeBuilder from "./SageSchemeBuilder";
import SageSchemeTools from "./SageSchemeTools";
import SageCommandPalette from "./SageCommandPalette";
import SageAlgebraComparison from "./SageAlgebraComparison";
import SageAlgebraGallery from "./SageAlgebraGallery";
import type { SagePaletteAction } from "./sageCommandPaletteModel";
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
  onSaveLocusScene?: (scene: SageAlgebraicLocusScene) => void | Promise<void>;
  onSaveLocusSample?: (sample: SageAlgebraicLocusSample) => void | Promise<void>;
  onOpenLocusGeometry?: (documentId: string) => void | Promise<void>;
  requestedSelection?: { projectId: string; target: AlgebraObjectRef;
    contentHash: string; evidence?: ProjectAlgebraLocusReturn | null; token: number } | null;
  onSaveLocusSingularity?: (analysis: SageAlgebraicSingularityScene) => void | Promise<void>;
  onSaveRecipe: (recipe: AlgebraRecipeGraph) => void | Promise<void>;
  onAppendRecipeEvidence: (base: Math3DProject, evidence: ProjectAlgebraEvidence) => Math3DProject | Promise<Math3DProject>;
  onOpenProjects: () => void;
  onInstallGalleryExample?: (id: import("@math3d/core").AlgebraGalleryId) => AlgebraObjectRef | Promise<AlgebraObjectRef>;
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
  onSaveLocusScene, onSaveLocusSample, onOpenLocusGeometry, onSaveLocusSingularity, onAppendRecipeEvidence, onOpenProjects,
  onInstallGalleryExample, requestedSelection, workspaceContext = "cas", ...props }: CASAlgebraWorkspaceProps) {
  const [selection, setSelection] = useState<AlgebraObjectRef | null>(() =>
    resolveStructureSelection(project, requestedSelection && requestedSelection.projectId === project?.identity.id
      ? requestedSelection.target : readSavedSelection(project)));
  const [selectedSavedChoice, setSelectedSavedChoice] = useState<ProjectAlgebraLocusReturn | null>(
    requestedSelection?.evidence ?? null);
  const [handoffError, setHandoffError] = useState("");
  const [handoffNotice, setHandoffNotice] = useState("");
  const [selectionFocus, setSelectionFocus] = useState(0);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(() =>
    project?.algebraEvidence?.find((item) => item.request.target.objectId === selection?.objectId)?.id ?? null);
  const [evidenceFocus, setEvidenceFocus] = useState(0);
  const [builder, setBuilder] = useState<"ring" | "ideal" | "group" | "module" | "chain" | "curve" | "scheme" | null>(null);
  const [quotientName, setQuotientName] = useState("");
  const [quotientError, setQuotientError] = useState("");
  const [groupError, setGroupError] = useState("");
  const commandSequence = useRef(0);
  const [commandLeftTab, setCommandLeftTab] = useState<{ tab: "structures" | "operations" | "recipes"; token: number } | null>(null);
  const [commandRightTab, setCommandRightTab] = useState<{ tab: "runtimes"; token: number } | null>(null);
  const [commandOperation, setCommandOperation] = useState<{ id: import("@math3d/core").AlgebraOperationId; token: number } | null>(null);
  const [commandRecipe, setCommandRecipe] = useState<{ id: string | null; token: number } | null>(null);

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
  useEffect(() => { setSelectedSavedChoice(requestedSelection?.evidence ?? null); },
    [requestedSelection?.token, project?.identity.id]);

  const select = (ref: AlgebraObjectRef) => {
    setSelection(ref);
    setCommandOperation(null);
    setCommandRecipe(null);
    setSelectionFocus((value) => value + 1);
    setSelectedEvidenceId(null);
    if (project) try { localStorage.setItem(structureSelectionKey(project.identity.id), JSON.stringify(ref)); }
    catch { /* Selection still works when local storage is unavailable. */ }
  };
  useEffect(() => {
    if (!requestedSelection) return;
    const checked = requestedSelection.projectId === project?.identity.id
      ? resolveStructureSelection(project, requestedSelection.target) : null;
    const record = checked ? project?.algebraObjects?.find(entry => entry.id === checked.objectId)
      ?.revisions[checked.revision - 1] : null;
    if (!checked || checked.objectId !== requestedSelection.target.objectId ||
        checked.revision !== requestedSelection.target.revision ||
        record?.contentHash !== requestedSelection.contentHash) {
      setHandoffError("The requested Project algebra source is unavailable. Reopen it from the Project list.");
      setHandoffNotice("");
      return;
    }
    setHandoffError("");
    const entry = project?.algebraObjects?.find(item => item.id === checked.objectId);
    const freshness = inspectProjectAlgebraFreshness(project!).find(item => item.objectId === checked.objectId);
    setHandoffNotice(entry?.archived || checked.revision !== entry?.revisions.length ||
      freshness?.status === "stale"
      ? "Opened the pinned algebra revision for inspection. Prepare a new locus from a current, fresh source."
      : "");
    select(checked);
  }, [requestedSelection?.token, project?.identity.id]);
  const chosen = selectedStructure(project, selection);
  const savedEvidenceChoices = useMemo(() => project && chosen ?
    projectSavedAlgebraLocusEvidence(project, { objectId: chosen.record.id,
      revision: chosen.record.revision }) : [],
    [project, chosen?.record.id, chosen?.record.revision]);
  const savedLocus = useMemo(() => {
    if (!selectedSavedChoice) return null;
    if (!project) return { inspection: null, error: "The saved locus Project is unavailable." };
    try { return { inspection: resolveProjectAlgebraLocusInspection(project, selectedSavedChoice),
      error: null }; }
    catch (error) { return { inspection: null,
      error: `The saved locus evidence changed: ${(error as Error).message}` }; }
  }, [project, selectedSavedChoice]);
  const savedScene = savedLocus?.inspection?.kind === "singularity" ? savedLocus.inspection.analysis.scene :
    savedLocus?.inspection?.kind === "sampled" ? savedLocus.inspection.sample.scene :
    savedLocus?.inspection?.kind === "exact" ? savedLocus.inspection.scene : null;
  const activeSavedLocus: ProjectAlgebraLocusInspection | null = savedScene && chosen &&
    savedScene.source.target.id === chosen.record.id &&
    savedScene.source.target.revision === chosen.record.revision
    ? savedLocus!.inspection : null;
  const chooseCommand = (command: SagePaletteAction) => {
    const token = ++commandSequence.current;
    if (command.kind === "operation") { setCommandOperation({ id: command.id, token });
      setCommandLeftTab({ tab: "operations", token }); }
    else if (command.kind === "recipe") { setCommandRecipe({ id: command.id, token });
      setCommandLeftTab({ tab: "recipes", token }); }
    else if (command.kind === "tangent") { setBuilder(null); setCommandLeftTab({ tab: "structures", token }); }
    else setCommandRightTab({ tab: "runtimes", token });
  };
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
    : chosen?.record.definition.kind === "elliptic-curve"
      ? selectedStructure(project, chosen.record.definition.baseField)?.record
    : chosen?.record.definition.kind === "ideal"
      ? selectedStructure(project, chosen.record.definition.ambientRing)?.record
      : chosen?.record.definition.kind === "quotient-ring" ||
        chosen?.record.definition.kind === "affine-scheme" ||
        chosen?.record.definition.kind === "projective-scheme"
        ? selectedStructure(project, chosen.record.definition.ambientRing)?.record
      : chosen?.record.definition.kind === "scheme-chart"
        ? selectedStructure(project, chosen.record.definition.projectiveScheme)?.record
      : chosen?.record.definition.kind === "scheme-map"
        ? selectedStructure(project, chosen.record.definition.sourceChart)?.record
        : chosen?.record.definition.kind === "finite-group" && chosen.record.definition.source
          ? selectedStructure(project, chosen.record.definition.source.ring)?.record
        : chosen?.record.definition.kind === "module"
          ? selectedStructure(project, chosen.record.definition.baseRing)?.record : null;
  const idealParent = chosen?.record.definition.kind === "quotient-ring" ||
    chosen?.record.definition.kind === "affine-scheme" ||
    chosen?.record.definition.kind === "projective-scheme"
    ? selectedStructure(project, chosen.record.definition.ideal)?.record : null;
  const mapSource = chosen?.record.definition.kind === "module-map"
    ? selectedStructure(project, chosen.record.definition.sourceModule)?.record : null;
  const mapTarget = chosen?.record.definition.kind === "module-map"
    ? selectedStructure(project, chosen.record.definition.targetModule)?.record : null;
  const summary = chosen && project && chosen.record.kind !== "ideal" && chosen.record.kind !== "quotient-ring" &&
    chosen.record.kind !== "finite-group" && chosen.record.kind !== "module" && chosen.record.kind !== "module-map" &&
    chosen.record.kind !== "chain-complex" && chosen.record.kind !== "elliptic-curve" &&
    chosen.record.kind !== "affine-scheme" && chosen.record.kind !== "projective-scheme" &&
    chosen.record.kind !== "scheme-chart" && chosen.record.kind !== "scheme-map"
    ? describeStructure(chosen.record, project) : null;

  const explorer = <div data-testid="cas-structures-explorer" style={{ display: "grid", gap: 12 }}>
    {handoffError && <div role="alert">{handoffError}</div>}
    {savedLocus?.error && !handoffError && <div role="alert">{savedLocus.error}</div>}
    {handoffNotice && <div role="status">{handoffNotice}</div>}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <h2 style={{ fontSize: 16, margin: 0, whiteSpace: "nowrap" }}>Project structures</h2>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("ring")}>+ New structure</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("ideal")}>+ New ideal</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("group")}>+ New group</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("module")}>+ New module</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("chain")}>+ New chain complex</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("curve")}>+ New curve</button>
        <button type="button" style={action} disabled={!project} onClick={() => setBuilder("scheme")}>+ New scheme</button>
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
    {onInstallGalleryExample && <SageAlgebraGallery project={project} onInstall={onInstallGalleryExample} onSelect={select} />}
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
    : builder === "curve" && project ? <SageEllipticCurveBuilder key={project.identity.id} project={project}
      onCreate={onCreateStructure} onCreated={(ref) => { select(ref); setBuilder(null); }} onCancel={() => setBuilder(null)} />
    : builder === "scheme" && project ? <SageSchemeBuilder key={project.identity.id} project={project}
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
      <dt>Kind</dt><dd>{chosen.record.kind === "elliptic-curve" ? "Elliptic curve" : chosen.record.kind === "chain-complex" ? "ZZ chain complex" : chosen.record.kind === "module" ? "Presented module" : chosen.record.kind === "module-map" ? "Module map" : chosen.record.kind === "finite-group" ? "Finite group" : chosen.record.kind === "ideal" ? "Polynomial ideal" : chosen.record.kind === "affine-scheme" ? "Affine scheme" : chosen.record.kind === "projective-scheme" ? "Projective scheme" : chosen.record.kind === "scheme-chart" ? "Affine chart" : chosen.record.kind === "scheme-map" ? "Chart inclusion map" : chosen.record.kind === "quotient-ring"
        ? "Quotient ring" : kindLabel[chosen.record.kind as StructureStarterKind] ?? chosen.record.kind}</dd>
      <dt>Status</dt><dd>{chosen.entry.archived ? "Archived" : chosen.record.revision !== chosen.entry.revisions.length ? "Historical revision" : status?.status === "stale" ? "Stale parent" : "Current"}</dd>
      {summary && <><dt>Characteristic</dt><dd>{summary.characteristic}</dd>
        <dt>Field</dt><dd>{summary.field}</dd><dt>Cardinality</dt><dd>{summary.cardinality ?? "Infinite"}</dd>
        <dt>Zero divisors</dt><dd>{summary.zeroDivisors}</dd><dt>Exact arithmetic</dt><dd>Yes</dd></>}
      {parent && <><dt>{chosen.record.kind === "module" ? "Base ring" : chosen.record.kind === "ideal" || chosen.record.kind === "quotient-ring" || chosen.record.kind === "affine-scheme" || chosen.record.kind === "projective-scheme" ? "Ambient ring" : chosen.record.kind === "scheme-chart" ? "Projective scheme" : chosen.record.kind === "scheme-map" ? "Source chart" : chosen.record.kind === "number-field" || chosen.record.kind === "field-extension" || chosen.record.kind === "elliptic-curve" ? "Base field" : "Coefficient domain"}</dt><dd><button type="button" style={action} onClick={() => select({ objectId: parent.id, revision: parent.revision })}>{parent.label}@{parent.revision} · {structureDisplay(parent, project)}</button></dd></>}
      {chosen.record.definition.kind === "elliptic-curve" && (() => {
        const characteristic = parent?.definition.kind === "finite-field" ? parent.definition.characteristic : 0;
        const facts = ellipticCurveFacts(chosen.record.definition.a, chosen.record.definition.b, characteristic);
        return <><dt>Model</dt><dd>Short Weierstrass; nonsingular</dd>
          <dt>Discriminant</dt><dd>{facts.discriminant}</dd>
          <dt>j-invariant</dt><dd>{facts.jInvariant}</dd>
          <dt>Characteristic</dt><dd>{facts.characteristic}</dd></>;
      })()}
      {mapSource && <><dt>Source module</dt><dd><button type="button" style={action} onClick={() => select({ objectId: mapSource.id, revision: mapSource.revision })}>{mapSource.label}@{mapSource.revision}</button></dd></>}
      {mapTarget && <><dt>Target module</dt><dd><button type="button" style={action} onClick={() => select({ objectId: mapTarget.id, revision: mapTarget.revision })}>{mapTarget.label}@{mapTarget.revision}</button></dd></>}
      {idealParent && <><dt>Ideal</dt><dd><button type="button" style={action} onClick={() => select({ objectId: idealParent.id, revision: idealParent.revision })}>{idealParent.label}@{idealParent.revision}</button></dd></>}
      {(chosen.record.kind === "affine-scheme" || chosen.record.kind === "projective-scheme") && <>
        <dt>Exact construction</dt><dd>{chosen.record.kind === "affine-scheme" ? "Spec(R/I)" : "Proj(R/I)"}</dd>
        <dt>Scheme structure</dt><dd>The pinned ideal presentation is retained; no radical or real-locus reduction is applied.</dd>
      </>}
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
    {(["affine-scheme", "projective-scheme", "scheme-chart", "scheme-map"] as string[]).includes(chosen.record.kind) &&
      <SageSchemeTools key={`${chosen.record.id}@${chosen.record.revision}`} project={project} record={chosen.record}
        onCreate={onCreateStructure} onSelect={select} />}
    {chosen.record.definition.kind === "elliptic-curve" &&
      <SageEllipticCurveVisualization key={`${chosen.record.id}@${chosen.record.revision}`}
        project={project} curve={chosen.record} />}
    {savedEvidenceChoices.length > 0 && <section data-testid="cas-saved-locus-choices"
      style={{ display: "grid", gap: 6, border: "1px solid #c7d9ed", borderRadius: 8, padding: 10 }}>
      <strong>Saved locus evidence</strong>
      <small>Inspect a saved Project checkpoint. Opening it does not run a new calculation.</small>
      {savedEvidenceChoices.map(choice => <button type="button" key={choice.documentId}
        data-testid={`cas-saved-locus-choice-${choice.documentId}`}
        aria-pressed={selectedSavedChoice?.documentId === choice.documentId &&
          selectedSavedChoice.documentHash === choice.documentHash}
        style={{ ...action, textAlign: "left" }} onClick={() => {
          try {
            resolveProjectAlgebraLocusInspection(project, choice);
            setHandoffError(""); setSelectedSavedChoice(choice);
          } catch (error) { setHandoffError(`Saved locus could not open: ${String(error)}`); }
        }}>
        {choice.analysisHash ? `Exact tangent at (${choice.inspectionPoint?.join(", ")})` :
          choice.sampleHash ? "Bounded numerical sample" : "Uncomputed exact contract"}
        {` · ${choice.sourceStatus} · ${choice.documentId.slice(-8)}`}
      </button>)}
    </section>}
    {activeSavedLocus && selectedSavedChoice && <section
      data-testid={activeSavedLocus.kind === "singularity" ? "cas-saved-tangent-inspection" :
        "cas-saved-locus-inspection"} style={{ display: "grid", gap: 8 }}>
      <strong>{activeSavedLocus.kind === "singularity" ? "Saved exact tangent evidence" :
        activeSavedLocus.kind === "sampled" ? "Saved bounded locus sample" :
        "Saved exact locus contract"} · read-only</strong>
      {activeSavedLocus.kind === "singularity" ?
        <SageAlgebraicSingularityView analysis={activeSavedLocus.analysis} /> : <>
          <div><strong>Exact equations:</strong> {savedScene?.source.equations.join(" = 0; ")} = 0</div>
          <div><strong>Source:</strong> {savedScene?.source.target.label}@{savedScene?.source.target.revision}
            · {savedScene?.sceneHash}</div>
          <div><strong>Real bounds:</strong> {savedScene?.domain.bounds.map(bound =>
            `${bound.variable} ∈ [${bound.min}, ${bound.max}]`).join(" · ")}</div>
          {activeSavedLocus.kind === "sampled" ? <>
            <SageAlgebraicLocusPlot sample={activeSavedLocus.sample} />
            <div>{activeSavedLocus.sample.warnings.join(" ")}</div>
          </> : <div>Exact source contract only; the numerical locus is uncomputed.</div>}
        </>}
      {onOpenLocusGeometry && <button type="button" style={action} onClick={() => {
        try {
          resolveProjectAlgebraLocusInspection(project, selectedSavedChoice);
          void Promise.resolve(onOpenLocusGeometry(selectedSavedChoice.documentId))
            .catch(error => setHandoffError(`Saved Geometry could not open: ${String(error)}`));
        } catch (error) { setHandoffError(`Saved Geometry could not open: ${String(error)}`); }
      }}>Open saved {activeSavedLocus.kind === "singularity" ? "tangent" :
        activeSavedLocus.kind === "sampled" ? "sampled" : "exact"} Geometry</button>}
    </section>}
    {onSaveLocusScene && onSaveLocusSample && onSaveLocusSingularity && (chosen.record.definition.kind === "ideal" ||
      chosen.record.definition.kind === "polynomial-ring") &&
      <SageAlgebraicLocusBuilder key={`${chosen.record.id}@${chosen.record.revision}`}
        project={project} target={{ objectId: chosen.record.id, revision: chosen.record.revision }}
        onSave={onSaveLocusScene} onSaveSample={onSaveLocusSample} onOpenGeometry={onOpenLocusGeometry}
        onSaveSingularity={onSaveLocusSingularity} />}
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
    {(chosen.record.definition.kind === "affine-scheme" || chosen.record.definition.kind === "projective-scheme") &&
      <><dt>Ambient ring</dt><dd>{parent?.label}@{parent?.revision}</dd>
        <dt>Pinned ideal</dt><dd>{idealParent?.label}@{idealParent?.revision}</dd>
        <dt>Construction</dt><dd>{chosen.record.definition.kind === "affine-scheme" ? "Spec" : "Proj"}(R/I)</dd></>}
    {chosen.record.definition.kind === "scheme-chart" && <><dt>Projective scheme</dt><dd>{parent?.label}@{parent?.revision}</dd>
      <dt>Nonzero coordinate</dt><dd>{chosen.record.definition.nonzeroCoordinate}</dd></>}
    {chosen.record.definition.kind === "scheme-map" && <><dt>Source chart</dt><dd>{parent?.label}@{parent?.revision}</dd>
      <dt>Target projective</dt><dd>{chosen.record.definition.targetProjective.objectId}@{chosen.record.definition.targetProjective.revision}</dd>
      <dt>Map kind</dt><dd>Canonical chart open immersion</dd></>}
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
    requestedLeftTab={commandLeftTab} requestedRightTab={commandRightTab}
    topPanel={<><SageCommandPalette project={project} target={chosen ? { objectId: chosen.record.id,
      revision: chosen.record.revision } : null}
      locusAvailable={!!(onSaveLocusScene && onSaveLocusSample && onSaveLocusSingularity)} onAction={chooseCommand} />
      {workspaceContext === "number_theory" && <><SagePadicWorkspace project={project}
      onCreateStructure={onCreateStructure} onSaveEvidence={onSaveEvidence} />
      <SageLocalExtensionWorkspace project={project} onSaveEvidence={onSaveEvidence} /></>}</>}
    context={workspaceContext} title={workspaceContext === "cas" ? "CAS / Algebra" : "Number Theory"}
    description={workspaceContext === "cas"
      ? "Exact symbolic, polynomial, matrix, algebraic geometry, and number theory operations."
      : "Exact arithmetic and saved number-field objects in the shared Project algebra registry."}
    testId={workspaceContext === "cas" ? "cas-algebra-workspace" : "number-theory-workspace"} structures={{ projectId: project?.identity.id ?? null,
      projectTitle: project?.metadata.title ?? null,
      selectionKey: selection ? `${selection.objectId}@${selection.revision}:${selectionFocus}` : null,
      explorer, dossier, inspector,
      comparison: <SageAlgebraComparison project={project} selectedEvidenceId={selectedEvidenceId}
        onInspectEvidence={inspectEvidence} />,
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
          {selectedEvidence.request.operation === "sage.group.actionCharacters" &&
            <SageGroupActionViewer key={selectedEvidence.id} evidence={selectedEvidence} />}
          {selectedEvidence.request.operation === "sage.module.invariantFactors" &&
            <SageModuleInvariantViewer key={selectedEvidence.id}
              result={selectedEvidence.result as SageModuleInvariantResult} />}
          {selectedEvidence.request.operation === "sage.chain.homology" &&
            <SageChainHomologyViewer key={selectedEvidence.id}
              result={selectedEvidence.result as SageChainHomologyResult} />}
          {selectedEvidence.request.operation === "sage.finiteField.explore" &&
            <SageFiniteFieldViewer key={selectedEvidence.id}
              result={selectedEvidence.result as SageFiniteFieldResult} />}</>,
        structure: <SageAlgebraEvidenceInspector model={evidenceModel} section="structure" />,
        verification: <SageAlgebraEvidenceInspector model={evidenceModel} section="verification" />,
        execution: <SageAlgebraEvidenceInspector model={evidenceModel} section="execution" />,
      } : undefined,
      operations: <SageObjectOperations project={project} selectedEvidenceId={selectedEvidenceId}
        requestedOperation={commandOperation}
        onInspectEvidence={inspectEvidence} onSaveEvidence={async (evidence) => {
          await onSaveEvidence(evidence);
          inspectEvidence(evidence.id);
        }} target={chosen ? { objectId: chosen.record.id, revision: chosen.record.revision } : null} />,
      recipes: <SageRecipes project={project} target={chosen ? { objectId: chosen.record.id,
        revision: chosen.record.revision } : null} onSaveRecipe={onSaveRecipe}
        requestedRecipe={commandRecipe}
        onAppendEvidence={onAppendRecipeEvidence} onInspectEvidence={inspectEvidence} /> }} />;
}
