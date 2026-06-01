import React, { useMemo, useState } from "react";
import { checkOctaveHealth, runOctaveEig, runOctaveSolve } from "../../integrations/octave/octaveClient";
import {
  isNumericVector,
  isSquareNumericMatrix,
  type OctaveEigResponse,
  type OctaveHealthResponse,
  type OctaveSolveResponse,
} from "../../integrations/octave/octaveSchemas";

const DEFAULT_MATRIX_TEXT = JSON.stringify(
  [
    [1, 2],
    [3, 4],
  ],
  null,
  2
);
const DEFAULT_RHS_TEXT = JSON.stringify([5, 11], null, 2);

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
const parseRhsFromInput = (text: string): number[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("rhs JSON is invalid.");
  }
  if (!isNumericVector(parsed)) {
    throw new Error("rhs must be a numeric vector.");
  }
  return parsed;
};

const fmt = (value: number) => value.toFixed(6).replace(/\.?0+$/, "");

const OctaveLabPanel: React.FC = () => {
  const [matrixText, setMatrixText] = useState(DEFAULT_MATRIX_TEXT);
  const [rhsText, setRhsText] = useState(DEFAULT_RHS_TEXT);
  const [health, setHealth] = useState<OctaveHealthResponse | null>(null);
  const [eig, setEig] = useState<OctaveEigResponse | null>(null);
  const [solve, setSolve] = useState<OctaveSolveResponse | null>(null);
  const [busy, setBusy] = useState<"none" | "health" | "eig" | "solve">("none");
  const [error, setError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const rawSnapshot = useMemo(
    () => ({
      health,
      eig,
      solve,
    }),
    [eig, health, solve]
  );

  const onCheckRuntime = async () => {
    setBusy("health");
    setError(null);
    try {
      const response = await checkOctaveHealth();
      setHealth(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check Octave runtime health.");
    } finally {
      setBusy("none");
    }
  };

  const onRunEig = async () => {
    setBusy("eig");
    setError(null);
    try {
      const matrix = parseMatrixFromInput(matrixText);
      const response = await runOctaveEig(matrix);
      setEig(response);
      if (!response.ok && response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run Octave eig demo.");
    } finally {
      setBusy("none");
    }
  };
  const onRunSolve = async () => {
    setBusy("solve");
    setError(null);
    try {
      const matrix = parseMatrixFromInput(matrixText);
      const rhs = parseRhsFromInput(rhsText);
      const response = await runOctaveSolve(matrix, rhs);
      setSolve(response);
      if (!response.ok && response.error) {
        setError(response.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run Octave linear solve demo.");
    } finally {
      setBusy("none");
    }
  };

  return (
    <details style={{ border: "1px solid #dbe2ea", borderRadius: 8, padding: "8px 10px", marginTop: 4 }} open>
      <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Octave Lab</summary>
      <div style={{ marginTop: 8, display: "grid", gap: 8, fontSize: 11 }}>
        <div style={{ color: "#475467" }}>
          Docker bridge for GNU Octave (`/health`, `/eig`, `/solve`).
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
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>RHS JSON (for A\b)</span>
          <textarea
            value={rhsText}
            onChange={(event) => setRhsText(event.target.value)}
            rows={3}
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
            {busy === "health" ? "Checking..." : "Check Octave Docker"}
          </button>
          <button type="button" onClick={() => void onRunEig()} disabled={busy !== "none"}>
            {busy === "eig" ? "Running..." : "Run eig()"}
          </button>
          <button type="button" onClick={() => void onRunSolve()} disabled={busy !== "none"}>
            {busy === "solve" ? "Running..." : "Run solve A\\b"}
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
            <div><strong>Engine:</strong> {health.engine}</div>
            <div><strong>Available:</strong> {health.available ? "yes" : "no"}</div>
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
        {solve?.ok && (
          <div style={{ padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff" }}>
            <div style={{ marginBottom: 6 }}>
              <strong>Input shape:</strong> [{solve.inputShape[0]}, {solve.inputShape[1]}] · <strong>elapsed:</strong>{" "}
              {solve.elapsedMs}ms
            </div>
            <div style={{ marginBottom: 6 }}>
              <strong>Solution x (A\\b)</strong>
              <div style={{ marginTop: 2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                {solve.solution.map((value, index) => (
                  <div key={`solve-value-${index}`}>x{index + 1} = {fmt(value)}</div>
                ))}
              </div>
            </div>
            <div>
              <strong>Residual norm:</strong> {fmt(solve.residualNorm)}
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

export default OctaveLabPanel;
