import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { QuantumSceneOpenResponse } from "./QuantumScenePreview";

type Example = Awaited<ReturnType<NonNullable<Window["quantumScenes"]>["examples"]>>[number];
type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;

export function QuantumSceneExamples({ onOpened, onClose }: { onOpened: (scene: Opened) => void; onClose: () => void }) {
  const [examples, setExamples] = useState<Example[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
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
      {(["QWZ", "SSH", "Hydrogenic"] as const).map(model => {
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
      <p style={{ fontSize: 12 }}>Bundled scenes retain immutable source hashes. For your own Lab result, use File → Open verified quantum scene or Open in Math3D from Theory Lab.</p>
    </div>
  </div>, document.body);
}
