import React, { useMemo, useState } from "react";
import { checkSageHealth, runSageOperation } from "../../integrations/sage/sageClient";
import {
  SAGE_OPERATIONS,
  type SageHealthResponse,
  type SageOperation,
  type SageRunResponse,
} from "../../integrations/sage/sageSchemas";

const DEFAULT_EXPRESSION = "sin(x)^2 + cos(x)^2";

const OPERATION_LABELS: Record<SageOperation, string> = {
  "sage.symbolic.simplify": "Simplify",
  "sage.symbolic.factor": "Factor",
  "sage.symbolic.expand": "Expand",
  "sage.symbolic.solve": "Solve",
  "sage.matrix.eigen_exact": "Exact eigen",
  "sage.matrix.charpoly": "Characteristic polynomial",
  "sage.polynomial.roots_exact": "Exact roots",
  "sage.polynomial.factor": "Polynomial factor",
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
  const [engine, setEngine] = useState<"auto" | "sagemath">("auto");
  const [operation, setOperation] = useState<SageOperation>("sage.symbolic.simplify");
  const [expression, setExpression] = useState(DEFAULT_EXPRESSION);
  const [variablesText, setVariablesText] = useState("x");
  const [health, setHealth] = useState<SageHealthResponse | null>(null);
  const [response, setResponse] = useState<SageRunResponse | null>(null);
  const [busy, setBusy] = useState<"none" | "health" | "run">("none");
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const variables = useMemo(
    () => variablesText.split(",").map((part) => part.trim()).filter(Boolean),
    [variablesText]
  );

  const onCheckHealth = async () => {
    setBusy("health");
    setError(null);
    try {
      setHealth(await checkSageHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check SageMath service.");
    } finally {
      setBusy("none");
    }
  };

  const onRun = async () => {
    setBusy("run");
    setError(null);
    try {
      const result = await runSageOperation({
        operation,
        params: {
          expression,
          variables: variables.length ? variables : ["x"],
        },
      });
      setResponse(result);
      if (!result.success && result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run SageMath operation.");
    } finally {
      setBusy("none");
    }
  };

  return (
    <details style={panelStyle} open>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Symbolic Mathematics</summary>
      <div style={{ marginTop: 8, display: "grid", gap: 8, fontSize: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700 }}>Engine</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input type="radio" checked={engine === "auto"} onChange={() => setEngine("auto")} />
            Auto
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input type="radio" checked={engine === "sagemath"} onChange={() => setEngine("sagemath")} />
            SageMath
          </label>
          {health && (
            <span style={{ color: health.available ? "#1f894f" : "#b42318" }}>
              {health.engine}: {health.status}
            </span>
          )}
        </div>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Operation</span>
          <select value={operation} onChange={(event) => setOperation(event.target.value as SageOperation)} style={fieldStyle}>
            {SAGE_OPERATIONS.map((item) => (
              <option key={item} value={item}>
                {OPERATION_LABELS[item]}
              </option>
            ))}
          </select>
        </label>

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

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" onClick={() => void onCheckHealth()} disabled={busy !== "none"}>
            {busy === "health" ? "Checking..." : "Check SageMath"}
          </button>
          <button type="button" onClick={() => void onRun()} disabled={busy !== "none"}>
            {busy === "run" ? "Running..." : "Run"}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={showJson} onChange={(event) => setShowJson(event.target.checked)} />
            JSON
          </label>
        </div>

        {response && (
          <div style={{ padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc" }}>
            <div><strong>Success:</strong> {response.success ? "yes" : "no"}</div>
            <div><strong>Engine:</strong> {response.engine}</div>
            {response.elapsedMs != null && <div><strong>Elapsed:</strong> {response.elapsedMs}ms</div>}
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
