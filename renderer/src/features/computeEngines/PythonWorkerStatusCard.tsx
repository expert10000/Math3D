import React, { useCallback, useEffect, useState } from "react";
import { cgalHealth } from "../../services/cgalMeshClient";
import {
  getPythonWorkerDiagnostics,
  type PythonWorkerDiagnosticsSnapshot,
} from "../../services/pythonWorkerDiagnosticsClient";

const cardStyle: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 8,
  background: "#fff",
  padding: 10,
  display: "grid",
  gap: 8,
};

const detailStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#475467",
  overflowWrap: "anywhere",
};

function formatTime(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value).toLocaleString()
    : "not available";
}

function formatBytes(value: number): string {
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

export default function PythonWorkerStatusCard() {
  const [status, setStatus] = useState<PythonWorkerDiagnosticsSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setStatus(await getPythonWorkerDiagnostics());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const checkWorker = async () => {
    setChecking(true);
    setActionError(null);
    try {
      const result = await cgalHealth();
      setStatus(await getPythonWorkerDiagnostics());
      if (!result.ok) setActionError(result.error ?? "Worker health check failed.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Worker health check failed.");
      setStatus(await getPythonWorkerDiagnostics());
    } finally {
      setChecking(false);
    }
  };

  const availability = !status || !status.startupChecked
    ? "not checked"
    : status.available ? "available" : "unavailable";
  const availabilityColor = availability === "available" ? "#1f894f" : availability === "not checked" ? "#9a6700" : "#b42318";

  return (
    <section data-testid="python-worker-status" style={cardStyle} aria-label="Python worker">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong>Python worker · CGAL / VTK</strong>
        <span data-testid="python-worker-availability" style={{ color: availabilityColor }}>{availability}</span>
      </div>
      <div role="status" style={detailStyle}>
        {status?.statusMessage ?? "Reading worker diagnostics..."}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => void refresh()} disabled={refreshing || checking} style={{ fontSize: 11, padding: "4px 8px" }}>
          {refreshing ? "Refreshing..." : "Refresh worker status"}
        </button>
        <button type="button" onClick={() => void checkWorker()} disabled={refreshing || checking} style={{ fontSize: 11, padding: "4px 8px" }}>
          {checking ? "Checking..." : status?.available ? "Run health check" : "Retry worker startup"}
        </button>
        {status && <span style={detailStyle}>Checked: {formatTime(status.lastCheckAt)}</span>}
      </div>
      {actionError && <div role="alert" style={{ ...detailStyle, color: "#b42318" }}>{actionError}</div>}
      {status && (
        <details style={detailStyle}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Worker details</summary>
          <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
            <div>Runtime: {status.backend ?? "not reported"}</div>
            <div>Version: {status.version ?? "not reported"}</div>
            <div>Protocol: {status.protocol ?? "not reported"}</div>
            {status.admission && (
              <div>Jobs: {status.admission.active} active, {status.admission.queued} queued ({formatBytes(status.admission.queuedBytes)} queued input)</div>
            )}
            {status.restartFailuresInWindow != null && (
              <div>Recent restart failures: {status.restartFailuresInWindow}</div>
            )}
            {status.restartRetryAfter && (
              <div>Restart available after: {formatTime(status.restartRetryAfter)}</div>
            )}
            {status.lastError && (
              <div style={{ color: "#b42318" }}>
                Last failure ({status.lastError.category}, {status.lastError.code}) at {formatTime(status.lastError.at)}: {status.lastError.detail || status.lastError.message}
              </div>
            )}
            <div>Diagnostic log: {status.logPath || "not available in this runtime"}</div>
          </div>
        </details>
      )}
    </section>
  );
}
