import { useState, type FormEvent } from "react";
import { inspectProjectAlgebraFreshness, type AlgebraObjectRecord, type AlgebraObjectRef,
  type Math3DProject } from "@math3d/core";
import { createEllipticCurveStarter } from "./sageEllipticCurveModel";

type Props = { project: Math3DProject; onCreate: (record: AlgebraObjectRecord) => void | Promise<void>;
  onCreated: (ref: AlgebraObjectRef) => void; onCancel: () => void };
const action = { border: "1px solid #b9cce3", borderRadius: 7, background: "#fff", color: "#183b70",
  padding: "7px 10px", cursor: "pointer", fontSize: 12 } as const;

export default function SageEllipticCurveBuilder({ project, onCreate, onCreated, onCancel }: Props) {
  const [name, setName] = useState("E");
  const [baseId, setBaseId] = useState("");
  const [a, setA] = useState("-1");
  const [b, setB] = useState("1");
  const [preview, setPreview] = useState<ReturnType<typeof createEllipticCurveStarter> | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const freshness = inspectProjectAlgebraFreshness(project);
  const fields = (project.algebraObjects ?? []).filter((entry) => {
    const definition = entry.revisions.at(-1)?.definition;
    return !entry.archived && freshness.find((item) => item.objectId === entry.id)?.status === "fresh" &&
      (definition?.kind === "rational-field" || (definition?.kind === "finite-field" &&
        definition.degree === 1 && definition.characteristic >= 5 && definition.characteristic <= 1009));
  });
  const parent = fields.find((entry) => entry.id === baseId)?.revisions.at(-1);
  const signature = JSON.stringify([project.identity.id, project.identity.revision, name, baseId, a, b]);
  const current = signature === previewKey ? preview : null;
  const validate = (event: FormEvent) => {
    event.preventDefault(); setError(""); setPreview(null);
    try {
      if (!parent) throw new TypeError("Select a saved QQ or prime finite field.");
      const candidate = createEllipticCurveStarter(project, name,
        { objectId: parent.id, revision: parent.revision }, a, b, crypto.randomUUID());
      setPreview(candidate); setPreviewKey(signature);
    } catch (cause) { setError(String((cause as Error).message ?? cause)); }
  };
  const save = async () => {
    if (!current || busy) return;
    setBusy(true); setError("");
    try { await onCreate(current.record); onCreated({ objectId: current.record.id, revision: 1 }); }
    catch (cause) { setError(String((cause as Error).message ?? cause)); }
    finally { setBusy(false); }
  };
  return <section data-testid="cas-elliptic-curve-builder" style={{ display: "grid", gap: 12, maxWidth: 650 }}>
    <div><small>Structures · Elliptic curve</small><h2 style={{ margin: "3px 0" }}>New elliptic curve</h2>
      <p>Save a nonsingular short Weierstrass model y² = x³ + ax + b over a pinned field.</p></div>
    <form onSubmit={validate} className="sage-structure-grid">
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <label>Base field<select aria-label="Curve base field" value={baseId}
        onChange={(event) => setBaseId(event.target.value)} required>
        <option value="">Select saved QQ or GF(p)</option>
        {fields.map((entry) => { const record = entry.revisions.at(-1)!;
          return <option key={entry.id} value={entry.id}>{record.label}@{record.revision}</option>; })}</select></label>
      <label>Coefficient a<input aria-label="Curve coefficient a" value={a}
        onChange={(event) => setA(event.target.value)} required /></label>
      <label>Coefficient b<input aria-label="Curve coefficient b" value={b}
        onChange={(event) => setB(event.target.value)} required /></label>
      <small>QQ coefficients are integers from −4096 to 4096. Over GF(p), use residues 0…p−1;
        the base must be a prime field with 5 ≤ p ≤ 1009.</small>
      <div style={{ display: "flex", gap: 8 }}><button type="submit" style={action}>Validate &amp; preview</button>
        <button type="button" style={action} onClick={onCancel}>Cancel</button></div>
    </form>
    {error && <div role="alert">{error}</div>}
    {current && <div data-testid="cas-elliptic-curve-preview" style={{ border: "1px solid #b9cce3",
      borderRadius: 8, padding: 12 }}>
      <strong>{current.record.label}: y² = x³ + ({current.facts.a})x + ({current.facts.b})</strong>
      <dl className="sage-structure-facts"><dt>Discriminant</dt><dd>{current.facts.discriminant}</dd>
        <dt>j-invariant</dt><dd>{current.facts.jInvariant}</dd><dt>Base characteristic</dt>
        <dd>{current.facts.characteristic}</dd><dt>Model</dt><dd>Short Weierstrass, nonsingular</dd></dl>
      <button type="button" style={action} disabled={busy} onClick={() => { void save(); }}>Create and save</button>
    </div>}
  </section>;
}
