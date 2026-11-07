import { useState } from "react";
import { affineSchemeRealLocusTarget, createAlgebraObjectRecord, createProjectAlgebraObjectId,
  schemeChartFacts, upsertMath3DProjectAlgebraObject,
  type AlgebraObjectRecord, type AlgebraObjectRef, type Math3DProject } from "@math3d/core";

type Props = { project: Math3DProject; record: AlgebraObjectRecord;
  onCreate: (record: AlgebraObjectRecord) => void | Promise<void>;
  onSelect: (ref: AlgebraObjectRef) => void };

export default function SageSchemeTools({ project, record, onCreate, onSelect }: Props) {
  const definition = record.definition;
  const projective = definition.kind === "projective-scheme" ? definition
    : definition.kind === "scheme-chart"
      ? project.algebraObjects?.find((entry) => entry.id === definition.projectiveScheme.objectId)
        ?.revisions[definition.projectiveScheme.revision - 1]?.definition : null;
  const ring = projective?.kind === "projective-scheme"
    ? project.algebraObjects?.find((entry) => entry.id === projective.ambientRing.objectId)
      ?.revisions[projective.ambientRing.revision - 1] : null;
  const variables = ring?.definition.kind === "polynomial-ring" ? ring.definition.variables : [];
  const [coordinate, setCoordinate] = useState(variables[variables.length - 1] ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const chartFacts = definition.kind === "scheme-chart"
    ? schemeChartFacts(project.algebraObjects ?? [], { objectId: record.id, revision: record.revision }) : null;
  const save = async (kind: "chart" | "map") => {
    setBusy(true); setMessage("");
    try {
      const candidate = kind === "chart" && definition.kind === "projective-scheme"
        ? { kind: "scheme-chart" as const, projectiveScheme: { objectId: record.id, revision: record.revision },
          nonzeroCoordinate: coordinate }
        : kind === "map" && definition.kind === "scheme-chart"
          ? { kind: "scheme-map" as const, mapKind: "chart-inclusion" as const,
            sourceChart: { objectId: record.id, revision: record.revision },
            targetProjective: definition.projectiveScheme } : null;
      if (!candidate) throw new TypeError("Select a projective scheme or one of its charts.");
      const label = kind === "chart" ? `${record.label} : ${coordinate} ≠ 0` : `${record.label} inclusion`;
      const created = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, crypto.randomUUID()),
        revision: 1, label, definition: candidate });
      upsertMath3DProjectAlgebraObject(project, created);
      await onCreate(created);
      onSelect({ objectId: created.id, revision: 1 });
    } catch (error) { setMessage(String((error as Error).message ?? error)); }
    finally { setBusy(false); }
  };
  if (definition.kind === "affine-scheme") return <section data-testid="cas-scheme-tools"
    style={{ display: "grid", gap: 6, fontSize: 12 }}>
    <strong>Affine scheme handoff</strong>
    <span>Scheme structure is the pinned quotient coordinate ring. A real-locus view is a separate bounded numerical request.</span>
    <button type="button" onClick={() => onSelect(affineSchemeRealLocusTarget(project,
      { objectId: record.id, revision: record.revision }))}>Open pinned ideal for real locus</button>
  </section>;
  if (definition.kind === "projective-scheme") return <section data-testid="cas-scheme-tools"
    style={{ display: "grid", gap: 6, fontSize: 12 }}>
    <strong>Affine chart D₊(xᵢ)</strong>
    <label>Nonzero coordinate <select aria-label="Nonzero chart coordinate" value={coordinate}
      onChange={(event) => setCoordinate(event.target.value)}>
      {variables.map((item) => <option key={item} value={item}>{item} ≠ 0</option>)}
    </select></label>
    <span>Chart equations substitute {coordinate}=1 in the pinned homogeneous ideal.</span>
    <button type="button" disabled={busy || !coordinate} onClick={() => { void save("chart"); }}>Save affine chart</button>
    {message && <div role="alert">{message}</div>}
  </section>;
  if (definition.kind === "scheme-chart" && chartFacts) return <section data-testid="cas-scheme-tools"
    style={{ display: "grid", gap: 6, fontSize: 12 }}>
    <strong>Canonical affine chart · {chartFacts.nonzeroCoordinate} ≠ 0</strong>
    <span>Affine coordinates: {chartFacts.affineCoordinates.join(", ")}</span>
    <span data-testid="cas-scheme-chart-equations">Exact dehomogenized equations: {chartFacts.equations.join("; ")}</span>
    <span>Projective coordinates: [{chartFacts.homogeneousImages.join(" : ")}]</span>
    <button type="button" disabled={busy} onClick={() => { void save("map"); }}>Save chart inclusion map</button>
    {message && <div role="alert">{message}</div>}
  </section>;
  if (definition.kind === "scheme-map") {
    const facts = schemeChartFacts(project.algebraObjects ?? [], definition.sourceChart);
    return <section data-testid="cas-scheme-tools" style={{ display: "grid", gap: 6, fontSize: 12 }}>
      <strong>Canonical open immersion</strong>
      <span>Source: chart {definition.sourceChart.objectId}@{definition.sourceChart.revision}</span>
      <span>Target: projective scheme {definition.targetProjective.objectId}@{definition.targetProjective.revision}</span>
      <span data-testid="cas-scheme-map-coordinates">Coordinate map: [{facts.homogeneousImages.join(" : ")}]</span>
      <span>Defined on the chart where {facts.nonzeroCoordinate} ≠ 0; no global affine map is asserted.</span>
    </section>;
  }
  return null;
}
