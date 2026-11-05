import { useState } from "react";
import { projectDerivedFieldsForDocument, type DerivedFieldOperation,
  type Math3DProject, type VectorField3DDocument } from "@math3d/core";

const operations = ["vector-magnitude", "scalar-gradient", "scalar-hessian",
  "directional-derivative", "vector-jacobian", "jacobian-symmetric",
  "jacobian-antisymmetric", "vector-dot", "vector-cross", "vector-difference",
  "vorticity", "helicity", "enstrophy", "q-criterion", "lambda2",
  "swirling-strength"] as const;

export function VectorField3DDerivedOperationsPanel({ document, project, onAppend }: {
  document: VectorField3DDocument; project?: Math3DProject | null;
  onAppend?: (inputId: string, operation: DerivedFieldOperation,
    options: { stableKey: string; title: string; secondaryInputId?: string }) => void }) {
  const [inputId, setInputId] = useState<string>(document.identity.id);
  const [secondaryId, setSecondaryId] = useState<string>(document.identity.id);
  const [kind, setKind] = useState<typeof operations[number]>("vector-magnitude");
  const [direction, setDirection] = useState("1, 0, 0");
  const [message, setMessage] = useState("");
  const fields = project ? projectDerivedFieldsForDocument(project, document.identity.id,
    source => source.source.field.kind === "expressions") : [];
  const binary = kind === "vector-dot" || kind === "vector-cross" ||
    kind === "vector-difference";
  const save = () => { try {
    if (!project || !onAppend) throw new TypeError("Open a saved Project first.");
    let operation: DerivedFieldOperation;
    if (kind === "directional-derivative") {
      const values = direction.split(/[\s,]+/).map(Number);
      if (values.length !== 3 || values.some(value => !Number.isFinite(value)))
        throw new TypeError("Direction needs three finite components.");
      operation = { kind, direction: values as [number, number, number] };
    } else operation = { kind };
    onAppend(inputId, operation, { stableKey: crypto.randomUUID(),
      title: kind.replaceAll("-", " "), ...(binary ? { secondaryInputId: secondaryId } : {}) });
    setMessage(`${kind} saved. Save the Project to retain its recipe.`);
  } catch (cause) { setMessage(String((cause as Error).message ?? cause)); } };
  return <section aria-label="Derived field operations" data-testid="gf16-derived-operations">
    <h5>Derived field operations</h5>
    <label>Input <select value={inputId} onChange={event => setInputId(event.target.value)}>
      <option value={document.identity.id}>{document.metadata.title} · vector</option>
      {fields.map(item => <option key={item.document.identity.id}
        value={item.document.identity.id}>{item.document.metadata.title} · {
          item.document.output.kind} · {item.status}</option>)}
    </select></label>
    <label>Operation <select value={kind} onChange={event =>
      setKind(event.target.value as typeof kind)}>
      {operations.map(item => <option key={item} value={item}>{item.replaceAll("-", " ")}</option>)}
    </select></label>
    {kind === "directional-derivative" && <label>Unit direction (x, y, z)
      <input value={direction} onChange={event => setDirection(event.target.value)} /></label>}
    {binary && <label>Second vector input <select value={secondaryId}
      onChange={event => setSecondaryId(event.target.value)}>
      <option value={document.identity.id}>{document.metadata.title} · vector</option>
      {fields.filter(item => item.document.output.kind === "vector").map(item =>
        <option key={item.document.identity.id} value={item.document.identity.id}>
          {item.document.metadata.title} · {item.status}</option>)}
    </select></label>}
    <button type="button" disabled={!project || !onAppend} onClick={save}>Save derived operation</button>
    {fields.map(item => <p key={item.document.identity.id} role="status">
      {item.document.metadata.title}: {item.document.output.kind}, {item.document.output.unit}; {
        item.status}.</p>)}
    {message && <p role="status">{message}</p>}
  </section>;
}
