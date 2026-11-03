import { useEffect, useState, type FormEvent } from "react";
import { inspectProjectAlgebraFreshness, upsertMath3DProjectAlgebraObject,
  type AlgebraObjectRecord, type AlgebraObjectRef, type Math3DProject,
  type SageAlgebraReconstructionResult } from "@math3d/core";
import { runSageAlgebraReconstruction } from "../../services/sageAlgebraReconstruction";
import { sageExecutionRegistry, type SageRuntimeProbe } from "../../services/sageOperationExecution";
import { describeAlgebraRuntime } from "./sageAlgebraRuntime";
import { createStructureStarter, describeStructure, structureDisplay,
  type StructureDraft, type StructureStarterKind, type StructureSummary } from "./sageStructuresModel";

type Props = {
  project: Math3DProject;
  onCreate: (record: AlgebraObjectRecord) => void | Promise<void>;
  onCreated: (ref: AlgebraObjectRef) => void;
  onCancel: () => void;
};
type Preview = { signature: string; record: AlgebraObjectRecord; summary: StructureSummary;
  sage: SageAlgebraReconstructionResult | null; sageVersion: string | null; message: string };
const action = { border: "1px solid #b9cce3", borderRadius: 7, background: "#fff", color: "#183b70",
  padding: "7px 10px", cursor: "pointer", fontSize: 12 } as const;
const kinds: readonly { value: StructureStarterKind; label: string }[] = [
  { value: "integer-ring", label: "Integer ring ZZ" },
  { value: "rational-field", label: "Rational field QQ" },
  { value: "modular-ring", label: "Modular ring Z/nZ" },
  { value: "finite-field", label: "Finite field GF(p^n)" },
  { value: "polynomial-ring", label: "Polynomial ring" },
];

export default function SageRingFieldBuilder({ project, onCreate, onCreated, onCancel }: Props) {
  const [kind, setKind] = useState<StructureStarterKind>("rational-field");
  const [label, setLabel] = useState("");
  const [modulus, setModulus] = useState("12");
  const [characteristic, setCharacteristic] = useState("7");
  const [degree, setDegree] = useState("2");
  const [generator, setGenerator] = useState("a");
  const [parentId, setParentId] = useState("");
  const [variables, setVariables] = useState("x, y");
  const [order, setOrder] = useState<"lex" | "deglex" | "degrevlex">("degrevlex");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runtimeProbes, setRuntimeProbes] = useState<Partial<Record<"local" | "docker", SageRuntimeProbe>>>({});
  const [checkingRuntimes, setCheckingRuntimes] = useState(false);
  const refreshRuntimes = async () => {
    setCheckingRuntimes(true);
    try {
      const [local, docker] = await Promise.all([
        sageExecutionRegistry.probeBackend("local"), sageExecutionRegistry.probeBackend("docker"),
      ]);
      setRuntimeProbes({ local, docker });
    } finally { setCheckingRuntimes(false); }
  };
  useEffect(() => { void refreshRuntimes(); }, []);
  const freshness = inspectProjectAlgebraFreshness(project);
  const parentOptions = (project.algebraObjects ?? []).filter((entry) => !entry.archived &&
    freshness.find((item) => item.objectId === entry.id)?.status === "fresh")
    .map((entry) => entry.revisions[entry.revisions.length - 1]);
  const parent = parentOptions.find((item) => item.id === parentId);
  const draft: StructureDraft = { kind, label, modulus, characteristic, degree, generator,
    coefficientDomain: parent ? { objectId: parent.id, revision: parent.revision } : undefined,
    variables, monomialOrder: order };
  const signature = JSON.stringify({ draft, projectId: project.identity.id, projectRevision: project.identity.revision,
    objects: project.algebraObjects?.map((entry) => entry.revisions.at(-1)?.contentHash) });
  const currentPreview = preview?.signature === signature ? preview : null;

  const validate = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null); setPreview(null); setBusy(true);
    try {
      const record = createStructureStarter(project, draft, crypto.randomUUID());
      const candidate = upsertMath3DProjectAlgebraObject(project, record);
      const summary = describeStructure(record, candidate);
      let sage: SageAlgebraReconstructionResult | null = null;
      let sageVersion: string | null = null;
      let message = "Validated locally.";
      const probe = await sageExecutionRegistry.probeBackend("docker");
      setRuntimeProbes((current) => ({ ...current, docker: probe }));
      const capability = describeAlgebraRuntime(probe);
      if (capability.supported) {
        const outcome = await runSageAlgebraReconstruction(candidate, { objectId: record.id, revision: 1 }).promise;
        if (!outcome.response.success || !outcome.result) throw new Error(outcome.response.error ?? "Sage could not construct this structure.");
        sage = outcome.result;
        sageVersion = outcome.response.engineVersion ?? probe.health.engineVersion ?? null;
        message = "Exact Sage constructor succeeded.";
      } else message = `Validated locally. Sage constructor not checked. ${capability.detail}${capability.next ? ` Next: ${capability.next}` : ""}`;
      setPreview({ signature, record, summary, sage, sageVersion, message });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!currentPreview || busy) return;
    setError(null); setBusy(true);
    try { await onCreate(currentPreview.record);
      onCreated({ objectId: currentPreview.record.id, revision: currentPreview.record.revision }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  return <div data-testid="cas-ring-field-builder" style={{ display: "grid", gap: 14, maxWidth: 650 }}>
    <div><div style={{ fontSize: 11, color: "#64748b" }}>Structures · Ring and Field Builder</div>
      <h2 style={{ margin: "3px 0" }}>New exact structure</h2>
      <div style={{ fontSize: 12 }}>Define a Project object, validate it, and inspect its exact parent facts before saving.</div></div>
    <section aria-label="Algebra runtime capabilities" data-testid="cas-algebra-runtime-capabilities" style={{ border: "1px solid #dbe2ea", borderRadius: 8, padding: 10, display: "grid", gap: 5, fontSize: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>Constructor preview runtimes</strong>
        <button type="button" style={action} disabled={checkingRuntimes || busy} onClick={() => { void refreshRuntimes(); }}>Refresh runtimes</button></div>
      {(["local", "docker"] as const).map((backend) => <div key={backend} data-testid={`cas-algebra-runtime-${backend}`} role="status">
        {runtimeProbes[backend] ? describeAlgebraRuntime(runtimeProbes[backend]).detail
          : checkingRuntimes ? `Checking ${backend === "local" ? "Local WSL" : "Docker"}…` : "Runtime not checked."}
      </div>)}
    </section>
    <form onSubmit={(event) => { void validate(event); }} className="sage-structure-grid" data-testid="cas-new-structure-form">
      <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as StructureStarterKind)}>
        {kinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select></label>
      <label>Name<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} required placeholder="Q" /></label>
      {kind === "modular-ring" && <label>Modulus n<input value={modulus} onChange={(event) => setModulus(event.target.value)} inputMode="numeric" required /></label>}
      {kind === "finite-field" && <>
        <label>Prime characteristic p<input value={characteristic} onChange={(event) => setCharacteristic(event.target.value)} inputMode="numeric" required /></label>
        <label>Extension degree n<input value={degree} onChange={(event) => setDegree(event.target.value)} inputMode="numeric" required /></label>
        <label>Generator name<input value={generator} onChange={(event) => setGenerator(event.target.value)} required /></label>
        <div role="note" style={{ fontSize: 12 }}>Construction policy: canonical Sage finite field. The saved definition records p, n, and the generator; a particular polynomial representation can vary by Sage version.</div>
      </>}
      {kind === "polynomial-ring" && <>
        <label>Coefficient domain<select value={parentId} onChange={(event) => setParentId(event.target.value)} required>
          <option value="">Select a saved parent</option>
          {parentOptions.map((item) => <option key={item.id} value={item.id}>{item.label}@{item.revision} · {structureDisplay(item, project)}</option>)}
        </select></label>
        <label>Variables<input value={variables} onChange={(event) => setVariables(event.target.value)} required /></label>
        <label>Monomial order<select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}>
          <option value="degrevlex">Degree reverse lexicographic</option><option value="deglex">Degree lexicographic</option><option value="lex">Lexicographic</option>
        </select></label>
      </>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={action} disabled={busy}>{busy ? "Checking…" : "Validate & preview"}</button>
        <button type="button" style={action} onClick={onCancel}>Cancel</button>
      </div>
    </form>
    {error && <div role="alert" style={{ color: "#a32626", fontSize: 12 }}>{error}</div>}
    {currentPreview && <section data-testid="cas-builder-preview" aria-label="Validated structure preview" style={{ border: "1px solid #b9cce3", borderRadius: 8, padding: 12 }}>
      <strong>{currentPreview.record.label} · {currentPreview.summary.presentation}</strong>
      <dl className="sage-structure-facts">
        <dt>Characteristic</dt><dd>{currentPreview.summary.characteristic}</dd>
        <dt>Field</dt><dd>{currentPreview.sage ? currentPreview.sage.isField ? "yes" : "no" : currentPreview.summary.field}</dd>
        <dt>Cardinality</dt><dd>{currentPreview.summary.cardinality ?? "Infinite"}</dd>
        <dt>Zero divisors</dt><dd>{kind === "modular-ring" && currentPreview.sage
          ? currentPreview.sage.isField ? "no" : "yes" : currentPreview.summary.zeroDivisors}</dd>
        <dt>Exact arithmetic</dt><dd>Yes</dd>
        {parent && kind === "polynomial-ring" && <><dt>Coefficient domain</dt><dd>{parent.label}@{parent.revision}</dd></>}
        {currentPreview.sage && <><dt>Sage construction</dt><dd>{currentPreview.sage.text}</dd>
          <dt>Sage version</dt><dd>{currentPreview.sageVersion ?? "unreported"}</dd></>}
      </dl>
      <p role="status" style={{ fontSize: 12 }}>{currentPreview.message}</p>
      <button type="button" style={action} disabled={busy} onClick={() => { void save(); }}>Create and save</button>
    </section>}
  </div>;
}
