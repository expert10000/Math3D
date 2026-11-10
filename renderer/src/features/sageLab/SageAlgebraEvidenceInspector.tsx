import type { AlgebraEvidenceInspectorModel, InspectorFact } from "./algebraEvidenceInspectorModel";
import { ResultPublicationActions } from "../../results/ResultPublicationActions";
import type { ResultPublication } from "../../results/resultPublication";

type Section = "result" | "structure" | "verification" | "execution";
const matrixValue = (value: InspectorFact["value"]): value is readonly (readonly string[])[] =>
  Array.isArray(value) && value.length > 0 && Array.isArray(value[0]);
const listValue = (value: InspectorFact["value"]): value is readonly string[] => Array.isArray(value);
const Facts = ({ items }: { items: readonly InspectorFact[] }) => <dl className="sage-structure-facts">
  {items.map((item) => <div key={item.label} style={{ display: "contents" }}>
    <dt>{item.label}</dt><dd>{matrixValue(item.value) ? <div className="sage-evidence-matrix-wrap"><table className="sage-evidence-matrix"
      aria-label={item.label}><tbody>{item.value.map((row, index) => <tr key={index}>{row.map((cell, column) =>
        <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>
      : listValue(item.value) ? item.value.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>
        {item.value.map((value, index) => <li key={index}>{value}</li>)}</ul> : "None"
        : item.value}</dd>
  </div>)}
</dl>;

export default function SageAlgebraEvidenceInspector({ model, section, onExport, publication }: {
  model: AlgebraEvidenceInspectorModel; section: Section;
  onExport?: (format: "json" | "csv") => void; publication?: ResultPublication<unknown> }) {
  return <div data-testid={`cas-evidence-${section}`} className="sage-evidence-inspector"
    data-qualification={model.qualification.status}>
    <div style={{ fontSize: 11, color: "#64748b" }}>Saved object-linked Sage evidence</div>
    <h3 style={{ margin: "4px 0 10px", fontSize: 15 }}>{model.title}</h3>
    <p role="status" data-testid={`cas-evidence-${section}-qualification`}>
      <strong>Source: {model.qualification.status}</strong> · {model.qualification.reason}
    </p>
    {section === "result" && <>
      <p><strong>Recorded claim:</strong> Sage output for the pinned operation and object revision.</p>
      <p><strong>Independent check:</strong> {model.mode === "CHECKED" ?
        "Operation-specific exact checks are listed under Verification; this is not a blanket proof." :
        model.mode === "COMPUTED" ?
          "Saved output integrity is checked; mathematical verification is limited to the checks listed under Verification." :
          "A saved evidence check failed; result values are withheld when integrity fails."}</p>
      {model.qualification.canUseResult && onExport && publication &&
        <ResultPublicationActions publication={publication} onExport={onExport}
          jsonLabel="Export evidence JSON" csvLabel="Export evidence CSV" />}
      {model.qualification.canUseResult && onExport && !publication &&
        <button type="button" onClick={() => onExport("json")}>Export evidence JSON</button>}
    </>}
    {section === "verification" ? <>
      <div data-testid="cas-evidence-verification-mode" className={`sage-evidence-mode sage-evidence-mode-${model.mode.toLowerCase()}`}>
        {model.mode}</div>
      <ul className="sage-evidence-checks">{model.checks.map((item) => <li key={item.label}>
        <strong>{item.label}</strong> <span>{item.status}</span><div>{item.detail}</div>
      </li>)}</ul>
    </> : section === "result" && !model.qualification.canUseResult ?
      <p role="alert">Result values withheld: {model.qualification.reason}</p> :
      <Facts items={model[section]} />}
  </div>;
}
