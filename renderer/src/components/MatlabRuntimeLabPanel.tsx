import React, { useMemo, useState } from "react";
import { checkMatlabRuntimeHealth, runMatlabEig } from "../integrations/matlab/matlabRuntimeClient";
import { isSquareNumericMatrix, type MatlabEigResponse, type MatlabRuntimeHealthResponse } from "../integrations/matlab/matlabSchemas";

const DEFAULT_MATRIX_TEXT = JSON.stringify(
  [
    [1, 2],
    [3, 4],
  ],
  null,
  2
);

const parseMatrixFromInput = (text: string): number[][] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Matrix JSON is invalid.");
  }
  if (!isSquareNumericMatrix(parsed)) {
    throw new Error("Matrix must be square and contain only finite numbers.");
  }
  return parsed;
};

const fmt = (value: number) => value.toFixed(6).replace(/\.?0+$/, "");

export const MatlabRuntimeLabPanel: React.FC = () => {
  const [matrixText, setMatrixText] = useState(DEFAULT_MATRIX_TEXT);
  const [health, setHealth] = useState<MatlabRuntimeHealthResponse | null>(null);
  const [eig, setEig] = useState<MatlabEigResponse | null>(null);
  const [busy, setBusy] = useState<"none" | "health" | "eig">("none");
  const [error, setError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const rawSnapshot = useMemo(
    () => ({
      health,
      eig,
    }),
    [eig, health]
  );

  const onCheckRuntime = async () => {
    setBusy("health");
    setError(null);
    try {
      const response = await checkMatlabRuntimeHealth();
      setHealth(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check MATLAB runtime health.");
    } finally {
      setBusy("none");
    }
  };

  const onRunEig = async () => {
    setBusy("eig");
    setError(null);
    try {
      const matrix = parseMatrixFromInput(matrixText);
      const response = await runMatlabEig(matrix);
      setEig(response);
      if (!response.ok && response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run MATLAB eig demo.");
    } finally {
      setBusy("none");
    }
  };

  return (
    <details style={{ border: "1px solid #dbe2ea", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }} open>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>MATLAB Runtime Lab</summary>
      <div style={{ marginTop: 8, display: "grid", gap: 8, fontSize: 11 }}>
        <div style={{ color: "#475467" }}>
          Experimental Docker bridge for MATLAB Runtime (`/health`, `/eig`).
        </div>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Matrix JSON</span>
          <textarea
            value={matrixText}
            onChange={(event) => setMatrixText(event.target.value)}
            rows={6}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 11,
              borderRadius: 6,
              border: "1px solid #d0d7de",
              padding: 6,
              resize: "vertical",
            }}
          />
        </label>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" onClick={() => void onCheckRuntime()} disabled={busy !== "none"}>
            {busy === "health" ? "Checking..." : "Check Docker Runtime"}
          </button>
          <button type="button" onClick={() => void onRunEig()} disabled={busy !== "none"}>
            {busy === "eig" ? "Running..." : "Run eig demo"}
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={showRawJson}
              onChange={(event) => setShowRawJson(event.target.checked)}
            />
            Show raw JSON
          </label>
        </div>

        {health && (
          <div style={{ padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc" }}>
            <div><strong>Status:</strong> {health.status}</div>
            <div><strong>Runtime:</strong> {health.runtime}</div>
            <div><strong>Package loaded:</strong> {health.packageLoaded ? "yes" : "no"}</div>
            {health.mode && <div><strong>Mode:</strong> {health.mode}</div>}
            {health.warning && <div style={{ color: "#9a6700" }}><strong>Warning:</strong> {health.warning}</div>}
          </div>
        )}

        {eig?.ok && (
          <div style={{ padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff" }}>
            <div style={{ marginBottom: 6 }}>
              <strong>Input shape:</strong> [{eig.inputShape[0]}, {eig.inputShape[1]}] · <strong>elapsed:</strong>{" "}
              {eig.elapsedMs}ms
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong>Eigenvalues</strong>
              <div style={{ marginTop: 2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                {eig.eigenvalues.map((value, index) => (
                  <div key={`eig-value-${index}`}>lambda{index + 1} = {fmt(value)}</div>
                ))}
              </div>
            </div>
            <div>
              <strong>Eigenvectors</strong>
              <table style={{ marginTop: 4, borderCollapse: "collapse", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                <tbody>
                  {eig.eigenvectors.map((row, rowIndex) => (
                    <tr key={`eig-row-${rowIndex}`}>
                      {row.map((value, colIndex) => (
                        <td key={`eig-cell-${rowIndex}-${colIndex}`} style={{ border: "1px solid #e2e8f0", padding: "2px 6px" }}>
                          {fmt(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showRawJson && (
          <pre
            style={{
              margin: 0,
              background: "#0f172a",
              color: "#e2e8f0",
              borderRadius: 6,
              padding: 8,
              overflowX: "auto",
              maxHeight: 220,
            }}
          >
            {JSON.stringify(rawSnapshot, null, 2)}
          </pre>
        )}

        {error && <div style={{ color: "#b42318" }}>{error}</div>}
      </div>
    </details>
  );
};

export default MatlabRuntimeLabPanel;

