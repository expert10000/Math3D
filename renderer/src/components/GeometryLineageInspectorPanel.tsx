import React from "react";
import type {
  GeometryCanonicalMetadata,
  GeometryLineageEdgeKind,
  GeometryRevisionCause,
} from "../geometry/metadataLineage";

export type GeometryLineageInspectorEdge = {
  id: string;
  label: string;
  relation: string;
  kind: GeometryLineageEdgeKind;
};

export type GeometryLineageInspectorAction = {
  id: "open-parent" | "open-source" | "show-dependencies" | "show-dependents" | "recompute" | "freeze" | "detach";
  label: string;
  enabled: boolean;
  explanation: string;
  onClick: () => void;
};

type GeometryLineageInspectorPanelProps = {
  label: string;
  nodeKind: string;
  status: string;
  metadata: GeometryCanonicalMetadata;
  revisionCause: GeometryRevisionCause | null;
  staleReason: string | null;
  inputs: readonly GeometryLineageInspectorEdge[];
  outputs: readonly GeometryLineageInspectorEdge[];
  actions: readonly GeometryLineageInspectorAction[];
};

const metadataRows = (metadata: GeometryCanonicalMetadata): Array<[string, string]> => [
  ["Schema", metadata.schema],
  ["Revision", String(metadata.revision)],
  ["Source revision", metadata.sourceRevision == null ? "n/a" : String(metadata.sourceRevision)],
  ["Representation", metadata.representation],
  ["Source", metadata.sourceKind],
  ["Operation", metadata.operation],
  ["Primitive / kind", metadata.primitiveType],
  ["Parameterization", metadata.parameterization],
  ["Degree", metadata.degree == null ? "n/a" : String(metadata.degree)],
  ["Knots", metadata.knots ?? "n/a"],
  ["Control count", metadata.controlCount == null ? "n/a" : String(metadata.controlCount)],
  ["Trim", metadata.trimState],
  ["Closed / periodic", `${metadata.closed == null ? "n/a" : metadata.closed ? "yes" : "no"} / ${metadata.periodic == null ? "n/a" : metadata.periodic ? "yes" : "no"}`],
  ["Orientation", metadata.orientation],
  ["Bounds", metadata.bounds],
  ["Units", metadata.units],
  ["Precision", metadata.precision],
];

const EdgeList = ({ title, edges }: { title: string; edges: readonly GeometryLineageInspectorEdge[] }) => (
  <div style={{ display: "grid", gap: 3 }}>
    <strong style={{ fontSize: 10.5 }}>{title}</strong>
    {edges.length ? edges.map((edge) => (
      <div key={`${title}-${edge.id}-${edge.relation}`} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 5, alignItems: "baseline" }}>
        <span style={{ border: "1px solid #cbd5e1", borderRadius: 999, padding: "1px 5px", color: "#475569", fontSize: 8, fontWeight: 800 }}>
          {edge.kind.replaceAll("-", " ")}
        </span>
        <span style={{ color: "#334155", fontSize: 9.5 }}>{edge.relation}: {edge.label}</span>
      </div>
    )) : <span style={{ color: "#64748b", fontSize: 9.5 }}>None</span>}
  </div>
);

export const GeometryLineageInspectorPanel: React.FC<GeometryLineageInspectorPanelProps> = ({
  label,
  nodeKind,
  status,
  metadata,
  revisionCause,
  staleReason,
  inputs,
  outputs,
  actions,
}) => (
  <section
    data-testid="geometry-lineage-inspector"
    style={{ border: "1px solid #93c5fd", borderRadius: 8, padding: 8, background: "#eff6ff", display: "grid", gap: 7 }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 900, color: "#1e3a8a" }}>Metadata & lineage</div>
        <div style={{ fontSize: 10, color: "#334155" }}>{label} · {nodeKind}</div>
      </div>
      <span data-testid="geometry-lineage-status" style={{ fontSize: 8.5, fontWeight: 900, textTransform: "uppercase" }}>{status}</span>
    </div>
    <div data-testid="geometry-lineage-actions" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          data-testid={`geometry-lineage-action-${action.id}`}
          disabled={!action.enabled}
          title={action.explanation}
          onClick={action.onClick}
          style={{ fontSize: 9.5, padding: "3px 6px" }}
        >
          {action.label}
        </button>
      ))}
    </div>
    <div
      data-testid="geometry-canonical-metadata"
      style={{ display: "grid", gridTemplateColumns: "94px minmax(0, 1fr)", gap: "3px 7px", fontSize: 9.5 }}
    >
      {metadataRows(metadata).map(([name, value]) => (
        <React.Fragment key={name}>
          <span style={{ color: "#64748b" }}>{name}</span>
          <span style={{ color: "#0f172a", overflowWrap: "anywhere" }}>{value}</span>
        </React.Fragment>
      ))}
    </div>
    {(revisionCause || staleReason) && (
      <div data-testid="geometry-lineage-stale-reason" style={{ borderTop: "1px solid #bfdbfe", paddingTop: 5, fontSize: 9.5, color: staleReason ? "#9a3412" : "#475569" }}>
        <strong>{staleReason ? "Stale reason" : "Latest revision cause"}:</strong> {staleReason ?? revisionCause}
      </div>
    )}
    <div style={{ borderTop: "1px solid #bfdbfe", paddingTop: 5, display: "grid", gap: 6 }}>
      <EdgeList title="Sources / inputs" edges={inputs} />
      <EdgeList title="Dependents / outputs" edges={outputs} />
    </div>
  </section>
);
