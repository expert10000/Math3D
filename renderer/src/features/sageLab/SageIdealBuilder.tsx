import { useState, type FormEvent } from "react";
import { inspectProjectAlgebraFreshness, type AlgebraObjectRecord, type AlgebraObjectRef,
  type Math3DProject } from "@math3d/core";
import { createIdealStarter, selectedStructure, structureDisplay } from "./sageStructuresModel";

type Props = { project: Math3DProject; onCreate: (record: AlgebraObjectRecord) => void | Promise<void>;
  onCreated: (ref: AlgebraObjectRef) => void; onCancel: () => void };
const action = { border: "1px solid #b9cce3", borderRadius: 7, background: "#fff", color: "#183b70",
  padding: "7px 10px", cursor: "pointer", fontSize: 12 } as const;

export default function SageIdealBuilder({ project, onCreate, onCreated, onCancel }: Props) {
  const [label, setLabel] = useState("");
  const [ambientId, setAmbientId] = useState("");
  const [generators, setGenerators] = useState("x^2+y\nx*y-1");
  const [preview, setPreview] = useState<{ signature: string; record: AlgebraObjectRecord } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const freshness = inspectProjectAlgebraFreshness(project);
  const rings = (project.algebraObjects ?? []).filter((entry) => !entry.archived &&
    freshness.find((item) => item.objectId === entry.id)?.status === "fresh")
    .map((entry) => entry.revisions.at(-1)!)
    .filter((item) => item.definition.kind === "polynomial-ring" &&
      selectedStructure(project, item.definition.coefficientDomain)?.record.kind === "rational-field" &&
      item.definition.variables.length <= 8);
  const ambient = rings.find((item) => item.id === ambientId) ?? rings[0];
  const signature = JSON.stringify({ label, ambientId: ambient?.id, ambientRevision: ambient?.revision,
    generators, projectRevision: project.identity.revision });
  const current = preview?.signature === signature ? preview.record : null;
  const validate = (event: FormEvent) => {
    event.preventDefault(); setError(""); setPreview(null);
    try {
      if (!ambient) throw new TypeError("Create a fresh polynomial ring over QQ before adding an ideal.");
      const record = createIdealStarter(project, label, { objectId: ambient.id, revision: ambient.revision },
        generators, crypto.randomUUID());
      setPreview({ signature, record });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const save = async () => {
    if (!current || busy) return;
    setBusy(true); setError("");
    try {
      await onCreate(current);
      onCreated({ objectId: current.id, revision: current.revision });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <div data-testid="cas-ideal-builder" style={{ display: "grid", gap: 12, maxWidth: 650 }}>
    <div><div style={{ fontSize: 11, color: "#64748b" }}>Structures · Ideal Builder</div>
      <h2 style={{ margin: "3px 0" }}>New ideal</h2>
      <div style={{ fontSize: 12 }}>Define exact polynomial generators in a saved QQ ring. C01 validates bounded syntax and parent revisions; Sage ideal computation comes in C02.</div></div>
    <form onSubmit={validate} className="sage-structure-grid">
      <label>Name<input aria-label="Ideal name" value={label} onChange={(event) => setLabel(event.target.value)}
        maxLength={120} required placeholder="I" /></label>
      <label>Ambient ring<select aria-label="Ideal ambient ring" value={ambient?.id ?? ""}
        onChange={(event) => setAmbientId(event.target.value)} required>
        {rings.length ? rings.map((item) => <option key={item.id} value={item.id}>
          {item.label}@{item.revision} · {structureDisplay(item, project)}</option>)
          : <option value="">Create a QQ polynomial ring first</option>}
      </select></label>
      <label style={{ gridColumn: "1 / -1" }}>Generators, one polynomial per line
        <textarea aria-label="Ideal generators" value={generators}
          onChange={(event) => setGenerators(event.target.value)} rows={5} maxLength={2048} required /></label>
      <div style={{ display: "flex", gap: 8 }}><button type="submit" style={action} disabled={busy || !ambient}>Validate ideal</button>
        <button type="button" style={action} onClick={onCancel}>Cancel</button></div>
    </form>
    {error && <div role="alert">{error}</div>}
    {current && <section data-testid="cas-ideal-preview" style={{ border: "1px solid #dbe2ea", borderRadius: 8, padding: 10 }}>
      <strong>{current.label}@{current.revision}</strong>
      <div>{structureDisplay(current, project)}</div>
      <div>Validated generators: {current.definition.kind === "ideal" ? current.definition.generators.length : 0}</div>
      <div>Ambient ring revision is pinned; Sage computation has not run.</div>
      <button type="button" style={action} disabled={busy} onClick={() => { void save(); }}>Save ideal to Project</button>
    </section>}
  </div>;
}
