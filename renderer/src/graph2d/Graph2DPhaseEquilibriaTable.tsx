import { structuralHash, type Graph2DDocument, type Graph2DPhasePortraitArtifact,
} from "@math3d/core";
import { useEffect, useState } from "react";
import { downloadGraph2DResultJson } from "./downloadGraph2DResultJson";
import { downloadGraph2DResultsCsv } from "./downloadGraph2DResultsCsv";
import { Graph2DNumericalResultsTable, type Graph2DResultColumn,
  type Graph2DResultFilter } from "./Graph2DNumericalResultsTable";

type Equilibrium = Graph2DPhasePortraitArtifact["equilibria"][number];
const filters: readonly Graph2DResultFilter<Equilibrium>[] = [
  { id: "all", label: "All", include: () => true },
  { id: "stable", label: "Stable", include: item => item.linearization.stability === "stable" },
  { id: "unstable", label: "Unstable", include: item => item.linearization.stability === "unstable" },
  { id: "undetermined", label: "Undetermined", include: item => item.linearization.stability === "undetermined" },
];
const columns: readonly Graph2DResultColumn<Equilibrium>[] = [
  { id: "y", label: "y", render: item => item.y.toPrecision(6) },
  { id: "residual", label: "Residual", render: item => item.residual.toExponential(2) },
  { id: "stability", label: "Stability", render: item => item.linearization.stability },
  { id: "quality", label: "Quality", render: item => item.linearization.status === "classified" ? "Approximate" : "Unresolved" },
  { id: "linearization", label: "Linearization", render: item => <details data-testid="graph2d-phase-classification">
    <summary>Details</summary>
    <span>{item.linearization.kind.replaceAll("-", " ")} · {item.linearization.stability}</span>
    {item.linearization.jacobian && <p>J = [{item.linearization.jacobian.map(value => value.toPrecision(4)).join(", ")}]</p>}
    {item.linearization.eigenvalues && <p>λ = {item.linearization.eigenvalues.map(value =>
      value.imaginary === 0 ? value.real.toPrecision(4) :
        `${value.real.toPrecision(4)}${value.imaginary < 0 ? "−" : "+"}${Math.abs(value.imaginary).toPrecision(4)}i`).join(", ")}</p>}
    {item.linearization.reason && <p>{item.linearization.reason}</p>}
  </details> },
];

export function Graph2DPhaseEquilibriaTable({ artifact, document, objectId, onHighlight,
  readOnlyPreview = false }: Readonly<{
  artifact: Graph2DPhasePortraitArtifact;
  document: Graph2DDocument;
  objectId: string;
  onHighlight?: (point: Equilibrium) => void;
  readOnlyPreview?: boolean;
}>) {
  const resultKey = structuralHash({ source: document.identity.structuralHash, objectId,
    viewport: document.display.viewport, equilibria: artifact.equilibria, analysis: artifact.analysis });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  useEffect(() => setFocusedId(null), [resultKey]);
  const exportCsv = () => downloadGraph2DResultsCsv(`graph-equilibria-${objectId}.csv`,
    ["x", "y", "residual", "kind", "stability", "classification_status", "scan_status",
      "source_document", "source_revision", "viewport_x_min", "viewport_x_max", "viewport_y_min", "viewport_y_max"],
    artifact.equilibria.map(item => [item.x, item.y, item.residual, item.linearization.kind,
      item.linearization.stability, item.linearization.status, artifact.analysis.status,
      document.identity.id, document.identity.revision, document.display.viewport.xMin,
      document.display.viewport.xMax, document.display.viewport.yMin, document.display.viewport.yMax]));
  return <div data-testid="graph2d-phase-equilibria-table">
    <p role="status"><strong>{readOnlyPreview ? "Transient equilibria preview" :
      artifact.analysis.status === "complete" ? "Approximate equilibria" :
      artifact.analysis.status === "partial" ? "Incomplete equilibrium scan" : "Equilibria unavailable"}</strong>
      {" "}· {artifact.equilibria.length} resolved · {artifact.analysis.unresolved} unresolved cells</p>
    <dl className="graph2d-critical-summary">
      <div><dt>Stable</dt><dd>{artifact.equilibria.filter(item => item.linearization.stability === "stable").length}</dd></div>
      <div><dt>Unstable</dt><dd>{artifact.equilibria.filter(item => item.linearization.stability === "unstable").length}</dd></div>
      <div><dt>Undetermined</dt><dd>{artifact.equilibria.filter(item => item.linearization.stability === "undetermined").length}</dd></div>
    </dl>
    <Graph2DNumericalResultsTable resultKey={resultKey} tableLabel="Phase equilibrium numerical results"
      controlsLabel="Filter equilibrium results" searchLabel="Search equilibrium results"
      sortLabel="Sort equilibria by x" items={artifact.equilibria} filters={filters} columns={columns}
      getId={item => `${item.x}:${item.y}`} getX={item => item.x}
      getKind={item => item.linearization.kind.replaceAll("-", " ")}
      getSearchText={item => `${item.x} ${item.y} ${item.residual} ${item.linearization.kind} ${item.linearization.stability} ${item.linearization.status}`}
      onFocus={item => { setFocusedId(`${item.x}:${item.y}`); onHighlight?.(item); }}
      canFocus={() => !readOnlyPreview && !!onHighlight}
      isActive={item => focusedId === `${item.x}:${item.y}`}
      exportCsv={readOnlyPreview ? undefined : exportCsv}
      exportJson={readOnlyPreview ? undefined : () => downloadGraph2DResultJson(`graph-equilibria-${objectId}.json`, {
        format: "math3d.graph2d-equilibria.v1", resultKey, source: document.identity,
        objectId, viewport: document.display.viewport, analysis: artifact.analysis,
        equilibria: artifact.equilibria })}
      emptyText="None resolved at sampled grid resolution." />
    <small>Equilibria are viewport sampled numerical candidates. Construction saving is unavailable until a source-linked revalidation rule exists.</small>
  </div>;
}
