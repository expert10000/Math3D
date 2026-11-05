import { useState, type FormEvent } from "react";
import { FINITE_GROUP_PRESETS, analyzeFiniteGroup, createAlgebraObjectRecord,
  createProjectAlgebraObjectId, type AlgebraObjectRecord, type AlgebraObjectRef,
  type Math3DProject } from "@math3d/core";

type Props = { project: Math3DProject; onCreate: (record: AlgebraObjectRecord) => void | Promise<void>;
  onCreated: (ref: AlgebraObjectRef) => void; onCancel: () => void };

/** A local exact preview; runtime GAP operations are introduced by the later capability gate. */
export default function SageFiniteGroupBuilder({ project, onCreate, onCreated, onCancel }: Props) {
  const [presetId, setPresetId] = useState<(typeof FINITE_GROUP_PRESETS)[number]["id"]>("D4");
  const [label, setLabel] = useState("D4");
  const [preview, setPreview] = useState<{ record: AlgebraObjectRecord; presetId: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preset = FINITE_GROUP_PRESETS.find((item) => item.id === presetId)!;
  const current = preview?.record.label === label.trim() && preview.presetId === presetId ? preview.record : null;
  const validate = (event: FormEvent) => {
    event.preventDefault(); setError(""); setPreview(null);
    try {
      const name = label.trim();
      if (!name || name.length > 120 || project.algebraObjects?.some((entry) => !entry.archived &&
          entry.revisions.at(-1)?.label.toLocaleLowerCase() === name.toLocaleLowerCase()))
        throw new TypeError("Choose a unique group name of 1–120 characters in this Project.");
      setPreview({ record: createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, crypto.randomUUID()),
        revision: 1, label: name, definition: preset.definition }), presetId });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const save = async () => {
    if (!current || busy) return;
    setBusy(true); setError("");
    try { await onCreate(current); onCreated({ objectId: current.id, revision: 1 }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const facts = current ? analyzeFiniteGroup(current.definition as typeof preset.definition) : null;
  return <section data-testid="cas-finite-group-builder" style={{ display: "grid", gap: 10 }}>
    <h2 style={{ margin: 0 }}>New finite group</h2>
    <form onSubmit={validate} style={{ display: "grid", gap: 8 }}>
      <label>Small group<select aria-label="Group preset" value={presetId} onChange={(event) => {
        const id = event.target.value as typeof presetId;
        setPresetId(id); setLabel(id); setPreview(null);
      }}>{FINITE_GROUP_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.description}</option>)}</select></label>
      <label>Name<input aria-label="Group name" value={label} onChange={(event) => setLabel(event.target.value)} required maxLength={120} /></label>
      <div style={{ fontSize: 12 }}>{preset.description}</div>
      <div style={{ display: "flex", gap: 8 }}><button type="submit">Validate & preview</button>
        <button type="button" onClick={onCancel}>Cancel</button></div>
    </form>
    {error && <div role="alert">{error}</div>}
    {current && facts && <section data-testid="cas-finite-group-preview" style={{ display: "grid", gap: 8 }}>
      <strong>{current.label} · order {facts.order}</strong>
      <div>Elements of order 2: {facts.involutionCount}</div>
      <div>{facts.presentation}</div>
      <div>Generators: {facts.generatorOrders.map((item) => `${item.name} (order ${item.order})`).join(", ")}</div>
      <div>{current.definition.kind === "finite-group" && current.definition.representation === "abelian"
        ? "Invariant-factor presentation" : "Permutation generators"}</div>
      <div>Checked relations: {facts.checkedRelations.join("; ") || "None supplied"}</div>
      <div style={{ fontSize: 11, color: "#526477" }}>Permutation relations are verified identities; they do not assert a complete abstract presentation.</div>
      <button type="button" disabled={busy} onClick={() => { void save(); }}>{busy ? "Saving…" : "Create and save"}</button>
    </section>}
  </section>;
}
