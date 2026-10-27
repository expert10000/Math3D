import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { QuantumSceneOpenResponse } from "./QuantumScenePreview";
import type { ScientificSceneOpenResponse } from "./ScientificScenePreview";
import { PythonPublisherJob, type PreparedPythonPublisher } from "../scientificScene/pythonPublisherJob";

type Example = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["examples"]>>[number];
type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;

export function QuantumSceneExamples({ onOpened, onOpenedScientific, onClose }: {
  onOpened: (scene: Opened) => void;
  onOpenedScientific: (scene: Extract<ScientificSceneOpenResponse, { ok: true }>["scene"]) => void;
  onClose: () => void;
}) {
  const [examples, setExamples] = useState<Example[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preparedPublisher, setPreparedPublisher] = useState<PreparedPythonPublisher | null>(null);
  const runningPublisher = useRef<ReturnType<PythonPublisherJob["submit"]> | null>(null);
  useEffect(() => {
    let active = true;
    if (!window.quantumScenes?.examples) { setError("Bundled quantum examples require the Math3D desktop app."); return; }
    void window.quantumScenes.examples().then(items => { if (active) setExamples(items); })
      .catch(reason => { if (active) setError(`Example catalog unavailable: ${String((reason as Error)?.message ?? reason)}`); });
    return () => { active = false; };
  }, []);
  const open = async (id: string) => {
    if (!window.quantumScenes?.openExample || busy) return;
    setBusy(id); setError("");
    try {
      const result = await window.quantumScenes.openExample(id);
      if (result.ok) { onOpened(result); onClose(); }
      else if (!result.canceled) setError(`Example refused: ${result.error}`);
    } catch (reason) { setError(`Example refused: ${String((reason as Error)?.message ?? reason)}`); }
    finally { setBusy(null); }
  };
  const openScientific = async () => {
    if (!window.scientificScenes?.openExample || busy) { setError("Scientific example requires the desktop app."); return; }
    setBusy("sincos"); setError("");
    try {
      const result = await window.scientificScenes.openExample();
      if (result.ok) { onOpenedScientific(result.scene); onClose(); }
      else if (!result.canceled) setError(`Scientific example refused: ${result.error}`);
    } catch (reason) { setError(`Scientific example refused: ${String((reason as Error)?.message ?? reason)}`); }
    finally { setBusy(null); }
  };
  const openScientificDirectory = async () => {
    if (!window.scientificScenes?.openDirectory || busy) { setError("Scientific bundle import requires the desktop app."); return; }
    setBusy("external-scientific"); setError("");
    try {
      const result = await window.scientificScenes.openDirectory();
      if (result.ok) { onOpenedScientific(result.scene); onClose(); }
      else if (!result.canceled) setError(`Scientific bundle refused: ${result.error}`);
    } catch (reason) { setError(`Scientific bundle refused: ${String((reason as Error)?.message ?? reason)}`); }
    finally { setBusy(null); }
  };
  const preparePublisher = async (mode: "reference" | "custom") => {
    if (!window.scientificScenes?.preparePublisher || busy) { setError("Python publication requires the desktop app."); return; }
    setPreparedPublisher(null); setBusy("python-prepare"); setError("");
    try {
      const result = await window.scientificScenes.preparePublisher(mode);
      if (result.ok) setPreparedPublisher(result);
      else if (!result.canceled) setError(`Python publication refused: ${result.error}`);
    } catch (reason) { setError(`Python publication refused: ${String((reason as Error)?.message ?? reason)}`); }
    finally { setBusy(null); }
  };
  const runPublisher = async () => {
    if (!preparedPublisher || busy) return;
    setBusy("python-run"); setError("");
    try {
      const job = new PythonPublisherJob(preparedPublisher);
      const handle = job.submit();
      runningPublisher.current = handle;
      const result = await handle.promise;
      if (result.outcome.ok && result.scene) { onOpenedScientific(result.scene); onClose(); }
      else if (!result.outcome.ok) setError(`Python publication ${result.outcome.code}: ${result.outcome.message}`);
    } catch (reason) { setError(`Python publication failed: ${String((reason as Error)?.message ?? reason)}`); }
    finally { runningPublisher.current = null; setBusy(null); setPreparedPublisher(null); }
  };
  return createPortal(<div role="dialog" aria-modal="true" aria-label="Verified quantum examples"
    data-testid="quantum-scene-examples"
    style={{ position: "fixed", inset: 0, zIndex: 2902, background: "rgba(15,23,42,.72)", display: "grid", placeItems: "center", padding: 20 }}>
    <div style={{ width: "min(760px, 94vw)", maxHeight: "90vh", overflow: "auto", background: "var(--panel-strong, #fff)",
      color: "var(--text, #172033)", borderRadius: 12, padding: 20 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div><h2 style={{ margin: 0 }}>Verified quantum examples</h2>
          <p style={{ marginTop: 5 }}>Pinned Theory Lab exports. Open read-only in Math3D; no physics worker runs here.</p></div>
        <button type="button" onClick={onClose} disabled={Boolean(busy)}>Close</button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!examples.length && !error && <p role="status">Loading bundled scenes…</p>}
      {(["QWZ", "SSH", "Rice–Mele", "BHZ", "BBH", "Kitaev", "Weyl", "Nodal", "Landau", "Hofstadter", "Hydrogenic"] as const).map(model => {
        const group = examples.filter(example => example.model === model);
        return group.length ? <section key={model} aria-label={`${model} examples`}>
          <h3>{model}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {group.map(example => <button key={example.id} type="button" data-testid={`quantum-example-${example.id}`}
              disabled={Boolean(busy)} onClick={() => void open(example.id)}
              style={{ padding: 12, textAlign: "left", border: "1px solid var(--border, #cbd5e1)", borderRadius: 8,
                background: "var(--panel, #f8fafc)", color: "inherit" }}>
              <strong>{example.label}</strong><br /><small>{example.description}</small>
              {busy === example.id && <span role="status"> · Verifying…</span>}
            </button>)}
          </div>
        </section> : null;
      })}
      <section aria-label="Non-quantum scientific example">
        <h3>Scientific interchange proof</h3>
        <button type="button" data-testid="scientific-example-sincos" disabled={Boolean(busy)}
          onClick={() => void openScientific()} style={{ padding: 12, textAlign: "left",
            border: "1px solid var(--border, #cbd5e1)", borderRadius: 8,
            background: "var(--panel, #f8fafc)", color: "inherit" }}>
          <strong>sin(x) cos(y) · scalar surface</strong><br />
          <small>Non-quantum, source-backed grid through the same scientific-scene/v1 validator.</small>
          {busy === "sincos" && <span role="status"> · Verifying…</span>}
        </button>
        <div style={{ marginTop: 10 }}><button type="button" data-testid="scientific-open-directory"
          disabled={Boolean(busy)} onClick={() => void openScientificDirectory()}>
          Open external .sscene folder…
        </button></div>
        <p style={{ fontSize: 12 }}>External import currently previews only bounded 2D scalar height surfaces. Files are re-hashed on open and selection; producer claims are not authenticated. No Python process is started.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" data-testid="scientific-prepare-reference-publisher" disabled={Boolean(busy)}
            onClick={() => void preparePublisher("reference")}>Publish with reference Python script…</button>
          <button type="button" data-testid="scientific-prepare-publisher" disabled={Boolean(busy)}
            onClick={() => void preparePublisher("custom")}>Publish with custom Python script (trusted code)…</button>
        </div>
        <p style={{ fontSize: 12 }}>Reference mode uses the pinned script shipped with Math3D and offers an example JSON spec. Choose an independently installed Python 3.10+ executable. Custom scripts run with your account permissions; neither mode is a sandbox.</p>
        {preparedPublisher && <div data-testid="scientific-publisher-confirmation" style={{ marginTop: 12,
          padding: 12, border: "1px solid var(--border, #cbd5e1)", borderRadius: 8, overflowWrap: "anywhere" }}>
          <strong>Explicit local-code execution · {preparedPublisher.reference ? "Math3D reference publisher" : "custom script"}</strong>
          <p>Only click Run if you trust this Python executable and script. The output is verified before Math3D opens it; hashes do not authenticate the code or scientific claims.</p>
          <div>Python: <code>{preparedPublisher.executable}</code></div>
          <div>Script: <code>{preparedPublisher.script}</code> · SHA-256 <code>{preparedPublisher.scriptSha256}</code></div>
          <div>Spec: <code>{preparedPublisher.spec}</code> · SHA-256 <code>{preparedPublisher.specSha256}</code></div>
          <div>New output: <code>{preparedPublisher.output}</code></div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" data-testid="scientific-run-publisher" disabled={Boolean(busy)}
              onClick={() => void runPublisher()}>Run trusted Python publisher</button>
            {busy === "python-run" && <button type="button" data-testid="scientific-cancel-publisher"
              onClick={() => void runningPublisher.current?.cancel()}>Cancel job</button>}
            {!busy && <button type="button" onClick={() => setPreparedPublisher(null)}>Discard preparation</button>}
          </div>
        </div>}
        {busy === "python-run" && <p role="status">External Python publisher running; deadline 60 seconds…</p>}
      </section>
      <p style={{ fontSize: 12 }}>Bundled scenes retain immutable source hashes. For your own Lab result, use File → Open Theory Lab quantum scene (.qscene) or Open in Math3D from Theory Lab. For a producer-neutral .sscene, use File → Open scientific scene (.sscene).</p>
    </div>
  </div>, document.body);
}
