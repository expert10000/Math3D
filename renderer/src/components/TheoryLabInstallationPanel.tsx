import { useEffect, useState } from "react";

type TargetStatus = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["theoryLabTargetStatus"]>>;

export default function TheoryLabInstallationPanel() {
  const [status, setStatus] = useState<TargetStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bridge = window.quantumScenes;

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge.theoryLabTargetStatus().then(value => { if (active) setStatus(value); },
      reason => { if (active) setError(String(reason)); });
    return () => { active = false; };
  }, [bridge]);

  async function refresh() {
    if (!bridge) return;
    setBusy(true); setError("");
    try { setStatus(await bridge.theoryLabTargetStatus()); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }

  async function choose(kind: "installed" | "checkout") {
    if (!bridge) return;
    setBusy(true); setError("");
    try { setStatus(await bridge.configureTheoryLabTarget(kind)); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }

  return <section data-testid="settings-theory-lab-installation" style={{ border: "1px solid #cbd5e1", borderRadius: 10,
    background: "#f8fbff", padding: "12px", display: "grid", gap: 8 }}>
    <div style={{ fontSize: 13, fontWeight: 850, color: "#1e3a8a" }}>Theory Lab installation</div>
    <div style={{ fontSize: 11, color: "#475569" }}>Used by “Open source run in Theory Lab”. Math3D validates the selected app before launching an exact saved run.</div>
    {!bridge ? <div>Available in the desktop app.</div> : <>
      <div data-testid="settings-theory-lab-status" role="status" style={{ fontSize: 12 }}>
        {status?.state === "ready" ? `Ready · ${status.kind === "installed" ? "installed application" : "source checkout"}` :
          status?.state === "invalid" ? "Invalid installation" : status?.state === "unconfigured" ? "No installation selected" : "Checking installation…"}
        {status?.source === "environment" ? " · environment override" : ""}
      </div>
      {status?.path && <code data-testid="settings-theory-lab-path" style={{ fontSize: 11, overflowWrap: "anywhere" }}>{status.path}</code>}
      {status?.error && <div role="alert" style={{ color: "#991b1b", fontSize: 11 }}>{status.error}</div>}
      {error && <div role="alert" style={{ color: "#991b1b", fontSize: 11 }}>{error}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" data-testid="settings-theory-lab-choose-installed" disabled={busy || status?.source === "environment"}
          onClick={() => void choose("installed")}>Choose installed application…</button>
        <button type="button" disabled={busy || status?.source === "environment"} onClick={() => void choose("checkout")}>Choose source checkout…</button>
        <button type="button" data-testid="settings-theory-lab-validate" disabled={busy} onClick={() => void refresh()}>Validate again</button>
      </div>
    </>}
  </section>;
}
