import React, { useCallback, useEffect, useMemo, useState } from "react";

type BusyState = "none" | "refresh" | `${ComputeEngineId}:${ComputeEngineAction}`;

const panelStyle: React.CSSProperties = {
  border: "1px solid #dbe4f0",
  borderRadius: 10,
  background: "#f8fbff",
  padding: "10px 12px",
  display: "grid",
  gap: 10,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 8,
  background: "#fff",
  padding: 10,
  display: "grid",
  gap: 8,
};

const buttonStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
};

const statusColor = (ok: boolean, warn = false) => (ok ? "#1f894f" : warn ? "#9a6700" : "#b42318");

const asErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
};

const actionLabel = (action: ComputeEngineAction): string => {
  if (action === "install") return "Install";
  if (action === "start") return "Start";
  if (action === "stop") return "Stop";
  if (action === "update") return "Update";
  if (action === "logs") return "Logs";
  return "Reset";
};

const ComputeEngineManagerPanel: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [snapshot, setSnapshot] = useState<ComputeEngineSnapshot | null>(null);
  const [busy, setBusy] = useState<BusyState>("none");
  const [message, setMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<ComputeEngineId, string>>({ sage: "", octave: "" });

  const api = typeof window !== "undefined" ? window.computeEngines : undefined;
  const dockerReady = !!snapshot?.docker.dockerAvailable && !!snapshot?.docker.composeAvailable;

  const refresh = useCallback(async () => {
    if (!api?.getStatus) {
      setMessage("Compute engine manager is unavailable in this runtime.");
      return;
    }
    setBusy("refresh");
    try {
      const next = await api.getStatus();
      setSnapshot(next);
      setMessage(null);
    } catch (error) {
      setMessage(asErrorMessage(error, "Failed to refresh compute engine status."));
    } finally {
      setBusy("none");
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const engines = useMemo(() => snapshot?.engines ?? [], [snapshot]);

  const runAction = async (engineId: ComputeEngineId, action: ComputeEngineAction) => {
    if (!api?.runAction) {
      setMessage("Compute engine manager is unavailable in this runtime.");
      return;
    }
    setBusy(`${engineId}:${action}`);
    setMessage(null);
    try {
      const result = await api.runAction(engineId, action);
      setSnapshot(result.snapshot);
      if (action === "logs") {
        setLogs((prev) => ({ ...prev, [engineId]: result.stdout || result.stderr || result.error || "" }));
      }
      setMessage(result.ok ? `${actionLabel(action)} completed.` : result.error || `${actionLabel(action)} failed.`);
    } catch (error) {
      setMessage(asErrorMessage(error, `${actionLabel(action)} failed.`));
    } finally {
      setBusy("none");
    }
  };

  const openDockerGuide = async () => {
    try {
      await api?.openDockerGuide?.();
    } catch (error) {
      setMessage(asErrorMessage(error, "Could not open Docker Desktop guide."));
    }
  };

  return (
    <div data-testid="compute-engine-manager" style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Compute Engines</div>
          {!embedded && <div style={{ fontSize: 11, color: "#667085" }}>Settings / Preferences</div>}
        </div>
        <button type="button" onClick={() => void refresh()} disabled={busy !== "none"} style={buttonStyle}>
          {busy === "refresh" ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <strong>Native Math3D</strong>
          <span style={{ color: "#1f894f" }}>Installed</span>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <strong>Docker runtime</strong>
          <span style={{ color: statusColor(dockerReady) }}>{dockerReady ? "available" : "missing"}</span>
        </div>
        {snapshot?.docker.dockerVersion && (
          <div style={{ fontSize: 11, color: "#475467" }}>
            Docker {snapshot.docker.dockerVersion}
            {snapshot.docker.composeVersion ? ` · Compose ${snapshot.docker.composeVersion}` : ""}
          </div>
        )}
        {!dockerReady && (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 11, color: "#b42318" }}>
              {snapshot?.docker.error || "Install Docker Desktop or Podman with Docker-compatible compose support."}
            </div>
            <button type="button" onClick={() => void openDockerGuide()} style={{ ...buttonStyle, justifySelf: "start" }}>
              Install Docker Desktop
            </button>
          </div>
        )}
      </div>

      {engines.map((engine) => {
        const engineBusy = busy.startsWith(`${engine.id}:`);
        const canStart = dockerReady && !engine.running;
        const canStop = dockerReady && engine.running;
        return (
          <div key={engine.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{engine.label}</strong>
              <span style={{ color: statusColor(engine.healthy, engine.installed) }}>
                {engine.healthy ? "available" : engine.installed ? engine.statusText : "not installed"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#475467", display: "grid", gap: 2 }}>
              <div>Container: {engine.containerName}</div>
              <div>Health: {engine.healthUrl}</div>
              {engine.version && <div>Engine: {engine.version}</div>}
              {engine.lastError && <div style={{ color: "#9a6700" }}>Health detail: {engine.lastError}</div>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button
                type="button"
                onClick={() => void runAction(engine.id, "install")}
                disabled={!dockerReady || busy !== "none"}
                style={buttonStyle}
              >
                {engineBusy && busy.endsWith(":install") ? "Installing..." : engine.installed ? "Reinstall" : "Install"}
              </button>
              <button
                type="button"
                onClick={() => void runAction(engine.id, "start")}
                disabled={!canStart || busy !== "none"}
                style={buttonStyle}
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => void runAction(engine.id, "stop")}
                disabled={!canStop || busy !== "none"}
                style={buttonStyle}
              >
                Stop
              </button>
              <button
                type="button"
                onClick={() => void runAction(engine.id, "update")}
                disabled={!dockerReady || busy !== "none"}
                style={buttonStyle}
              >
                Update
              </button>
              <button
                type="button"
                onClick={() => void runAction(engine.id, "logs")}
                disabled={!dockerReady || busy !== "none"}
                style={buttonStyle}
              >
                Logs
              </button>
              <button
                type="button"
                onClick={() => void runAction(engine.id, "reset")}
                disabled={!dockerReady || busy !== "none"}
                style={{ ...buttonStyle, color: "#b42318" }}
              >
                Reset
              </button>
            </div>
            {logs[engine.id] && (
              <pre
                style={{
                  margin: 0,
                  maxHeight: 180,
                  overflow: "auto",
                  background: "#0f172a",
                  color: "#e2e8f0",
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 10,
                }}
              >
                {logs[engine.id]}
              </pre>
            )}
          </div>
        );
      })}

      <details style={cardStyle}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Diagnostics</summary>
        <div style={{ marginTop: 8, fontSize: 11, color: "#475467", display: "grid", gap: 4 }}>
          <div>Advanced compose:</div>
          <code>docker compose -f engines/docker-compose.yml up -d sage-worker octave-worker</code>
          {snapshot && <div>Checked: {new Date(snapshot.checkedAt).toLocaleString()}</div>}
        </div>
      </details>

      {message && <div style={{ fontSize: 11, color: message.includes("failed") || message.includes("unavailable") ? "#b42318" : "#1f894f" }}>{message}</div>}
    </div>
  );
};

export default ComputeEngineManagerPanel;
