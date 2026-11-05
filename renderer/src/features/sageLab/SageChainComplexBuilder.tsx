import { useState, type FormEvent } from "react";
import { chainComplexLabel, createAlgebraObjectRecord, createProjectAlgebraObjectId,
  inspectProjectAlgebraFreshness, upsertMath3DProjectAlgebraObject,
  type AlgebraObjectRecord, type AlgebraObjectRef, type ChainComplexDefinition,
  type Math3DProject } from "@math3d/core";

type Props = { project: Math3DProject; onCreate: (record: AlgebraObjectRecord) => void | Promise<void>;
  onCreated: (ref: AlgebraObjectRef) => void; onCancel: () => void };
const ref = (record: AlgebraObjectRecord): AlgebraObjectRef => ({ objectId: record.id, revision: record.revision });

export default function SageChainComplexBuilder({ project, onCreate, onCreated, onCancel }: Props) {
  const [label, setLabel] = useState("C");
  const [d1Id, setD1Id] = useState("");
  const [d2Id, setD2Id] = useState("");
  const [preview, setPreview] = useState<{ signature: string; record: AlgebraObjectRecord } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fresh = inspectProjectAlgebraFreshness(project);
  const records = (project.algebraObjects ?? []).filter((entry) => !entry.archived &&
    fresh.find((item) => item.objectId === entry.id)?.status === "fresh").map((entry) => entry.revisions.at(-1)!);
  const byRef = (value: AlgebraObjectRef) => records.find((record) => record.id === value.objectId &&
    record.revision === value.revision);
  const maps = records.filter((record) => record.definition.kind === "module-map" && (() => {
    const source = byRef(record.definition.sourceModule);
    const ring = source?.definition.kind === "module" ? byRef(source.definition.baseRing) : null;
    return ring?.definition.kind === "integer-ring";
  })());
  const d1Options = maps.filter((candidate) => candidate.definition.kind === "module-map" &&
    maps.some((next) => next.definition.kind === "module-map" &&
      next.definition.targetModule.objectId === candidate.definition.sourceModule.objectId &&
      next.definition.targetModule.revision === candidate.definition.sourceModule.revision));
  const d1 = d1Options.find((record) => record.id === d1Id) ?? d1Options[0];
  const c1 = d1?.definition.kind === "module-map" ? byRef(d1.definition.sourceModule) : null;
  const c0 = d1?.definition.kind === "module-map" ? byRef(d1.definition.targetModule) : null;
  const d2Options = maps.filter((record) => record.definition.kind === "module-map" && c1 &&
    record.definition.targetModule.objectId === c1.id && record.definition.targetModule.revision === c1.revision);
  const d2 = d2Options.find((record) => record.id === d2Id) ?? d2Options[0];
  const c2 = d2?.definition.kind === "module-map" ? byRef(d2.definition.sourceModule) : null;
  const ring = c0?.definition.kind === "module" ? byRef(c0.definition.baseRing) : null;
  const signature = JSON.stringify([label, d1?.id, d1?.revision, d2?.id, d2?.revision,
    c0?.id, c1?.id, c2?.id, project.identity.revision]);
  const current = preview?.signature === signature ? preview.record : null;
  const validate = (event: FormEvent) => {
    event.preventDefault(); setError(""); setPreview(null);
    try {
      const name = label.trim();
      if (!name || name.length > 120 || records.some((record) => record.label.toLowerCase() === name.toLowerCase()))
        throw new TypeError("Choose a unique chain-complex name of 1–120 characters.");
      if (!d1 || !d2 || !c0 || !c1 || !c2 || !ring)
        throw new TypeError("Create free ZZ modules and composable d1, d2 maps first.");
      const definition: ChainComplexDefinition = { kind: "chain-complex", coefficientRing: ref(ring),
        modules: [ref(c0), ref(c1), ref(c2)], boundaries: [ref(d1), ref(d2)] };
      const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, crypto.randomUUID()),
        revision: 1, label: name, definition });
      upsertMath3DProjectAlgebraObject(project, record);
      setPreview({ signature, record });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const save = async () => {
    if (!current || busy) return;
    setBusy(true); setError("");
    try { await onCreate(current); onCreated(ref(current)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <section data-testid="cas-chain-builder" style={{ display: "grid", gap: 10, maxWidth: 680 }}>
    <h2 style={{ margin: 0 }}>New ZZ chain complex</h2>
    <div style={{ fontSize: 12 }}>Choose saved free modules through their pinned boundary maps C₂ → C₁ → C₀.
      The exact product d₁d₂ must be zero before this Project object can be saved.</div>
    <form onSubmit={validate} className="sage-structure-grid">
      <label>Name<input aria-label="Chain complex name" value={label}
        onChange={(event) => setLabel(event.target.value)} maxLength={120} required /></label>
      <label>Boundary d₁: C₁ → C₀<select aria-label="Boundary d1" value={d1?.id ?? ""}
        onChange={(event) => { setD1Id(event.target.value); setD2Id(""); setPreview(null); }} required>
        {d1Options.length ? d1Options.map((record) => <option key={record.id} value={record.id}>{record.label}@{record.revision}</option>)
          : <option value="">Create composable ZZ maps first</option>}</select></label>
      <label>Boundary d₂: C₂ → C₁<select aria-label="Boundary d2" value={d2?.id ?? ""}
        onChange={(event) => { setD2Id(event.target.value); setPreview(null); }} required>
        {d2Options.length ? d2Options.map((record) => <option key={record.id} value={record.id}>{record.label}@{record.revision}</option>)
          : <option value="">Create a map into C₁ first</option>}</select></label>
      <div style={{ display: "flex", gap: 8 }}><button type="submit" disabled={busy || !d1 || !d2}>Validate & preview</button>
        <button type="button" onClick={onCancel}>Cancel</button></div>
    </form>
    {error && <div role="alert">{error}</div>}
    {current?.definition.kind === "chain-complex" && <section data-testid="cas-chain-preview"
      style={{ border: "1px solid #dbe2ea", borderRadius: 8, padding: 10 }}>
      <strong>{current.label}@1</strong>
      <div>{chainComplexLabel(current.definition, project.algebraObjects ?? [])}</div>
      <div>Boundary maps: {d2?.label}@{d2?.revision} then {d1?.label}@{d1?.revision}</div>
      <button type="button" disabled={busy} onClick={() => { void save(); }}>Save to Project</button>
    </section>}
  </section>;
}
