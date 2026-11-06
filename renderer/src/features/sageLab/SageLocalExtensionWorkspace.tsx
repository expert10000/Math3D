import { useEffect, useRef, useState } from "react";
import { buildAlgebraOperationRequest, createProjectAlgebraEvidence,
  type Math3DProject, type ProjectAlgebraEvidence, type SageLocalExtensionResult } from "@math3d/core";
import { sageExecutionRegistry, type SageOperationHandle } from "../../services/sageOperationExecution";

type Props = { project: Math3DProject | null;
  onSaveEvidence: (evidence: ProjectAlgebraEvidence) => void | Promise<void> };
const field = { width: "100%", boxSizing: "border-box" as const, padding: 6, fontSize: 12 };

export default function SageLocalExtensionWorkspace({ project, onSaveEvidence }: Props) {
  const [fieldId, setFieldId] = useState("");
  const [prime, setPrime] = useState("3");
  const [precision, setPrecision] = useState("8");
  const [ready, setReady] = useState(false);
  const [runtimeMessage, setRuntimeMessage] = useState("Checking Docker Sage capability…");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active = useRef<SageOperationHandle | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    let cancelled = false;
    void sageExecutionRegistry.probeBackend("docker").then((probe) => {
      if (cancelled) return;
      const supported = probe.health.available && probe.operations.some((item) =>
        item.operationType === "number-field.local-extensions");
      setReady(supported);
      setRuntimeMessage(supported ? `Docker Sage ${probe.health.engineVersion ?? ""} ready` :
        `Docker Sage unavailable: ${probe.health.status || "local-extension capability missing"}`);
    }).catch((error) => { if (!cancelled) { setReady(false); setRuntimeMessage(String(error)); } });
    return () => { cancelled = true; generation.current += 1; active.current?.cancel(); };
  }, []);
  useEffect(() => { generation.current += 1; active.current?.cancel(); active.current = null;
    setBusy(false); setSelectedId(null); setMessage(""); setFieldId(""); }, [project?.identity.id]);
  const fields = (project?.algebraObjects ?? []).filter((entry) => !entry.archived &&
    entry.revisions.at(-1)?.kind === "number-field");
  const chosen = fields.find((entry) => entry.id === fieldId) ?? fields[0];
  const record = chosen?.revisions.at(-1);
  const saved = (project?.algebraEvidence ?? []).filter((item) =>
    item.request.operation === "sage.numberField.localExtensions" && item.request.target.objectId === chosen?.id);
  const selected = saved.find((item) => item.id === selectedId) ?? saved.at(-1);
  const result = selected?.result as SageLocalExtensionResult | undefined;

  const run = async () => {
    if (!project || !chosen || !record || !ready) return;
    const token = ++generation.current;
    setBusy(true); setMessage("");
    try {
      if (!/^[0-9]+$/.test(prime.trim()) || !/^[0-9]+$/.test(precision.trim()))
        throw new TypeError("Prime and precision must be whole numbers.");
      const request = buildAlgebraOperationRequest(project, { objectId: chosen.id, revision: record.revision },
        "sage.numberField.localExtensions", "docker", { prime: Number(prime), precision: Number(precision) });
      const handle = sageExecutionRegistry.run({ operation: request.operation, params: request.params,
        backend: request.backend });
      active.current = handle;
      const { response, broker } = await handle.promise;
      if (token !== generation.current) return;
      if (!broker.ok || !response.success) throw new Error(response.error ?? "Sage local-field operation failed.");
      if (response.engine !== "sagemath" || response.operation !== request.operation || !response.engineVersion)
        throw new Error("Sage response lacks matching operation and version provenance.");
      const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects ?? [], request,
        response.result, { engine: "sagemath", version: response.engineVersion, backend: "docker",
          jobId: handle.jobId, elapsedMs: response.elapsedMs ?? 0, warnings: response.warnings });
      await onSaveEvidence(evidence);
      if (token === generation.current) { setSelectedId(evidence.id); setMessage("Saved local-extension evidence to Project."); }
    } catch (error) { if (token === generation.current) setMessage(String((error as Error).message ?? error)); }
    finally { if (token === generation.current) { setBusy(false); active.current = null; } }
  };
  return <details data-testid="number-theory-local-extensions" style={{ border: "1px solid #cbd5e1",
    borderRadius: 8, padding: 12, marginBottom: 12, background: "#fff", fontSize: 12 }}>
    <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 15 }}>Quadratic local extensions · ramification</summary>
    <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
      <p style={{ margin: 0 }}>For a saved quadratic number field, inspect prime ideals over p and bounded
        local models over Qp. Each model uses the pinned defining polynomial at the chosen precision.</p>
      <div role="status" data-testid="local-extension-runtime-status">{runtimeMessage}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <label>Saved quadratic field<select style={field} value={chosen?.id ?? ""} disabled={busy}
          onChange={(event) => { setFieldId(event.target.value); setSelectedId(null); }}>
          {fields.map((entry) => <option key={entry.id} value={entry.id}>
            {entry.revisions.at(-1)?.label}@{entry.revisions.at(-1)?.revision}</option>)}</select></label>
        <label>Rational prime p<input style={field} inputMode="numeric" value={prime}
          onChange={(event) => setPrime(event.target.value)} /></label>
        <label>Qp precision digits<input style={field} inputMode="numeric" value={precision}
          onChange={(event) => setPrecision(event.target.value)} /></label>
      </div>
      <small>{record ? `Pinned field: ${record.label}@${record.revision}.` : "Save a quadratic number field in Structures first."}
        {" "}Odd primes 3–31 and precision 2–16 are supported when p does not divide the defining power-basis index.</small>
      <div><button type="button" disabled={!project || !chosen || !ready || busy}
        onClick={() => { void run(); }}>Run and save local extensions</button>
        {busy && <button type="button" onClick={() => { generation.current += 1; active.current?.cancel(); active.current = null;
          setBusy(false); setMessage("Local-extension operation cancelled."); }}>Cancel</button>}</div>
      {message && <div role="status" data-testid="local-extension-run-status">{message}</div>}
      {saved.length > 0 && <label>Saved local studies<select style={field} value={selected?.id ?? ""}
        onChange={(event) => setSelectedId(event.target.value)}>
        {saved.map((item) => <option key={item.id} value={item.id}>
          p={String(item.request.params.prime)} · precision {String(item.request.params.precision)} ·
          Sage {item.runtime.version} · {item.runtime.jobId}</option>)}</select></label>}
      {result && <section data-testid="local-extension-saved-result" aria-label="Saved local extensions"
        style={{ display: "grid", gap: 8 }}>
        <strong>{record?.label ?? "K"} at p={result.prime}: {result.splitting}</strong>
        <div>Global field discriminant {result.fieldDiscriminant}; defining polynomial coefficients
          [{result.polynomial.join(", ")}]. Base Q{result.prime} precision {result.precision} digits.</div>
        <div role="list" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "stretch" }}>
          <div role="listitem" style={{ padding: 8, border: "1px solid #cbd5e1", borderRadius: 6 }}>
            Global field {record?.label ?? "K"}</div>
          <span aria-hidden="true">→</span>
          {result.branches.map((branch, index) => <div role="listitem" key={`${branch.ideal}-${index}`}
            style={{ display: "grid", gap: 3, padding: 8, border: "1px solid #cbd5e1", borderRadius: 6,
              minWidth: 220, maxWidth: 360 }}>
            <strong>Prime ideal P{index + 1} → {branch.model === "base" ? `Q${result.prime}` : "quadratic Qp model"}</strong>
            <span>{branch.ideal}; norm {branch.idealNorm}</span>
            <span>Ramification e={branch.ramificationIndex}; residue degree f={branch.residueDegree};
              local degree {branch.localDegree}</span>
            <span>Residue field order {branch.residueOrder}; generator residue {branch.generatorResidue}</span>
            <span>Uniformizer {branch.uniformizer} (valuation {branch.uniformizerValuation});
              v(p)={branch.basePrimeValuation}</span>
            {branch.rootResidue !== null && <span>Generator root {branch.rootResidue} modulo
              {result.prime}^{result.precision}; absolute precision {branch.rootPrecision}</span>}
            <small>{branch.localField}</small>
          </div>)}
        </div>
        <small>Finite-precision local models are tied to these prime ideals by residue data. A canonical
          NumberField.completion map is not asserted.</small>
      </section>}
    </div>
  </details>;
}
