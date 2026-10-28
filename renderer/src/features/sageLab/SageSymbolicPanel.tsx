import React, { useMemo, useState } from "react";
import { checkSageHealth, isLocalSageOperation, runSageOperation } from "../../integrations/sage/sageClient";
import {
  SAGE_SYMBOLIC_OPERATIONS,
  type SageHealthResponse,
  type SageSymbolicOperation,
  type SageRunResponse,
} from "../../integrations/sage/sageSchemas";

const DEFAULT_EXPRESSION = "sin(x)^2 + cos(x)^2";

const OPERATION_LABELS: Record<SageSymbolicOperation, string> = {
  "sage.symbolic.simplify": "Simplify",
  "sage.symbolic.factor": "Factor",
  "sage.symbolic.expand": "Expand",
  "sage.symbolic.solve": "Solve",
  "sage.matrix.eigen_exact": "Exact eigen",
  "sage.matrix.charpoly": "Characteristic polynomial",
  "sage.polynomial.roots_exact": "Exact algebraic roots",
  "sage.polynomial.factor": "Exact polynomial factor",
  "sage.groebner.compute": "Groebner basis",
  "sage.numberTheory.gcd": "GCD",
  "sage.numberTheory.modInverse": "Mod inverse",
};

const panelStyle: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#fff",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 11,
  borderRadius: 6,
  border: "1px solid #d0d7de",
  padding: 6,
};

const resultText = (response: SageRunResponse | null): string => {
  if (!response) return "";
  const text = response.result.text;
  if (typeof text === "string") return text;
  const value = response.result.value;
  if (typeof value === "string") return value;
  return JSON.stringify(response.result, null, 2);
};

const SageSymbolicPanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [backend, setBackend] = useState<"local" | "docker">("local");
  const [operation, setOperation] = useState<SageSymbolicOperation>("sage.symbolic.simplify");
  const [expression, setExpression] = useState(DEFAULT_EXPRESSION);
  const [coefficientsText, setCoefficientsText] = useState("-1, 0, 1");
  const [variablesText, setVariablesText] = useState("x");
  const [health, setHealth] = useState<SageHealthResponse | null>(null);
  const [response, setResponse] = useState<SageRunResponse | null>(null);
  const [busy, setBusy] = useState<"none" | "health" | "run">("none");
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const localPolynomial = operation === "sage.polynomial.factor" || operation === "sage.polynomial.roots_exact";
  const localCapable = isLocalSageOperation(operation);
  const localSage = backend === "local" && localCapable;

  const variables = useMemo(
    () => variablesText.split(",").map((part) => part.trim()).filter(Boolean),
    [variablesText]
  );

  const onCheckHealth = async () => {
    setBusy("health");
    setError(null);
    try {
      setHealth(await checkSageHealth(localSage ? "local" : "docker"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check SageMath service.");
    } finally {
      setBusy("none");
    }
  };

  const onRun = async () => {
    setBusy("run");
    setError(null);
    setResponse(null);
    try {
      let jobId: string | undefined;
      let params: Record<string, unknown> = {
        expression,
        variables: variables.length ? variables : ["x"],
      };
      if (localSage) {
        if (!window.sageService?.run) {
          throw new Error("Local Sage operations require SageMath in WSL Ubuntu and the MATH3D desktop app or web proxy.");
        }
        jobId = crypto.randomUUID();
        setActiveJobId(jobId);
      }
      if (localPolynomial) {
        const coefficients = coefficientsText.split(",").map((part) => part.trim());
        if (
          coefficients.length < 2 || coefficients.length > 13 ||
          coefficients.some((value) => !/^-?(?:0|[1-9][0-9]{0,17})$/.test(value)) ||
          /^-?0$/.test(coefficients[coefficients.length - 1])
        ) {
          throw new Error("Enter 2–13 integer coefficients, constant first, with a nonzero leading coefficient (up to 18 digits each).");
        }
        params = localSage ? { coefficients } : {
          polynomial: coefficients.map((coefficient, index) => `(${coefficient})*x^${index}`).join(" + "),
          variables: ["x"],
        };
      }
      const result = await runSageOperation({
        operation,
        jobId,
        params,
        backend,
      });
      setResponse(result);
      if (!result.success && result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run SageMath operation.");
    } finally {
      setActiveJobId(null);
      setBusy("none");
    }
  };

  const onCancel = async () => {
    if (!activeJobId) return;
    try {
      const response = await window.sageService?.cancel(activeJobId);
      if (!response?.ok) setError("The Sage job has already finished.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel Sage job.");
    }
  };

  return (
    <details style={panelStyle} open>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Symbolic Mathematics</summary>
      <div style={{ marginTop: 8, display: "grid", gap: 8, fontSize: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700 }}>Engine</span>
          <select aria-label="SageMath backend" value={backend} disabled={busy !== "none"} onChange={(event) => {
            setBackend(event.target.value as "local" | "docker");
            setHealth(null);
            setResponse(null);
            setError(null);
          }}>
            <option value="local" disabled={!localCapable}>Local WSL</option>
            <option value="docker">Docker service</option>
          </select>
          <span>{localSage ? "Bounded local worker · 20-second limit" : "Separate Docker service"}</span>
          {health && (
            <span style={{ color: health.available ? "#1f894f" : "#b42318" }}>
              {health.engine}: {health.status}
            </span>
          )}
        </div>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Operation</span>
          <select value={operation} disabled={busy !== "none"} onChange={(event) => {
            const next = event.target.value as SageSymbolicOperation;
            setOperation(next);
            if (!isLocalSageOperation(next)) setBackend("docker");
            setError(null);
            setHealth(null);
            setResponse(null);
          }} style={fieldStyle}>
            {SAGE_SYMBOLIC_OPERATIONS.map((item) => (
              <option key={item} value={item}>
                {item === "sage.polynomial.roots_exact" && backend === "docker"
                  ? "Polynomial roots (rational, Docker)" : OPERATION_LABELS[item]}
              </option>
            ))}
          </select>
        </label>

          {!localCapable && <span>This operation currently requires the Docker SageMath service. The six symbolic and polynomial operations above can use either backend.</span>}

        {localPolynomial ? <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Integer coefficients (constant first)</span>
          <input value={coefficientsText} disabled={busy !== "none"} onChange={(event) => setCoefficientsText(event.target.value)} style={fieldStyle} placeholder="-1, 0, 1" />
          <span>Example: -1, 0, 1 means x² − 1. Local WSL receives only coefficients and supplies algebraic root certificates. Docker receives a polynomial built from those coefficients and currently returns roots over the rationals.</span>
        </label> : <>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Expression</span>
          <textarea
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            rows={compact ? 2 : 3}
            style={{ ...fieldStyle, resize: "vertical" }}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Variables</span>
          <input value={variablesText} onChange={(event) => setVariablesText(event.target.value)} style={fieldStyle} />
        </label>
        </>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" onClick={() => void onCheckHealth()} disabled={busy !== "none"}>
            {busy === "health" ? "Checking..." : localSage ? "Check local SageMath" : "Check Docker SageMath"}
          </button>
          <button type="button" onClick={() => void onRun()} disabled={busy !== "none"}>
            {busy === "run" ? "Running..." : "Run"}
          </button>
          {localSage && activeJobId && <button type="button" onClick={() => void onCancel()}>Cancel</button>}
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={showJson} onChange={(event) => setShowJson(event.target.checked)} />
            JSON
          </label>
        </div>

        {response && (
          <div style={{ padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc" }}>
            <div><strong>Success:</strong> {response.success ? "yes" : "no"}</div>
            <div><strong>Engine:</strong> {response.engine}</div>
            <div><strong>Backend:</strong> {backend === "local" ? "Local WSL" : "Docker service"}</div>
            {response.elapsedMs != null && <div><strong>Elapsed:</strong> {response.elapsedMs}ms</div>}
            {(response.operation === "sage.polynomial.factor" || response.operation === "sage.polynomial.roots_exact") && <>
              {localSage && <div><strong>Exact reconstruction:</strong> {response.result.verified === true ? "verified" : "not verified"}</div>}
              {typeof response.result.inputHash === "string" && <div><strong>Input SHA-256:</strong> <code>{response.result.inputHash}</code></div>}
              {Array.isArray(response.result.diagnostics) && response.result.diagnostics.map((diagnostic, index) =>
                typeof diagnostic === "string" ? <div key={index}><strong>Diagnostic:</strong> {diagnostic}</div> : null
              )}
            </>}
            {response.operation === "sage.polynomial.roots_exact" && Array.isArray(response.result.roots) && <div>
              <strong>{backend === "local"
                ? `Algebraic roots (${String(response.result.rootCount ?? "?")} counting multiplicity)`
                : `Rational roots (${response.result.roots.length} distinct)`}</strong>
              {response.result.roots.map((item, index) => {
                if (!item || typeof item !== "object") return null;
                const root = item as Record<string, unknown>;
                return <div key={index} style={{ marginTop: 4 }}>
                  <code>{String(root.approximation ?? root.value ?? "?")}</code> · multiplicity {String(root.multiplicity ?? "?")}
                  {Array.isArray(root.minimalPolynomialCoefficients) && <div>Minimal polynomial (constant first): <code>{root.minimalPolynomialCoefficients.join(", ")}</code></div>}
                  {root.isolatingInterval != null && <div>Isolating interval: <code>{String(root.isolatingInterval)}</code></div>}
                </div>;
              })}
            </div>}
            <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontFamily: fieldStyle.fontFamily }}>
              {showJson ? JSON.stringify(response, null, 2) : resultText(response)}
            </pre>
            {response.latex && <div style={{ marginTop: 6, wordBreak: "break-word" }}><strong>LaTeX:</strong> {response.latex}</div>}
          </div>
        )}

        {error && <div style={{ color: "#b42318" }}>{error}</div>}
      </div>
    </details>
  );
};

export default SageSymbolicPanel;
