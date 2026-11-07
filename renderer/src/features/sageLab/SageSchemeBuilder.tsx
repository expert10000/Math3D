import { useState } from "react";
import { createAlgebraObjectRecord, createProjectAlgebraObjectId, upsertMath3DProjectAlgebraObject,
  type AlgebraObjectRecord, type AlgebraObjectRef, type Math3DProject } from "@math3d/core";

type Props = { project: Math3DProject; onCreate: (record: AlgebraObjectRecord) => void | Promise<void>;
  onCreated: (ref: AlgebraObjectRef) => void; onCancel: () => void };

export default function SageSchemeBuilder({ project, onCreate, onCreated, onCancel }: Props) {
  const ideals = (project.algebraObjects ?? []).filter((entry) => !entry.archived &&
    entry.revisions.at(-1)?.definition.kind === "ideal");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"affine-scheme" | "projective-scheme">("affine-scheme");
  const [idealId, setIdealId] = useState<string>(ideals[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = ideals.find((entry) => entry.id === idealId)?.revisions.at(-1);
  const definition = selected?.definition.kind === "ideal" ? {
    kind, ambientRing: selected.definition.ambientRing,
    ideal: { objectId: selected.id, revision: selected.revision } } as const : null;
  let reason = "";
  if (definition) try {
    const probe = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "scheme-preview"),
      revision: 1, label: "Scheme preview", definition });
    upsertMath3DProjectAlgebraObject(project, probe);
  } catch (error) { reason = String((error as Error).message ?? error); }
  const save = async () => {
    if (!definition || reason || !label.trim()) return;
    setBusy(true); setMessage("");
    try {
      const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, crypto.randomUUID()),
        revision: 1, label: label.trim(), definition });
      upsertMath3DProjectAlgebraObject(project, record);
      await onCreate(record);
      onCreated({ objectId: record.id, revision: 1 });
    } catch (error) { setMessage(String((error as Error).message ?? error)); }
    finally { setBusy(false); }
  };
  return <section data-testid="cas-scheme-builder" style={{ display: "grid", gap: 8, fontSize: 12 }}>
    <h2 style={{ margin: 0 }}>New exact scheme</h2>
    <p style={{ margin: 0 }}>Choose a saved ideal. Its full ideal presentation, including nonreduced structure, stays pinned.</p>
    <label>Scheme name <input aria-label="Scheme name" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
    <label>Scheme kind <select aria-label="Scheme kind" value={kind}
      onChange={(event) => setKind(event.target.value as typeof kind)}>
      <option value="affine-scheme">Affine Spec(R/I)</option>
      <option value="projective-scheme">Projective Proj(R/I)</option>
    </select></label>
    <label>Saved ideal <select aria-label="Scheme ideal" value={idealId}
      onChange={(event) => setIdealId(event.target.value)}>
      {ideals.map((entry) => <option key={entry.id} value={entry.id}>
        {entry.revisions.at(-1)?.label}@{entry.revisions.length}</option>)}
    </select></label>
    {!ideals.length && <div role="status">Create a bounded ideal over QQ first.</div>}
    {reason && <div role="status" style={{ color: "#9a3412" }}>{reason}</div>}
    {definition && !reason && <div data-testid="cas-scheme-preview">
      {kind === "affine-scheme" ? "Spec" : "Proj"}(R/I) · ideal {selected?.label}@{selected?.revision}
      {kind === "projective-scheme" ? " · homogeneous presentation in a graded order" : ""}
    </div>}
    <div style={{ display: "flex", gap: 8 }}>
      <button type="button" disabled={busy || !definition || !!reason || !label.trim()} onClick={() => { void save(); }}>Save scheme</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
    {message && <div role="alert">{message}</div>}
  </section>;
}
