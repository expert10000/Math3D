import { useState, type FormEvent } from "react";
import { algebraicLocusGeometryDocument, buildSageAlgebraicLocusScene, canonicalJsonStringify,
  type AlgebraObjectRef, type Math3DProject, type SageAlgebraicLocusScene } from "@math3d/core";

type Props = { project: Math3DProject; target: AlgebraObjectRef;
  onSave: (scene: SageAlgebraicLocusScene) => void | Promise<void> };
const axisNames = ["x", "y", "z"];
const download = (name: string, body: string) => {
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function SageAlgebraicLocusBuilder({ project, target, onSave }: Props) {
  const record = project.algebraObjects?.find((entry) => entry.id === target.objectId)?.revisions[target.revision - 1];
  const ambient = record?.definition.kind === "ideal"
    ? project.algebraObjects?.find((entry) => entry.id === record.definition.ambientRing.objectId)
      ?.revisions[record.definition.ambientRing.revision - 1]
    : record?.definition.kind === "polynomial-ring" ? record : null;
  const variables = ambient?.definition.kind === "polynomial-ring" ? ambient.definition.variables : [];
  const [polynomial, setPolynomial] = useState(() => `${variables.map((variable) => `${variable}^2`).join("+")}-1`);
  const [bounds, setBounds] = useState([{ min: "-2", max: "2" }, { min: "-2", max: "2" },
    { min: "-2", max: "2" }]);
  const [tolerance, setTolerance] = useState("0.001");
  const [maxSamples, setMaxSamples] = useState("50000");
  const [preview, setPreview] = useState<{ signature: string; scene: SageAlgebraicLocusScene } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const signature = JSON.stringify({ target, polynomial, bounds: bounds.slice(0, variables.length), tolerance, maxSamples });
  const scene = preview?.signature === signature ? preview.scene : null;
  const prepare = (event: FormEvent) => {
    event.preventDefault(); setMessage(""); setPreview(null);
    try {
      const prepared = buildSageAlgebraicLocusScene(project, target, {
        ...(record?.definition.kind === "polynomial-ring" ? { polynomial } : {}),
        bounds: bounds.slice(0, variables.length).map((item) => ({ min: Number(item.min), max: Number(item.max) })),
        tolerance: Number(tolerance), maxSamples: Number(maxSamples) });
      setPreview({ signature, scene: prepared });
    } catch (error) { setMessage(String((error as Error).message ?? error)); }
  };
  const save = async () => {
    if (!scene || busy) return;
    setBusy(true); setMessage("");
    try { await onSave(scene); setMessage("Saved uncomputed real-locus Geometry contract to Project."); }
    catch (error) { setMessage(String((error as Error).message ?? error)); }
    finally { setBusy(false); }
  };
  if (!record || (record.definition.kind !== "ideal" && record.definition.kind !== "polynomial-ring")) return null;
  return <section data-testid="cas-locus-builder" style={{ display: "grid", gap: 8,
    border: "1px solid #c7d9ed", borderRadius: 8, padding: 10, maxWidth: 720 }}>
    <strong>Real-locus scene contract</strong>
    <div style={{ fontSize: 12 }}>Keep exact equations and source revisions in a Geometry document.
      Sampling and visible curves or surfaces arrive in F02.</div>
    <form onSubmit={prepare} className="sage-structure-grid">
      {record.definition.kind === "polynomial-ring" && <label style={{ gridColumn: "1 / -1" }}>
        Polynomial equation = 0<input aria-label="Locus polynomial" value={polynomial}
          onChange={(event) => setPolynomial(event.target.value)} maxLength={256} required /></label>}
      {variables.map((variable, index) => <div key={variable} style={{ display: "flex", gap: 6 }}>
        <label>{axisNames[index]} axis ({variable}) min<input aria-label={`${variable} bound min`} type="number" step="any"
          value={bounds[index].min} onChange={(event) => setBounds((current) => current.map((item, at) =>
            at === index ? { ...item, min: event.target.value } : item))} required /></label>
        <label>max<input aria-label={`${variable} bound max`} type="number" step="any"
          value={bounds[index].max} onChange={(event) => setBounds((current) => current.map((item, at) =>
            at === index ? { ...item, max: event.target.value } : item))} required /></label>
      </div>)}
      <label>Tolerance<input aria-label="Locus tolerance" type="number" step="any" min="0.000001" max="0.1"
        value={tolerance} onChange={(event) => setTolerance(event.target.value)} required /></label>
      <label>Sample cap<input aria-label="Locus sample cap" type="number" step="1" min="1000" max="200000"
        value={maxSamples} onChange={(event) => setMaxSamples(event.target.value)} required /></label>
      <button type="submit" disabled={busy}>Validate & preview locus</button>
    </form>
    {message && <div role={message.startsWith("Saved") ? "status" : "alert"}>{message}</div>}
    {scene && <div data-testid="cas-locus-preview" style={{ display: "grid", gap: 5,
      borderTop: "1px solid #dbe2ea", paddingTop: 8, fontSize: 12 }}>
      <div><strong>Exact source:</strong> {scene.source.target.label}@{scene.source.target.revision} · {scene.source.target.contentHash}</div>
      <div><strong>Equations:</strong> {scene.source.equations.map((item) => `${item}=0`).join("; ")}</div>
      <div><strong>Domain:</strong> real Cartesian · {scene.domain.bounds.map((item) =>
        `${item.axis}(${item.variable})∈[${item.min}, ${item.max}]`).join(" · ")}</div>
      <div><strong>Precision:</strong> tolerance {scene.precision.tolerance}; sample cap {scene.precision.maxSamples}</div>
      <div><strong>Rendering:</strong> uncomputed · completeness unknown</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" disabled={busy} onClick={() => { void save(); }}>Save Geometry contract to Project</button>
        <button type="button" onClick={() => download(`math3d-locus-${scene.source.target.revision}.json`,
          canonicalJsonStringify(scene))}>Export scene JSON</button>
        <button type="button" onClick={() => download(`math3d-locus-geometry-${scene.source.target.revision}.json`,
          canonicalJsonStringify(algebraicLocusGeometryDocument(scene)))}>Export Geometry JSON</button>
      </div>
    </div>}
  </section>;
}
