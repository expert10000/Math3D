import { useState } from "react";
import { analyzeVectorField3DLocalTopology, promoteVectorField3DLocalSeparatrix,
  projectLocalSeparatrixStatus, type LocalSeparatrixPromotion, type Math3DProject,
  type VectorField3DDocument, type VectorField3DEquilibriumSearch } from "@math3d/core";

export function VectorField3DLocalTopologyPanel({ document, search, selectedIndex, project, onPromote }: {
  document: VectorField3DDocument; search: VectorField3DEquilibriumSearch | null;
  selectedIndex: number | null; project: Math3DProject | null | undefined;
  onPromote?: (promotion: LocalSeparatrixPromotion) => void;
}) {
  const [error, setError] = useState("");
  const index = selectedIndex ?? -1;
  const topology = search && index >= 0 ? analyzeVectorField3DLocalTopology(search, index) : null;
  const candidate = search?.candidates[index];
  const construction = document.workspace?.equilibriumConstructions.find(item => candidate &&
    item.position.every((value, axis) => Math.abs(value - candidate.position[axis]!) <= 1e-9) &&
    item.sourceStructuralHash === document.identity.structuralHash);
  const saved = project?.workspace.entries.find(item => item.module === "vector3d" &&
    item.expected.id === document.identity.id)?.checkpoint as VectorField3DDocument | undefined;
  const ready = !!construction && saved?.identity.revision === document.identity.revision &&
    saved.identity.structuralHash === document.identity.structuralHash;
  const curves = project?.workspace.entries.filter(item => item.module === "curve" &&
    item.checkpoint.format === "math3d.curve-document" &&
    item.checkpoint.source.definition.familyId === "vector3d.local-separatrix" &&
    item.checkpoint.source.definition.sourceIds?.includes(document.identity.id)) ?? [];
  return <section aria-label="Local topology and separatrices" data-testid="gf17-local-topology">
    <h5>Local topology and separatrices</h5>
    <p>Directions come from a well-conditioned equilibrium Jacobian. Stable branches integrate backward;
      unstable branches forward. Seeds start at ±1% of the shortest axis span.</p>
    {!topology && <p>Select an equilibrium from the bounded search.</p>}
    {topology && <>
      <p role="status">{topology.label}: {topology.status === "resolved" ?
        `condition estimate ${topology.conditionEstimate?.toPrecision(4)}` : topology.reason}.</p>
      {topology.directions.map(direction => <div key={direction.index}>
        <p>λ{direction.index + 1} = {direction.eigenvalue.toPrecision(5)};
          {" "}{direction.branch} eigendirection ({direction.vector.map(value =>
            value.toPrecision(4)).join(", ")}).</p>
        {([-1, 1] as const).map(side => <button key={side} type="button"
          disabled={!construction || !ready || !onPromote}
          onClick={() => {
            try {
              const promotion = promoteVectorField3DLocalSeparatrix(document, search!,
                construction!.id, direction.index, side);
              onPromote?.(promotion); setError("");
            } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
          }}>Save {direction.branch} {side === 1 ? "+" : "−"} Curve</button>)}
      </div>)}
      {!ready && <p>Save this equilibrium in the current Project source before promoting branches.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
    {curves.length > 0 && <details><summary>Saved local branches ({curves.length})</summary>
      <ul>{curves.map(item => {
        const status = projectLocalSeparatrixStatus(project!, item.checkpoint as
          import("@math3d/core").CurveDocument);
        return <li key={item.expected.id}>{(item.checkpoint as import("@math3d/core").CurveDocument).metadata.title}: {status.status === "current" ?
          "current" : `stale (${status.reason})`}</li>;
      })}</ul></details>}
  </section>;
}
