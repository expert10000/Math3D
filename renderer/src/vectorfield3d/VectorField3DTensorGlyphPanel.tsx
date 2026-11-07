import { useEffect, useState } from "react";
import { computeProjectTensorGlyphs, projectDerivedFieldsForDocument,
  projectTensorGlyphStatus,
  type Math3DProject, type TensorGlyphStudy, type VectorField3DDocument,
  type VerifiedVectorFieldTransfer } from "@math3d/core";
import { loadVerifiedVectorFieldTransfer } from "./loadVerifiedVectorFieldTransfer";

export function VectorField3DTensorGlyphPanel({ document, project, onSave }: {
  document: VectorField3DDocument; project?: Math3DProject | null;
  onSave?: (study: TensorGlyphStudy,
    transfers: ReadonlyMap<string, VerifiedVectorFieldTransfer>) => void;
}) {
  const fields = project ? projectDerivedFieldsForDocument(project, document.identity.id,
    source => source.source.field.kind === "expressions").map(item => item.document)
    .filter(item => item.output.kind === "tensor" &&
      ["scalar-hessian", "jacobian-symmetric"].includes(item.operation.kind)) : [];
  const [fieldId, setFieldId] = useState("");
  const [normalAxis, setNormalAxis] = useState<0 | 1 | 2>(2);
  const [coordinate, setCoordinate] = useState((document.source.axes[2].min +
    document.source.axes[2].max) / 2);
  const [density, setDensity] = useState(4);
  const [study, setStudy] = useState<TensorGlyphStudy | null>(null);
  const [transfers, setTransfers] = useState<ReadonlyMap<string, VerifiedVectorFieldTransfer>>(new Map());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStudy(null); setTransfers(new Map()); },
    [document.identity.id, document.identity.structuralHash]);
  const selected = fields.find(item => item.identity.id === fieldId);
  const saved = project?.workspace.results.filter(item =>
    item.provenance.operation.type === "vector3d.tensor-glyphs" &&
    item.provenance.source.documentId === document.identity.id) ?? [];
  const source = selected && (() => {
    let input = selected.input;
    while (input.kind === "derived") {
      const parent = project?.workspace.derivedFields?.find(item => item.identity.id === input.documentId);
      if (!parent) return null;
      input = parent.input;
    }
    const entry = project?.workspace.entries.find(item => item.module === "vector3d" &&
      item.expected.id === input.documentId);
    return entry?.checkpoint.format === "math3d.vector-field3d-document" ?
      entry.checkpoint : null;
  })();
  const verify = async () => {
    if (!source || source.source.field.kind !== "scientific-bundle") return;
    setBusy(true); setMessage("Verifying pinned tensor source…");
    try {
      const transfer = await loadVerifiedVectorFieldTransfer(source);
      setTransfers(new Map([[source.identity.id, transfer]]));
      setStudy(null); setMessage("Pinned source bytes verified. Compute glyphs explicitly.");
    } catch (error) {
      setTransfers(new Map()); setStudy(null);
      setMessage(`Tensor values withheld: ${error instanceof Error ? error.message : String(error)}`);
    } finally { setBusy(false); }
  };
  const compute = () => {
    try {
      if (!project || !selected) throw new TypeError("Choose a saved symmetric tensor recipe.");
      const next = computeProjectTensorGlyphs(project, {
        derivedFieldId: selected.identity.id, normalAxis, coordinate,
        density: [density, density] }, transfers);
      setStudy(next);
      setMessage(next.status === "ready" ? "Bounded tensor glyph preview is current." :
        `Tensor values withheld: ${next.reason}`);
    } catch (error) { setStudy(null); setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const varying = [0, 1, 2].filter(axis => axis !== normalAxis);
  const screen = (value: number, axis: number) => {
    const domain = document.source.axes[axis]!;
    return 16 + 288 * (value - domain.min) / (domain.max - domain.min);
  };
  return <section aria-label="Tensor field glyphs" data-gf06-section="layer"
    data-testid="gf47-tensor-glyphs">
    <h5>Principal tensor directions</h5>
    <p>Saved symmetric Hessian or Jacobian · at most 64 complete-coverage glyphs.
      A repeated or poorly conditioned principal eigenvalue withholds the preview.</p>
    <label>Tensor recipe <select value={fieldId} onChange={event => {
      setFieldId(event.target.value); setStudy(null); }}>
      <option value="">Choose a saved symmetric tensor</option>
      {fields.map(item => <option key={item.identity.id} value={item.identity.id}>
        {item.metadata.title} · {item.output.unit}</option>)}
    </select></label>
    <label>Slice normal <select value={normalAxis} onChange={event => {
      const axis = Number(event.target.value) as 0 | 1 | 2;
      setNormalAxis(axis); setCoordinate((document.source.axes[axis].min +
        document.source.axes[axis].max) / 2); setStudy(null); }}>
      {document.source.axes.map((axis, index) => <option key={index} value={index}>
        {axis.label}</option>)}
    </select></label>
    <label>Slice coordinate ({document.source.axes[normalAxis].unit})
      <input type="number" step="any" value={coordinate}
        onChange={event => { setCoordinate(Number(event.target.value)); setStudy(null); }} /></label>
    <label>Density per axis (2–8) <input type="number" min="2" max="8" value={density}
      onChange={event => { setDensity(Number(event.target.value)); setStudy(null); }} /></label>
    {source?.source.field.kind === "scientific-bundle" &&
      <button type="button" disabled={busy} onClick={() => void verify()}>
        Verify pinned tensor source</button>}
    <button type="button" disabled={!project || !selected || busy} onClick={compute}>
      Compute bounded tensor glyphs</button>
    {study?.status === "ready" && <>
      <p role="status" data-testid="gf47-glyph-status">{study.glyphs.length} principal directions;
        {" "}{study.evaluations} source evaluations; full coverage;
        {" "}{selected?.output.unit}. Direction signs are arbitrary.</p>
      <svg role="img" aria-label={`${study.glyphs.length} principal tensor directions on the physical slice`}
        viewBox="0 0 320 320" width="320" height="320" data-testid="gf47-glyph-preview">
        <rect x="16" y="16" width="288" height="288" fill="none" stroke="currentColor" />
        {study.glyphs.map((glyph, index) => {
          const x = screen(glyph.point[varying[0]!]!, varying[0]!);
          const y = 320 - screen(glyph.point[varying[1]!]!, varying[1]!);
          const dx = glyph.direction[varying[0]!]! * 10;
          const dy = glyph.direction[varying[1]!]! * 10;
          return <line key={index} x1={x - dx} y1={y + dy} x2={x + dx}
            y2={y - dy} stroke="currentColor" strokeWidth="2" />;
        })}
      </svg>
      <button type="button" disabled={!onSave} onClick={() => {
        try { onSave?.(study, transfers); setMessage("Tensor display recipe saved in Project."); }
        catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
      }}>Save tensor glyph recipe</button>
    </>}
    {message && <p role="status" data-testid="gf47-message">{message}</p>}
    {saved.map(result => {
      const status = projectTensorGlyphStatus(project!, result, transfers);
      return <p key={result.resultId} role="status" data-testid="gf47-saved-status">
        Saved tensor glyphs · {status.status === "current" ?
          `${result.summary.glyphCount} glyph recipe current; compute to display values` :
          `values withheld: ${status.reason}`}.
      </p>;
    })}
  </section>;
}
