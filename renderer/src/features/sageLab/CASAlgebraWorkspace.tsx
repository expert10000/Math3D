import { useEffect, useState, type FormEvent } from "react";
import { inspectProjectAlgebraFreshness, type AlgebraObjectRecord, type AlgebraObjectRef,
  type Math3DProject } from "@math3d/core";
import SageServicesWorkspace, { type SageServicesWorkspaceProps } from "./SageServicesWorkspace";
import { createStructureStarter, resolveStructureSelection, selectedStructure,
  structureDisplay, structureSelectionKey, type StructureStarterKind } from "./sageStructuresModel";

type Props = Omit<SageServicesWorkspaceProps, "structures"> & {
  onOpenConsole: () => void;
  project: Math3DProject | null;
  onCreateStructure: (record: AlgebraObjectRecord) => void | Promise<void>;
  onOpenProjects: () => void;
};

const action = { border: "1px solid #b9cce3", borderRadius: 7, background: "#fff", color: "#183b70",
  padding: "7px 10px", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" } as const;
const kindLabel: Record<StructureStarterKind, string> = {
  "integer-ring": "Integer ring ZZ", "rational-field": "Rational field QQ", "polynomial-ring": "Polynomial ring",
};
const readSavedSelection = (project: Math3DProject | null): unknown => {
  if (!project) return null;
  try { const saved = localStorage.getItem(structureSelectionKey(project.identity.id)); return saved ? JSON.parse(saved) : null; }
  catch { return null; }
};

export default function CASAlgebraWorkspace({ project, onCreateStructure, onOpenProjects, ...props }: Props) {
  const [selection, setSelection] = useState<AlgebraObjectRef | null>(() =>
    resolveStructureSelection(project, readSavedSelection(project)));
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<StructureStarterKind>("rational-field");
  const [label, setLabel] = useState("");
  const [parentId, setParentId] = useState("");
  const [variables, setVariables] = useState("x, y");
  const [order, setOrder] = useState<"lex" | "deglex" | "degrevlex">("degrevlex");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelection((current) => resolveStructureSelection(project,
      current && project?.algebraObjects?.some((entry) => entry.id === current.objectId)
        ? current : readSavedSelection(project)));
  }, [project?.identity.id, project?.identity.revision]);

  const select = (ref: AlgebraObjectRef) => {
    setSelection(ref);
    if (project) try { localStorage.setItem(structureSelectionKey(project.identity.id), JSON.stringify(ref)); }
    catch { /* Selection still works when local storage is unavailable. */ }
  };
  const chosen = selectedStructure(project, selection);
  const freshness = project ? inspectProjectAlgebraFreshness(project) : [];
  const status = chosen ? freshness.find((item) => item.objectId === chosen.entry.id) : null;
  const parentOptions = (project?.algebraObjects ?? []).filter((entry) => !entry.archived &&
    freshness.find((item) => item.objectId === entry.id)?.status === "fresh")
    .map((entry) => entry.revisions[entry.revisions.length - 1]);
  const parent = chosen?.record.definition.kind === "polynomial-ring"
    ? selectedStructure(project, chosen.record.definition.coefficientDomain)?.record : null;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || saving) return;
    setError(null);
    setSaving(true);
    try {
      const parentRecord = parentOptions.find((item) => item.id === parentId);
      const record = createStructureStarter(project, { kind, label,
        ...(kind === "polynomial-ring" ? { coefficientDomain: parentRecord
          ? { objectId: parentRecord.id, revision: parentRecord.revision } : undefined,
          variables, monomialOrder: order } : {}) }, crypto.randomUUID());
      await onCreateStructure(record);
      select({ objectId: record.id, revision: record.revision });
      setCreating(false);
      setLabel("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };

  const explorer = <div data-testid="cas-structures-explorer" style={{ display: "grid", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <h2 style={{ fontSize: 16, margin: 0, whiteSpace: "nowrap" }}>Project structures</h2>
      <button type="button" style={action} disabled={!project} onClick={() => { setCreating((value) => !value); setError(null); }}>+ New structure</button>
    </div>
    {!project && <div role="status" style={{ fontSize: 12 }}>Open or create a Project to save algebra structures.
      <div style={{ marginTop: 8 }}><button type="button" style={action} onClick={onOpenProjects}>Open Projects</button></div>
    </div>}
    {project && <div className="sage-structure-list" aria-label="Saved algebra objects">
      {(project.algebraObjects ?? []).length ? [...project.algebraObjects!].sort((a, b) =>
        a.revisions[a.revisions.length - 1].label.localeCompare(b.revisions[b.revisions.length - 1].label))
        .map((entry) => {
          const latest = entry.revisions[entry.revisions.length - 1];
          const fresh = freshness.find((item) => item.objectId === entry.id);
          return <button type="button" key={entry.id} aria-current={selection?.objectId === entry.id}
            onClick={() => select({ objectId: entry.id, revision: latest.revision })}>
            <strong>{latest.label}</strong> <span style={{ fontSize: 11 }}>@{latest.revision}</span>
            <div style={{ fontSize: 12 }}>{structureDisplay(latest, project)}</div>
            <small>{entry.archived ? "Archived" : fresh?.status === "stale" ? "Stale parent" : "Current"}</small>
          </button>;
        }) : <div role="status" style={{ fontSize: 12, color: "#64748b" }}>No structures in this Project yet.</div>}
    </div>}
    {creating && project && <form onSubmit={(event) => { void create(event); }} className="sage-structure-grid" data-testid="cas-new-structure-form">
      <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as StructureStarterKind)}>
        {(Object.keys(kindLabel) as StructureStarterKind[]).map((value) => <option key={value} value={value}>{kindLabel[value]}</option>)}
      </select></label>
      <label>Name<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} required placeholder={kind === "rational-field" ? "Q" : kind === "integer-ring" ? "Z" : "R"} /></label>
      {kind === "polynomial-ring" && <>
        <label>Coefficient domain<select value={parentId} onChange={(event) => setParentId(event.target.value)} required>
          <option value="">Select a saved parent</option>
          {parentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}@{item.revision} · {structureDisplay(item, project)}</option>)}
        </select></label>
        <label>Variables<input value={variables} onChange={(event) => setVariables(event.target.value)} placeholder="x, y" required /></label>
        <label>Monomial order<select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}>
          <option value="degrevlex">Degree reverse lexicographic</option><option value="deglex">Degree lexicographic</option><option value="lex">Lexicographic</option>
        </select></label>
      </>}
      {error && <div role="alert" style={{ color: "#a32626", fontSize: 12 }}>{error}</div>}
      <button type="submit" style={action} disabled={saving}>{saving ? "Saving…" : "Create and save"}</button>
    </form>}
  </div>;

  const dossier = chosen && project ? <div data-testid="cas-selected-structure" style={{ display: "grid", gap: 14 }}>
    <div><div style={{ fontSize: 11, color: "#64748b" }}>Structure dossier</div>
      <h2 style={{ margin: "3px 0", fontSize: 21 }}>{chosen.record.label}</h2>
      <div style={{ fontSize: 17 }}>{structureDisplay(chosen.record, project)}</div></div>
    <label style={{ display: "grid", gap: 4, maxWidth: 240, fontSize: 12 }}>Revision
      <select aria-label="Structure revision" value={chosen.record.revision}
        onChange={(event) => select({ objectId: chosen.record.id, revision: Number(event.target.value) })}>
        {chosen.entry.revisions.map((item) => <option key={item.revision} value={item.revision}>{item.label}@{item.revision}</option>)}
      </select>
    </label>
    <dl className="sage-structure-facts">
      <dt>Kind</dt><dd>{kindLabel[chosen.record.kind as StructureStarterKind] ?? chosen.record.kind}</dd>
      <dt>Status</dt><dd>{chosen.entry.archived ? "Archived" : chosen.record.revision !== chosen.entry.revisions.length ? "Historical revision" : status?.status === "stale" ? "Stale parent" : "Current"}</dd>
      {parent && <><dt>Coefficient domain</dt><dd><button type="button" style={action} onClick={() => select({ objectId: parent.id, revision: parent.revision })}>{parent.label}@{parent.revision} · {structureDisplay(parent, project)}</button></dd></>}
      {chosen.record.definition.kind === "polynomial-ring" && <>
        <dt>Variables</dt><dd>{chosen.record.definition.variables.join(", ")}</dd>
        <dt>Monomial order</dt><dd>{chosen.record.definition.monomialOrder}</dd></>}
      {chosen.record.definition.kind === "modular-ring" && <><dt>Modulus</dt><dd>{chosen.record.definition.modulus}</dd></>}
      {chosen.record.definition.kind === "finite-field" && <><dt>Characteristic</dt><dd>{chosen.record.definition.characteristic}</dd><dt>Degree</dt><dd>{chosen.record.definition.degree}</dd></>}
    </dl>
    {status?.causes.length ? <div role="status" style={{ color: "#9a3412", fontSize: 12 }}>Stale because a pinned parent definition advanced: {status.causes.map((item) => `${item.objectId}@${item.pinnedRevision} → @${item.currentRevision}`).join(", ")}.</div> : null}
  </div> : <div role="status" style={{ fontSize: 12, color: "#64748b" }}>{project ? "Select a saved structure to inspect its definition." : "Open a Project to inspect its structures."}</div>;

  const inspector = chosen ? <dl className="sage-structure-facts" data-testid="cas-structure-inspector">
    <dt>Object ID</dt><dd>{chosen.record.id}</dd>
    <dt>Revision</dt><dd>{chosen.record.revision}</dd>
    <dt>Definition hash</dt><dd>{chosen.record.contentHash}</dd>
    <dt>Parent revisions</dt><dd>{chosen.record.dependencies.length ? chosen.record.dependencies.map((ref) => `${ref.objectId}@${ref.revision}`).join(", ") : "None"}</dd>
    <dt>Current dependents</dt><dd>{status?.directDependents.length ? status.directDependents.length : "None"}</dd>
  </dl> : <div role="status" style={{ fontSize: 12 }}>Select a structure in the Project explorer.</div>;

  return <SageServicesWorkspace {...props} context="cas" title="CAS / Algebra"
    description="Exact symbolic, polynomial, matrix, algebraic geometry, and number theory operations."
    testId="cas-algebra-workspace" structures={{ projectId: project?.identity.id ?? null,
      projectTitle: project?.metadata.title ?? null,
      selectionKey: selection ? `${selection.objectId}@${selection.revision}` : null,
      explorer, dossier, inspector }} />;
}
