import { useEffect, useRef, useState } from "react";
import { buildAlgebraOperationRequest, createAlgebraObjectRecord, createProjectAlgebraEvidence,
  createProjectAlgebraObjectId, parsePadicRationalText,
  type AlgebraObjectRecord, type Math3DProject, type ProjectAlgebraEvidence,
  type SagePadicResult } from "@math3d/core";
import { sageExecutionRegistry, type SageOperationHandle } from "../../services/sageOperationExecution";

type Props = { project: Math3DProject | null;
  onCreateStructure: (record: AlgebraObjectRecord) => void | Promise<void>;
  onSaveEvidence: (evidence: ProjectAlgebraEvidence) => void | Promise<void> };
const field = { width: "100%", boxSizing: "border-box" as const, padding: 6, fontSize: 12 };

export default function SagePadicWorkspace({ project, onCreateStructure, onSaveEvidence }: Props) {
  const [domain, setDomain] = useState<"Zp" | "Qp">("Zp");
  const [prime, setPrime] = useState("7");
  const [precision, setPrecision] = useState("6");
  const [a, setA] = useState("3");
  const [b, setB] = useState("4");
  const [polynomial, setPolynomial] = useState("");
  const [seed, setSeed] = useState("");
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
        item.operationType === "number-theory.padic");
      setReady(supported);
      setRuntimeMessage(supported ? `Docker Sage ${probe.health.engineVersion ?? ""} ready` :
        `Docker Sage unavailable: ${probe.health.status || "p-adic capability missing"}`);
    }).catch((error) => { if (!cancelled) { setReady(false); setRuntimeMessage(String(error)); } });
    return () => { cancelled = true; generation.current += 1; active.current?.cancel(); };
  }, []);
  useEffect(() => {
    generation.current += 1; active.current?.cancel(); active.current = null;
    setBusy(false); setSelectedId(null); setMessage("");
  }, [project?.identity.id]);
  const kind = domain === "Zp" ? "integer-ring" : "rational-field";
  const parent = project?.algebraObjects?.find((entry) => !entry.archived &&
    entry.revisions.at(-1)?.kind === kind);
  const record = parent?.revisions.at(-1);
  const target = parent && record ? { objectId: parent.id, revision: record.revision } : null;
  const evidence = (project?.algebraEvidence ?? []).filter((item) =>
    item.request.operation === "sage.numberTheory.padic" && item.request.params.domain === domain);
  const selected = evidence.find((item) => item.id === selectedId) ?? evidence.at(-1);
  const result = selected?.result as SagePadicResult | undefined;

  const saveParent = async () => {
    if (!project) return;
    setMessage("");
    try {
      const label = domain === "Zp" ? "ZZ" : "QQ";
      const next = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, `padic-${label}`),
        label, revision: 1, definition: { kind } });
      await onCreateStructure(next);
      setMessage(`Saved ${label} parent to the Project.`);
    } catch (error) { setMessage(String((error as Error).message ?? error)); }
  };
  const run = async () => {
    if (!project || !target || !ready) return;
    const token = ++generation.current;
    setMessage(""); setBusy(true);
    try {
      if (!/^[0-9]+$/.test(prime.trim()) || !/^[0-9]+$/.test(precision.trim()))
        throw new TypeError("Prime and precision must be whole numbers.");
      if (polynomial.trim() && !/^[0-9]+$/.test(seed.trim()))
        throw new TypeError("Enter a residue seed for Hensel lifting.");
      const request = buildAlgebraOperationRequest(project, target, "sage.numberTheory.padic", "docker", {
        prime: Number(prime.trim()), precision: Number(precision.trim()),
        a: parsePadicRationalText(a), b: parsePadicRationalText(b),
        hensel: polynomial.trim() ? { coefficients: polynomial.split(",").map((item) => item.trim()),
          seed: Number(seed.trim()) } : null,
      });
      const handle = sageExecutionRegistry.run({ operation: request.operation, params: request.params,
        backend: request.backend });
      active.current = handle;
      const { response, broker } = await handle.promise;
      if (token !== generation.current) return;
      if (!broker.ok || !response.success) throw new Error(response.error ?? "Sage p-adic operation failed.");
      if (response.engine !== "sagemath" || response.operation !== request.operation || !response.engineVersion)
        throw new Error("Sage response lacks matching operation and version provenance.");
      const saved = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects ?? [], request,
        response.result, { engine: "sagemath", version: response.engineVersion, backend: "docker",
          jobId: handle.jobId, elapsedMs: response.elapsedMs ?? 0, warnings: response.warnings });
      await onSaveEvidence(saved);
      if (token === generation.current) { setSelectedId(saved.id); setMessage("Saved precision-explicit p-adic evidence to Project."); }
    } catch (error) { if (token === generation.current) setMessage(String((error as Error).message ?? error)); }
    finally { if (token === generation.current) { setBusy(false); active.current = null; } }
  };
  return <section data-testid="number-theory-padic-workspace" aria-label="p-adic workspace"
    style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 12, marginBottom: 12,
      display: "grid", gap: 9, fontSize: 12 }}>
    <h2 style={{ margin: 0, fontSize: 16 }}>p-adic workspace</h2>
    <p style={{ margin: 0 }}>Finite precision is explicit. A displayed O(p^N) means the value is
      undetermined beyond that precision; it does not assert exact zero.</p>
    <div role="status" data-testid="padic-runtime-status">{runtimeMessage}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
      <label>Domain<select style={field} value={domain} onChange={(event) => { setDomain(event.target.value as "Zp" | "Qp");
        setSelectedId(null); }}><option value="Zp">Zp over saved ZZ</option><option value="Qp">Qp over saved QQ</option></select></label>
      <label>Prime p<input style={field} inputMode="numeric" value={prime} onChange={(event) => setPrime(event.target.value)} /></label>
      <label>Precision digits N<input style={field} inputMode="numeric" value={precision}
        onChange={(event) => setPrecision(event.target.value)} /></label>
      <label>Operand a<input style={field} value={a} onChange={(event) => setA(event.target.value)} /></label>
      <label>Operand b<input style={field} value={b} onChange={(event) => setB(event.target.value)} /></label>
    </div>
    <small>{domain === "Zp" ? "Zp operands are exact integers." : "Qp operands are exact reduced rationals such as 1/5."}
      {record ? ` Pinned parent: ${record.label}@${record.revision}.` : " Save the matching parent to run."}</small>
    <details><summary>Optional simple-root Hensel lift</summary>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, marginTop: 7 }}>
        <label>Polynomial coefficients, constant first<input style={field} value={polynomial}
          onChange={(event) => setPolynomial(event.target.value)} /></label>
        <label>Root seed modulo p<input style={field} inputMode="numeric" value={seed}
          onChange={(event) => setSeed(event.target.value)} /></label>
      </div><small>Clear the coefficients to run arithmetic without Hensel lifting. The seed must be a simple root modulo p.</small>
    </details>
    <div>{!parent && project && <button type="button" onClick={() => { void saveParent(); }}>
      Save {domain === "Zp" ? "ZZ" : "QQ"} parent to Project</button>}
      <button type="button" disabled={!project || !parent || !ready || busy} onClick={() => { void run(); }}>
        Run and save p-adic study</button>
      {busy && <button type="button" onClick={() => { generation.current += 1; active.current?.cancel(); active.current = null;
        setBusy(false); setMessage("p-adic operation cancelled."); }}>Cancel</button>}</div>
    {message && <div role="status" data-testid="padic-run-status">{message}</div>}
    {evidence.length > 0 && <label>Saved p-adic studies<select style={field} value={selected?.id ?? ""}
      onChange={(event) => setSelectedId(event.target.value)}>{evidence.map((item) => <option key={item.id} value={item.id}>
        {item.runtime.version} · {String(item.request.params.domain)}({String(item.request.params.prime)}) ·
        precision {String(item.request.params.precision)} · {item.runtime.jobId}</option>)}</select></label>}
    {result && <section data-testid="padic-saved-result" aria-label="Saved p-adic result" style={{ display: "grid", gap: 8 }}>
      <strong>{result.domain}({result.prime}) · requested precision {result.precision} digits</strong>
      <div>Saved against {selected?.request.target.objectId}@{selected?.request.target.revision} ·
        Sage {selected?.runtime.version}</div>
      <div style={{ overflowX: "auto" }}><table><thead><tr><th>Value</th><th>Exact source</th>
        <th>p-adic display</th><th>Valuation</th><th>Absolute precision</th>
        <th>Relative precision</th><th>Zero status</th><th>Unit digits</th></tr></thead><tbody>
        {(["a", "b", "sum", "product"] as const).map((key) => { const item = result.entries[key];
          return <tr key={key}><th scope="row">{key}</th>
            <td>{item.source.numerator}/{item.source.denominator}</td><td>{item.text}</td>
            <td>{item.valuation ?? "unknown"}</td><td>{item.absolutePrecision === null ? "∞" : item.absolutePrecision}</td>
            <td>{item.relativePrecision}</td><td>{item.zeroStatus}{item.precisionLost ? " · precision lost" : ""}</td>
            <td>{item.digits.length ? `[${item.digits.join(", ")}]` : "—"}</td></tr>; })}
      </tbody></table></div>
      {result.hensel && <div>Hensel root of [{result.hensel.coefficients.join(", ")}], seed {result.hensel.seed}:
        residue {result.hensel.rootResidue} modulo {result.hensel.modulus}; absolute precision {result.hensel.absolutePrecision},
        relative precision {result.hensel.relativePrecision}; {result.hensel.zeroStatus}. {result.hensel.text}</div>}
    </section>}
  </section>;
}
