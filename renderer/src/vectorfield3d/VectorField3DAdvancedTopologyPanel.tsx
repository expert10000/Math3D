import { useState } from "react";
import { computeVectorField3DPoincareReturnMap, computeVectorField3DLyapunov,
  computeVectorField3DLocalManifoldPatch, projectPoincareReturnStatus,
  computeVectorField3DManifoldContinuation, projectManifoldContinuationStatus,
  computeVectorField3DExtendedManifold, projectExtendedManifoldStatus,
  computeVectorField3DManifoldAtlas, projectManifoldAtlasStatus,
  projectManifoldSurfaceCoverageStatus,
  projectAtlasSeamsStatus, projectAtlasRefinementStatus,
  structuralHash,
  projectLyapunovStatus, projectLocalManifoldPatchStatus,
  projectVectorField3DTopologyStatus, type AnalysisResultEnvelope,
  type LocalManifoldPatch, type ManifoldContinuationStudy,
  type ExtendedManifoldStudy, type ManifoldAtlasStudy,
  type ManifoldSurfaceCoverageStudy,
  type AtlasSeamEvidence, type AtlasRefinementEvidence,
  type LyapunovStudy, type Math3DProject,
  type PoincareReturnStudy, type VectorField3DDocument } from "@math3d/core";

export function VectorField3DAdvancedTopologyPanel({ document, project,
  onSaveReturn, onOpenReturn, onSaveLyapunov, onPromoteManifold,
  onPromoteContinuation, onPromoteExtended, onPromoteAtlas,
  onValidateAtlasCoverage, onValidateAtlasSeams,
  onValidateAtlasRefinement }: {
  document: VectorField3DDocument; project?: Math3DProject | null;
  onSaveReturn?: (study: PoincareReturnStudy) => void;
  onOpenReturn?: (result: AnalysisResultEnvelope) => void;
  onSaveLyapunov?: (study: LyapunovStudy) => void;
  onPromoteManifold?: (patch: LocalManifoldPatch) => void;
  onPromoteContinuation?: (study: ManifoldContinuationStudy) => void;
  onPromoteExtended?: (study: ExtendedManifoldStudy) => void;
  onPromoteAtlas?: (study: ManifoldAtlasStudy) => void;
  onValidateAtlasCoverage?: (baseResultId: string, refinedResultId: string) => Promise<ManifoldSurfaceCoverageStudy>;
  onValidateAtlasSeams?: (coverageResultId: string) => Promise<AtlasSeamEvidence>;
  onValidateAtlasRefinement?: (seamsResultId: string) => Promise<AtlasRefinementEvidence>;
}) {
  const axes = document.source.axes;
  const center = axes.map(axis => (axis.min + axis.max) / 2);
  const span = Math.min(...axes.map(axis => axis.max - axis.min));
  const [sectionId, setSectionId] = useState("");
  const [returnStudy, setReturnStudy] = useState<PoincareReturnStudy | null>(null);
  const [seed, setSeed] = useState<[number, number, number]>(
    [center[0]! + span / 16, center[1]! + span / 16, center[2]!]);
  const [interval, setInterval] = useState(2);
  const [perturbation, setPerturbation] = useState(span * .001);
  const [lyapunov, setLyapunov] = useState<LyapunovStudy | null>(null);
  const [constructionId, setConstructionId] = useState("");
  const [branch, setBranch] = useState<"stable" | "unstable">("stable");
  const [seedCount, setSeedCount] = useState(8);
  const [patchOffsetFraction, setPatchOffsetFraction] = useState(.01);
  const [ringCount, setRingCount] = useState(5);
  const [patchTime, setPatchTime] = useState(1);
  const [solverTolerance, setSolverTolerance] = useState(1e-5);
  const [manifold, setManifold] = useState<LocalManifoldPatch | null>(null);
  const [savedPatchId, setSavedPatchId] = useState("");
  const [continuation, setContinuation] = useState<ManifoldContinuationStudy | null>(null);
  const [extended, setExtended] = useState<ExtendedManifoldStudy | null>(null);
  const [atlas, setAtlas] = useState<ManifoldAtlasStudy | null>(null);
  const [surfaceCoverage, setSurfaceCoverage] = useState<ManifoldSurfaceCoverageStudy | null>(null);
  const [seamEvidence, setSeamEvidence] = useState<AtlasSeamEvidence | null>(null);
  const [refinementEvidence, setRefinementEvidence] = useState<AtlasRefinementEvidence | null>(null);
  const [atlasDomainFraction, setAtlasDomainFraction] = useState(1);
  const [atlasOverlapTolerance, setAtlasOverlapTolerance] = useState(.1);
  const [extraTime, setExtraTime] = useState(.5);
  const [message, setMessage] = useState("");
  const run = (task: () => void) => {
    try { setMessage(""); task(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
  };
  const sections = project?.workspace.results.filter(result =>
    result.provenance.operation.type === "vector3d.poincare-section" &&
    result.provenance.source.documentId === document.identity.id &&
    projectVectorField3DTopologyStatus(project, result).status === "current") ?? [];
  const saved = project?.workspace.results.filter(result =>
    ["vector3d.poincare-return-map", "vector3d.lyapunov-finite-time",
      "vector3d.local-manifold-patch", "vector3d.manifold-continuation",
      "vector3d.extended-manifold", "vector3d.manifold-atlas",
      "vector3d.manifold-surface-coverage", "vector3d.atlas-seams",
      "vector3d.atlas-refinement"]
      .includes(result.provenance.operation.type) &&
    result.provenance.source.documentId === document.identity.id) ?? [];
  const constructions = document.workspace?.equilibriumConstructions ?? [];
  const currentExtended = saved.filter(item => item.provenance.operation.type ===
    "vector3d.extended-manifold" &&
    projectExtendedManifoldStatus(project!, item).status === "current");
  const savedBaseAtlas = saved.find(item => item.provenance.operation.type ===
    "vector3d.manifold-atlas" &&
    (item.summary.memberResultIds as unknown[] | undefined)?.length === 2 &&
    projectManifoldAtlasStatus(project!, item).status === "current");
  const savedRefinedAtlas = saved.find(item => item.provenance.operation.type ===
    "vector3d.manifold-atlas" &&
    (item.summary.memberResultIds as unknown[] | undefined)?.length === 3 &&
    item.summary.baseAtlasResultId === savedBaseAtlas?.resultId &&
    projectManifoldAtlasStatus(project!, item).status === "current");
  const savedCoverage = saved.find(item => item.provenance.operation.type ===
    "vector3d.manifold-surface-coverage" &&
    item.summary.refinedResultId === savedRefinedAtlas?.resultId);
  const savedSeams = saved.find(item => item.provenance.operation.type ===
    "vector3d.atlas-seams" &&
    item.summary.coverageResultId === savedCoverage?.resultId);
  const replayExtended = (results: readonly AnalysisResultEnvelope[]) => {
    const pinned = project!.workspace.entries.find(item => item.module === "vector3d" &&
      item.expected.id === results[0]?.provenance.source.documentId)?.checkpoint;
    if (pinned?.format !== "math3d.vector-field3d-document")
      throw new TypeError("Pinned atlas source is missing.");
    const studies = results.map(result => {
      const base = project!.workspace.results.find(item => item.resultId ===
        result.provenance.operation.parameters.baseResultId);
      if (!base) throw new TypeError("Atlas base patch is missing.");
      const patch = computeVectorField3DLocalManifoldPatch(pinned,
        base.provenance.operation.parameters.recipe as
          import("@math3d/core").LocalManifoldRecipe);
      if (patch.publication?.resultId !== base.resultId ||
          patch.publication.summary.geometryHash !== base.summary.geometryHash)
        throw new TypeError("Atlas base patch changed.");
      const recipe = result.provenance.operation.parameters.recipe as
        import("@math3d/core").ExtendedManifoldRecipe;
      const study = computeVectorField3DExtendedManifold(project!, pinned, patch, recipe);
      if (study.publication?.resultId !== result.resultId ||
          structuralHash(study.publication.summary) !== structuralHash(result.summary))
        throw new TypeError("Atlas member did not reproduce its saved geometry.");
      return study;
    });
    return { pinned, studies };
  };
  return <section aria-label="Advanced local topology" data-gf06-section="analyze"
    data-testid="gf44-gf46-advanced-topology">
    <h5>Return maps, finite-time growth and local manifold patches</h5>
    <p>Bounded analytic gates. Source-linked results are withheld after the field changes.</p>
    <div data-testid="gf44-return-controls">
      <h6>Poincaré return map</h6>
      <label>Saved oriented section <select value={sectionId}
        onChange={event => setSectionId(event.target.value)}>
        <option value="">Choose a saved GF-42 section</option>
        {sections.map(item => <option key={item.resultId} value={item.resultId}>
          {item.resultId.slice(-12)} · {String(item.summary.crossingCount)} crossings
        </option>)}
      </select></label>
      <button type="button" disabled={!project || !sectionId} onClick={() => run(() =>
        setReturnStudy(computeVectorField3DPoincareReturnMap(project!, sectionId)))}>
        Compute bounded return pairs</button>
      {returnStudy && <p role="status" data-testid="gf44-return-status">
        {returnStudy.status === "ready" ?
          `${returnStudy.rows.length} ordered pairs · refinement difference ${returnStudy.maxRefinementDifference.toPrecision(3)}` :
          `Return map unavailable: ${returnStudy.reason}`}
      </p>}
      {returnStudy?.status === "ready" && <button type="button"
        disabled={!onSaveReturn} onClick={() => run(() => {
          onSaveReturn?.(returnStudy); setMessage("Return-map recipe saved in Project.");
        })}>Save return map</button>}
    </div>
    <div data-testid="gf45-lyapunov-controls">
      <h6>Finite-time directional Lyapunov estimate</h6>
      {seed.map((value, axis) => <label key={axis}>Seed {axes[axis]!.label}
        <input type="number" step="any" value={value} onChange={event =>
          setSeed(previous => previous.map((item, i) => i === axis ?
            Number(event.target.value) : item) as [number, number, number])} />
      </label>)}
      <label>Interval ({document.source.timeUnit}) <input type="number" step="any"
        value={interval} onChange={event => setInterval(Number(event.target.value))} /></label>
      <label>Perturbation ({axes[0].unit}) <input type="number" step="any"
        value={perturbation} onChange={event =>
          setPerturbation(Number(event.target.value))} /></label>
      <button type="button" onClick={() => run(() => setLyapunov(
        computeVectorField3DLyapunov(document, { seed, direction: [1, 0, 0],
          perturbation, interval, solver: { method: "rk4-step-doubling",
            maxSteps: 256, maxTime: interval, absoluteTolerance: 1e-5,
            relativeTolerance: 1e-5 } })))}>
        Estimate finite-time growth</button>
      {lyapunov && <p role="status" data-testid="gf45-lyapunov-status">
        {lyapunov.status === "resolved" ?
          `Finite-time estimate ${lyapunov.estimate!.toPrecision(5)} ± ${lyapunov.uncertainty!.toPrecision(3)} 1/${document.source.timeUnit}; ${lyapunov.evaluations} evaluations.` :
          `Estimate unavailable: ${lyapunov.reason}; stops ${lyapunov.stopReasons.join(", ")}.`}
      </p>}
      {lyapunov?.status === "resolved" && <button type="button"
        disabled={!onSaveLyapunov} onClick={() => run(() => {
          onSaveLyapunov?.(lyapunov); setMessage("Finite-time recipe saved in Project.");
        })}>Save finite-time estimate</button>}
    </div>
    <div data-testid="gf46-manifold-controls">
      <h6>Local 3D manifold patch</h6>
      <label>Saved equilibrium <select value={constructionId}
        onChange={event => setConstructionId(event.target.value)}>
        <option value="">Choose a saved equilibrium</option>
        {constructions.map(item => <option key={item.id} value={item.id}>
          {item.id} · {item.classification}</option>)}
      </select></label>
      <label>Branch <select value={branch} onChange={event =>
        setBranch(event.target.value as "stable" | "unstable")}>
        <option value="stable">Stable</option><option value="unstable">Unstable</option>
      </select></label>
      <label>Patch seeds (6–12) <input type="number" min="6" max="12"
        step="1" value={seedCount} onChange={event =>
          setSeedCount(Number(event.target.value))} /></label>
      <label>Patch offset fraction <input type="number" min="0.0001" max="0.03"
        step="any" value={patchOffsetFraction} onChange={event =>
          setPatchOffsetFraction(Number(event.target.value))} /></label>
      <label>Patch rings (3–8) <input type="number" min="3" max="8"
        step="1" value={ringCount} onChange={event =>
          setRingCount(Number(event.target.value))} /></label>
      <label>Patch time ({document.source.timeUnit}) <input type="number"
        min="0.1" max="4" step="0.25" value={patchTime} onChange={event =>
          setPatchTime(Number(event.target.value))} /></label>
      <label>Patch solver tolerance <input type="number" min="1e-9"
        max="1e-4" step="any" value={solverTolerance} onChange={event =>
          setSolverTolerance(Number(event.target.value))} /></label>
      <button type="button" disabled={!constructionId} onClick={() => run(() =>
        setManifold(computeVectorField3DLocalManifoldPatch(document, {
          constructionId, branch, offsetFraction: patchOffsetFraction, seedCount,
          rings: ringCount, timeLimit: patchTime,
          solver: { method: "rk4-step-doubling", maxSteps: 256,
            absoluteTolerance: solverTolerance,
            relativeTolerance: solverTolerance } })))}>
        Build bounded local patch</button>
      {manifold && <p role="status" data-testid="gf46-manifold-status">
        {manifold.status === "resolved" ?
          `Local ${branch} patch · ${manifold.vertices.length} vertices · ${manifold.triangles.length} triangles · stops ${manifold.stopReasons.join(", ")}.` :
          `Patch unavailable: ${manifold.reason}; stops ${manifold.stopReasons.join(", ")}.`}
      </p>}
      {manifold?.status === "resolved" && <button type="button"
        disabled={!onPromoteManifold} onClick={() => run(() => {
          onPromoteManifold?.(manifold); setMessage("Local patch saved as a source-linked Mesh.");
        })}>Save local patch as Mesh</button>}
      <label>Saved local patch <select value={savedPatchId}
        onChange={event => setSavedPatchId(event.target.value)}>
        <option value="">Choose a saved patch</option>
        {saved.filter(item => item.provenance.operation.type ===
          "vector3d.local-manifold-patch").map(item =>
          <option key={item.resultId} value={item.resultId}>{item.resultId.slice(-12)}</option>)}
      </select></label>
      <button type="button" disabled={!savedPatchId} onClick={() => run(() => {
        const result = saved.find(item => item.resultId === savedPatchId)!;
        if (projectLocalManifoldPatchStatus(project!, result).status !== "current")
          throw new TypeError("Saved local patch source has changed.");
        const patch = computeVectorField3DLocalManifoldPatch(document,
          result.provenance.operation.parameters.recipe as import("@math3d/core").LocalManifoldRecipe);
        if (patch.status !== "resolved" || patch.publication?.resultId !== result.resultId ||
            patch.publication.summary.geometryHash !== result.summary.geometryHash)
          throw new TypeError("Saved patch geometry cannot be verified.");
        setManifold(patch); setContinuation(null); setExtended(null);
        setMessage("Saved local patch verified for bounded continuation.");
      })}>Verify saved patch for continuation</button>
      {manifold?.status === "resolved" && project?.workspace.results.some(item =>
        item.resultId === manifold.publication?.resultId) && <button type="button"
        onClick={() => run(() => {
          const recipe = manifold.publication!.provenance.operation.parameters.recipe as
            import("@math3d/core").LocalManifoldRecipe;
          setContinuation(computeVectorField3DManifoldContinuation(project, document,
            manifold, recipe.timeLimit / (recipe.rings - 1)));
        })}>Validate one continuation ring</button>}
      {continuation && <p role="status" data-testid="gf51-continuation-status">
        {continuation.status === "validated" ?
          `Local continuation validated: ${continuation.candidate!.vertices.length} vertices; ` +
            `prefix error ${continuation.prefixError!.toPrecision(3)} ${axes[0].unit}; ` +
            `${continuation.selfIntersectionPairs} screened intersections.` :
          `Continuation unavailable: ${continuation.reason}; ` +
            `prefix error ${continuation.prefixError ?? "unavailable"}.`}
      </p>}
      {continuation?.status === "validated" && <button type="button"
        disabled={!onPromoteContinuation} onClick={() => run(() => {
          onPromoteContinuation?.(continuation);
          setMessage("Validated continuation saved as a local source-linked Mesh.");
        })}>Save validated continuation Mesh</button>}
      {manifold?.status === "resolved" && project?.workspace.results.some(item =>
        item.resultId === manifold.publication?.resultId) && <div data-testid="gf55-controls">
        <label>Additional time ({document.source.timeUnit})
          <input type="number" step="0.25" min="0.25" max="2" value={extraTime}
            onChange={event => setExtraTime(Number(event.target.value))} /></label>
        <p>Declared domain: {axes.map(axis => `${axis.min}…${axis.max} ${axis.unit}`).join(" × ")}.
          Work cap: 5 attempts, 1,000,000 evaluations.</p>
        <button type="button" onClick={() => run(() => setExtended(
          computeVectorField3DExtendedManifold(project, document, manifold,
            { domain: axes.map(axis => [axis.min, axis.max]) as unknown as
                import("@math3d/core").ExtendedManifoldRecipe["domain"],
              targetExtraTime: extraTime, maxAttempts: 5,
              maxEvaluations: 1_000_000 })))}>
          Validate adaptive local continuation</button>
        {extended && <p role="status" data-testid="gf55-extended-status">
          {extended.status === "validated" ?
            `Local geometry validated: ${extended.attempts.length} attempts; ` +
              `${extended.publication!.summary.vertexCount} vertices; ` +
              `coverage ${Number(extended.publication!.summary.coordinateCoverage).toPrecision(3)} ` +
              `of declared bounds; stop ${extended.stopReason}. Global claim withheld.` :
            `Extended geometry unavailable: ${extended.reason}; ` +
              `${extended.attempts.length} attempts. Global claim withheld.`}
        </p>}
        {extended?.status === "validated" && <button type="button"
          disabled={!onPromoteExtended} onClick={() => run(() => {
            onPromoteExtended?.(extended);
            setMessage("Validated extended local Mesh saved with bounded evidence.");
          })}>Save extended local Mesh</button>}
      </div>}
      {currentExtended.length >= 2 &&
        <div data-testid="gf58-atlas-controls">
          <p>Saved source-linked local patches · bounded domain and overlap ·
            1,000,000 evaluation cap. Global claim withheld.</p>
          <label>Atlas domain fraction <input type="number" min="0.1" max="1"
            step="any" value={atlasDomainFraction} onChange={event =>
              setAtlasDomainFraction(Number(event.target.value))} /></label>
          <label>Atlas overlap tolerance <input type="number" min="0.00001" max="0.25"
            step="any" value={atlasOverlapTolerance} onChange={event =>
              setAtlasOverlapTolerance(Number(event.target.value))} /></label>
          <button type="button" onClick={() => run(() => {
            const { pinned, studies } = replayExtended(currentExtended.slice(0, 2));
            const domain = pinned.source.axes.map(axis => {
              const center = (axis.min + axis.max) / 2;
              const half = (axis.max - axis.min) * atlasDomainFraction / 2;
              return [center - half, center + half];
            }) as unknown as
              import("@math3d/core").ManifoldAtlasRecipe["domain"];
            setAtlas(computeVectorField3DManifoldAtlas(project!, pinned, studies,
              { domain, overlapTolerance: atlasOverlapTolerance,
                maxEvaluations: 1_000_000 }));
          })}>Validate local patch atlas</button>
          {savedBaseAtlas && currentExtended.length >= 3 &&
            <button type="button" onClick={() => run(() => {
              const baseMembers = savedBaseAtlas.summary.memberResultIds as string[];
              const third = currentExtended.find(item => !baseMembers.includes(item.resultId));
              const results = [...baseMembers.map(id => currentExtended.find(item =>
                item.resultId === id)), third];
              if (results.some(item => !item))
                throw new TypeError("Saved atlas charts are missing.");
              const { pinned, studies } = replayExtended(results as AnalysisResultEnvelope[]);
              const recipe = savedBaseAtlas.provenance.operation.parameters.recipe as
                import("@math3d/core").ManifoldAtlasRecipe;
              setAtlas(computeVectorField3DManifoldAtlas(project!, pinned, studies,
                { ...recipe, baseAtlasResultId: savedBaseAtlas.resultId }));
            })}>Refine saved local atlas</button>}
          {atlas && <p role="status" data-testid="gf58-atlas-status">{
            atlas.status === "validated" ?
              `Local atlas validated: ${String(atlas.publication!.summary.overlapSamples)} ` +
                `overlap samples, ${String(atlas.publication!.summary.uncoveredCells)} ` +
                `uncovered grid cells, ${String(atlas.publication!.summary.transverseIntersectionPairs)} ` +
                `transverse intersections. Global claim withheld.` :
              `Atlas unavailable: ${atlas.reason}. Global claim withheld.`}</p>}
          {atlas?.status === "validated" && <button type="button"
            disabled={!onPromoteAtlas} onClick={() => run(() => {
              onPromoteAtlas?.(atlas);
              setMessage("Local patch atlas saved as a guarded Mesh.");
            })}>Save local atlas Mesh</button>}
        </div>}
      {savedBaseAtlas && savedRefinedAtlas && <button type="button"
        disabled={!onValidateAtlasCoverage} onClick={async () => {
          try {
            setMessage("");
            setSurfaceCoverage(await onValidateAtlasCoverage!(
              savedBaseAtlas.resultId, savedRefinedAtlas.resultId));
          } catch (cause) {
            setMessage(cause instanceof Error ? cause.message : String(cause));
          }
        }}>Verify saved atlas surface coverage</button>}
      {surfaceCoverage && <p role="status" data-testid="gf62-surface-coverage-status">
        {surfaceCoverage.status === "validated" ?
          `Saved surface coverage validated: ${String(surfaceCoverage.publication!.summary.gain16)} ` +
          `coarse and ${String(surfaceCoverage.publication!.summary.gain32)} fine ` +
          `triangle-covered cells gained; ${String((surfaceCoverage.publication!.summary.refined32 as { boundaryGapCells: number }).boundaryGapCells)} ` +
          `fine boundary gap cells. Global claim withheld.` :
          `Surface coverage unavailable: ${surfaceCoverage.reason}. Global claim withheld.`}
      </p>}
      {savedCoverage && <button type="button" disabled={!onValidateAtlasSeams}
        onClick={async () => {
          try { setMessage("");
            setSeamEvidence(await onValidateAtlasSeams!(savedCoverage.resultId)); }
          catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
        }}>Measure saved atlas seams in 3D</button>}
      {seamEvidence && <p role="status" data-testid="gf63-seam-status">
        {seamEvidence.status === "measured" ?
          `Saved 3D seam evidence: ${String((seamEvidence.publication!.summary.measurement as
            { hiddenGapEdges: number }).hiddenGapEdges)} hidden gap edges. ` +
          "Global claim withheld." : `Seams unavailable: ${seamEvidence.reason}.`}
      </p>}
      {savedSeams && <button type="button" disabled={!onValidateAtlasRefinement}
        onClick={async () => {
          try { setMessage("");
            setRefinementEvidence(await onValidateAtlasRefinement!(savedSeams.resultId)); }
          catch (cause) { setMessage(cause instanceof Error ? cause.message : String(cause)); }
        }}>Refine saved atlas charts</button>}
      {refinementEvidence && <p role="status" data-testid="gf64-refinement-status">
        {refinementEvidence.status === "measured" ?
          `Saved atlas refinement: ${String(refinementEvidence.publication!.summary.classification)}; ` +
          "global claim withheld." : `Refinement unavailable: ${refinementEvidence.reason}.`}
      </p>}
    </div>
    {!!message && <p role="status">{message}</p>}
    {saved.map(result => {
      const type = result.provenance.operation.type;
      const status = type === "vector3d.poincare-return-map" ?
        projectPoincareReturnStatus(project!, result) :
        type === "vector3d.lyapunov-finite-time" ?
          projectLyapunovStatus(project!, result) :
          type === "vector3d.manifold-continuation" ?
            projectManifoldContinuationStatus(project!, result) :
          type === "vector3d.extended-manifold" ?
            projectExtendedManifoldStatus(project!, result) :
          type === "vector3d.manifold-atlas" ?
            projectManifoldAtlasStatus(project!, result) :
          type === "vector3d.manifold-surface-coverage" ?
            projectManifoldSurfaceCoverageStatus(project!, result) :
          type === "vector3d.atlas-seams" ?
            projectAtlasSeamsStatus(project!, result) :
          type === "vector3d.atlas-refinement" ?
            projectAtlasRefinementStatus(project!, result) :
          projectLocalManifoldPatchStatus(project!, result);
      return <div key={result.resultId} data-testid="gf44-gf46-saved-result">
        {type} · {status.status === "current" ? "current" :
          `values withheld: ${status.reason}`}
        {type === "vector3d.poincare-return-map" &&
          <button type="button" disabled={status.status !== "current" ||
            !onOpenReturn} onClick={() => onOpenReturn?.(result)}>
            Open return map in Graphs</button>}
      </div>;
    })}
  </section>;
}
