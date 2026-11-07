import { useEffect, useRef, useState } from "react";
import type { AlgebraObjectRef, AlgebraRouteCapability, Math3DProject } from "@math3d/core";
import { sageExecutionRegistry } from "../../services/sageOperationExecution";
import { sagePaletteCommands, searchSagePaletteCommands, type SagePaletteAction } from "./sageCommandPaletteModel";

type Props = { project: Math3DProject | null; target: AlgebraObjectRef | null;
  locusAvailable: boolean; onAction: (action: SagePaletteAction) => void };

export default function SageCommandPalette({ project, target, locusAvailable, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [routes, setRoutes] = useState<readonly AlgebraRouteCapability[]>([]);
  const [checking, setChecking] = useState(false);
  const [probeError, setProbeError] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const refresh = async () => {
    setChecking(true); setProbeError("");
    try {
      const probes = await Promise.all([sageExecutionRegistry.probeBackend("docker"),
        sageExecutionRegistry.probeBackend("private")]);
      setRoutes(probes.map((probe) => ({ backend: probe.backend as "docker" | "private",
        available: probe.health.available, operations: probe.operations.map((item) => item.operationType),
        reason: probe.health.available ? undefined : probe.health.status })));
    } catch (error) { setRoutes([]); setProbeError(String((error as Error).message ?? error)); }
    finally { setChecking(false); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!open) { returnFocus.current = document.activeElement as HTMLElement; setOpen(true); }
        else setOpen(false);
      } else if (event.key === "Escape" && open) { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); }
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, [open]);
  useEffect(() => { if (open) input.current?.focus(); else returnFocus.current?.focus(); }, [open]);
  const commands = searchSagePaletteCommands(sagePaletteCommands(project, target, routes, locusAvailable), query);
  const choose = (action: SagePaletteAction) => { setOpen(false); setQuery(""); onAction(action); };
  const move = (direction: number) => {
    if (!commands.some((item) => item.enabled)) return;
    for (let step = 1; step <= commands.length; step += 1) {
      const next = (active + direction * step + commands.length * (step + 1)) % commands.length;
      if (commands[next].enabled) { setActive(next); return; }
    }
  };
  return <div data-testid="cas-command-palette">
    <button type="button" onClick={(event) => { returnFocus.current = event.currentTarget; setOpen(true); }}>
      Search mathematics commands · Ctrl+K</button>
    {open && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 2400, background: "#10223888", display: "flex",
        justifyContent: "center", alignItems: "flex-start", padding: "8vh 14px" }}>
      <section role="dialog" aria-modal="true" aria-label="Mathematics command palette"
        onKeyDown={(event) => { if (event.key !== "Tab") return;
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
          if (event.shiftKey && document.activeElement === controls[0]) {
            event.preventDefault(); controls[controls.length - 1]?.focus();
          } else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) {
            event.preventDefault(); controls[0]?.focus();
          }
        }}
        data-testid="cas-command-dialog" style={{ width: "min(680px, 100%)", maxHeight: "80vh", overflow: "auto",
          background: "#fff", borderRadius: 12, boxShadow: "0 18px 45px #10223855", padding: 14,
          display: "grid", gap: 8, color: "#172b4d" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input ref={input} role="combobox" aria-expanded="true" aria-controls="cas-command-results"
            aria-activedescendant={commands[active] ? `cas-command-option-${active}` : undefined}
            aria-label="Search mathematics commands" value={query} placeholder="smith, prime decomposition, factor over, tangent cone…"
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); move(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Enter" && commands[active]?.enabled) {
              event.preventDefault(); choose(commands[active].action);
            } }} style={{ flex: 1, padding: 9, fontSize: 14 }} />
          <button type="button" onClick={() => setOpen(false)}>Close</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "#526477" }}>
          <span>{target ? "Commands for the selected structure revision" : "Select a saved structure for object commands"}</span>
          <button type="button" disabled={checking} onClick={() => { void refresh(); }}>Refresh capabilities</button>
        </div>
        {checking && <div role="status">Checking Sage route capabilities…</div>}
        {probeError && <div role="status">Runtime check failed: {probeError}</div>}
        <div id="cas-command-results" role="listbox" aria-label="Matching mathematics commands" style={{ display: "grid", gap: 4 }}>
          {commands.length ? commands.map((command, index) => <div key={command.key} role="option"
            id={`cas-command-option-${index}`} aria-selected={index === active} data-testid={`cas-command-${command.key}`}
            style={{ border: index === active ? "2px solid #3378bd" : "1px solid #dbe2ea", borderRadius: 7, padding: 7 }}>
            <button type="button" disabled={!command.enabled} onMouseEnter={() => setActive(index)}
              onClick={() => choose(command.action)} style={{ textAlign: "left", width: "100%", fontWeight: 600 }}>
              {command.label}</button>
            <div style={{ fontSize: 11, color: command.enabled ? "#526477" : "#9a3412" }}>
              {command.group}{command.reason ? ` · Why unavailable: ${command.reason}` : " · Available"}</div>
          </div>) : <div role="status">No commands match this search and selected structure.</div>}
        </div>
        <div style={{ fontSize: 11, color: "#526477" }}>↑ ↓ choose · Enter open · Esc close</div>
      </section>
    </div>}
  </div>;
}
