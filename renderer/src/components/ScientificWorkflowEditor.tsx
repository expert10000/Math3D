import React, { useEffect, useRef, useState } from "react";
import { generatableScientificWorkflowNodes, type ScientificEnvironment,
  type ScientificWorkflowRun, type ScientificWorkflowStep,
  type DiscoveryJsonSchema } from "@math3d/core";

type Draft = { id: string; operationId: string; input: string; parameters: string };

function scaffold(schema: DiscoveryJsonSchema): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.anyOf) return scaffold(schema.anyOf[0]);
  if (schema.type === "object") return Object.fromEntries((schema.required ?? []).map(key =>
    [key, scaffold(schema.properties?.[key] ?? { type: "null" })]));
  if (schema.type === "array") return [];
  if (schema.type === "string") return schema.enum?.[0] ?? "";
  if (schema.type === "integer" || schema.type === "number") return schema.minimum ?? 0;
  if (schema.type === "boolean") return false;
  return null;
}

export function ScientificWorkflowEditor({ environment, implementations }: {
  environment: ScientificEnvironment; implementations: readonly string[];
}) {
  const nodes = generatableScientificWorkflowNodes({ environment, implementations });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState(nodes[0]?.operationId ?? "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScientificWorkflowRun | null>(null);
  const workerRef = useRef<Worker | null>(null);
  useEffect(() => () => workerRef.current?.terminate(), []);
  if (!nodes.length) return null;

  const addStep = () => {
    const node = nodes.find(item => item.operationId === selected);
    if (!node) return;
    const suffix = drafts.length ? Math.max(...drafts.map(item => Number(item.id.replace(/^step/, "")) || 0)) + 1 : 1;
    setDrafts(current => [...current, { id: `step${suffix}`, operationId: node.operationId,
      input: JSON.stringify(scaffold(node.inputSchema), null, 2),
      parameters: JSON.stringify(scaffold(node.parameterSchema), null, 2) }]);
    setResult(null);
  };
  const update = (index: number, key: "id" | "input" | "parameters", value: string) =>
    setDrafts(current => current.map((item, at) => at === index ? { ...item, [key]: value } : item));
  const run = () => {
    try {
      const steps: ScientificWorkflowStep[] = drafts.map(item => ({
        id: item.id, operationId: item.operationId,
        input: JSON.parse(item.input), parameters: JSON.parse(item.parameters),
      }));
      workerRef.current?.terminate();
      const worker = new Worker(new URL("../workflows/scientificWorkflowWorker.ts",
        import.meta.url), { type: "module" });
      workerRef.current = worker;
      setError(null); setResult(null); setRunning(true);
      worker.onmessage = (event: MessageEvent<{ ok: true; result: ScientificWorkflowRun } |
        { ok: false; error: string }>) => {
        setRunning(false);
        if (event.data.ok) setResult(event.data.result);
        else setError(event.data.error);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      };
      worker.onerror = event => {
        setError(event.message || "Workflow failed."); setRunning(false);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      };
      worker.postMessage({ steps });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return <details data-testid="scientific-workflow-editor" style={{ border: "1px solid #aac9f5",
    borderRadius: 10, padding: 10, background: "white" }}>
    <summary>Workflow editor</summary>
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <small>Add verified operations in execution order. Reference an earlier result with
        {" "}<code>{'{"$from":"step1","path":"field"}'}</code> in an input port.
        Connections are checked against each operation contract.</small>
      <div><select aria-label="Workflow operation" value={selected}
        onChange={event => setSelected(event.target.value)}>
        {nodes.map(node => <option key={node.operationId} value={node.operationId}>
          {node.title}</option>)}
      </select> <button type="button" onClick={addStep}>Add step</button></div>
      {drafts.map((draft, index) => <fieldset key={`${index}-${draft.operationId}`}
        style={{ border: "1px solid #c9d9ee", display: "grid", gap: 5 }}>
        <legend>{index + 1}. {draft.operationId}</legend>
        <label>Step ID <input aria-label={`Step ${index + 1} ID`} value={draft.id}
          onChange={event => update(index, "id", event.target.value)} /></label>
        <label>Input JSON <textarea aria-label={`Step ${index + 1} input`} rows={6}
          value={draft.input} onChange={event => update(index, "input", event.target.value)} /></label>
        <label>Parameters JSON <textarea aria-label={`Step ${index + 1} parameters`} rows={3}
          value={draft.parameters}
          onChange={event => update(index, "parameters", event.target.value)} /></label>
        <button type="button" onClick={() => setDrafts(current =>
          current.filter((_, at) => at !== index))}>Remove step</button>
      </fieldset>)}
      <div><button type="button" disabled={!drafts.length || running} onClick={run}>
        Run workflow</button>{running && <span role="status"> Running…</span>}</div>
      {error && <div role="alert">{error}</div>}
      {result && <div role="status" style={{ display: "grid", gap: 6 }}>
        {result.steps.map(step => <details key={step.id}><summary>
          {step.id} · {step.operationId} · completed</summary>
          <pre style={{ overflow: "auto", maxHeight: 220 }}>
            {JSON.stringify(step.output, null, 2).slice(0, 12000)}</pre>
        </details>)}
      </div>}
    </div>
  </details>;
}
