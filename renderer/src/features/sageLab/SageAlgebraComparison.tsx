import { useEffect, useState } from "react";
import { ALGEBRA_OPERATION_REGISTRY, type Math3DProject, type ProjectAlgebraEvidence } from "@math3d/core";
import { compareAlgebraEvidence, type AlgebraComparisonSide } from "./algebraEvidenceComparisonModel";

type Props = { project: Math3DProject | null; selectedEvidenceId: string | null;
  onInspectEvidence: (id: string) => void };
const title = (item: ProjectAlgebraEvidence) => ALGEBRA_OPERATION_REGISTRY.find((operation) =>
  operation.id === item.request.operation)?.label ?? item.request.operation;
const Side = ({ side, caption, onInspect }: { side: AlgebraComparisonSide; caption: string;
  onInspect: () => void }) => <div style={{ border: "1px solid #dbe2ea", borderRadius: 8, padding: 10, minWidth: 0 }}>
    <strong>{caption}: {side.target}</strong>
    <dl className="sage-structure-facts">
      <dt>Operation</dt><dd>{side.operation}</dd>
      <dt>Domain</dt><dd>{side.domain}</dd>
      <dt>Route</dt><dd>{side.backend}</dd>
      <dt>Sage version</dt><dd>{side.sageVersion}</dd>
      <dt>Result hash</dt><dd style={{ overflowWrap: "anywhere" }}>{side.resultHash}</dd>
      <dt>Certificate scope</dt><dd>{side.certificate}</dd>
      <dt>Inspector verification</dt><dd>{side.verification}</dd>
      {side.facts.map((fact) => <div key={fact.label} style={{ display: "contents" }}>
        <dt>{fact.label}</dt><dd style={{ overflowWrap: "anywhere" }}>{fact.value}</dd></div>)}
    </dl>
    <button type="button" onClick={onInspect}>Inspect {caption.toLowerCase()} evidence</button>
  </div>;

export default function SageAlgebraComparison({ project, selectedEvidenceId, onInspectEvidence }: Props) {
  const evidence = project?.algebraEvidence ?? [];
  const [leftId, setLeftId] = useState(selectedEvidenceId ?? evidence[0]?.id ?? "");
  const [rightId, setRightId] = useState(evidence.find((item) => item.id !== leftId)?.id ?? "");
  useEffect(() => { if (selectedEvidenceId) setLeftId(selectedEvidenceId); }, [selectedEvidenceId]);
  const left = evidence.find((item) => item.id === leftId) ?? evidence[0];
  const right = evidence.find((item) => item.id === rightId && item.id !== left?.id)
    ?? evidence.find((item) => item.id !== left?.id);
  const comparison = project && left && right ? compareAlgebraEvidence(project, left, right) : null;
  const option = (item: ProjectAlgebraEvidence) => <option key={item.id} value={item.id}>
    {title(item)} · {item.runtime.backend} · Sage {item.runtime.version} · {item.id.slice(-8)}</option>;
  return <section data-testid="cas-algebra-comparison" style={{ display: "grid", gap: 10, fontSize: 12 }}>
    <h3 style={{ margin: 0 }}>Compare saved algebra evidence</h3>
    <p style={{ margin: 0 }}>Choose two pinned results. Comparisons use typed invariants and each result's verification scope.</p>
    {evidence.length < 2 ? <div role="status">Save at least two algebra results in this Project to compare them.</div> : <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <label style={{ flex: "1 1 260px" }}>Left evidence<select aria-label="Left comparison evidence" value={left?.id ?? ""}
          onChange={(event) => { setLeftId(event.target.value);
            if (event.target.value === rightId) setRightId(evidence.find((item) => item.id !== event.target.value)?.id ?? ""); }}
          style={{ display: "block", width: "100%" }}>{evidence.map(option)}</select></label>
        <label style={{ flex: "1 1 260px" }}>Right evidence<select aria-label="Right comparison evidence" value={right?.id ?? ""}
          onChange={(event) => setRightId(event.target.value)} style={{ display: "block", width: "100%" }}>
          {evidence.filter((item) => item.id !== left?.id).map(option)}</select></label>
      </div>
      {comparison && <>
        <div data-testid="cas-comparison-verdict" role="status" style={{ border: "1px solid #b9cce3",
          borderRadius: 8, padding: 9 }}>
          <strong>{comparison.kind === "backend" ? "Backend comparison" : comparison.kind === "domain"
            ? "Domain comparison" : "Incompatible pair"} · {comparison.verdict}</strong>
          <div>{comparison.explanation}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 10 }}>
          <Side side={comparison.left} caption="Left" onInspect={() => onInspectEvidence(comparison.left.evidenceId)} />
          <Side side={comparison.right} caption="Right" onInspect={() => onInspectEvidence(comparison.right.evidenceId)} />
        </div>
        {comparison.checks.length > 0 && <div data-testid="cas-comparison-checks">
          <strong>Comparison checks and limits</strong><ul>{comparison.checks.map((check) => <li key={check}>{check}</li>)}</ul>
        </div>}
      </>}
    </>}
  </section>;
}
