import { useState, type FormEvent } from "react";
import { createAlgebraObjectRecord, createProjectAlgebraObjectId, inspectProjectAlgebraFreshness,
  modulePresentationLabel, upsertMath3DProjectAlgebraObject,
  type AlgebraObjectRecord, type AlgebraObjectRef, type Math3DProject,
  type ModuleDefinition, type ModuleMapDefinition } from "@math3d/core";
import { selectedStructure, structureDisplay } from "./sageStructuresModel";

type Props = { project: Math3DProject; onCreate: (record: AlgebraObjectRecord) => void | Promise<void>;
  onCreated: (ref: AlgebraObjectRef) => void; onCancel: () => void };
type Mode = "free" | "presented" | "map";
const action = { border: "1px solid #b9cce3", borderRadius: 7, background: "#fff", color: "#183b70",
  padding: "7px 10px", cursor: "pointer", fontSize: 12 } as const;
const ref = (record: AlgebraObjectRecord): AlgebraObjectRef => ({ objectId: record.id, revision: record.revision });
const matrixFromText = (text: string, rows: number, columns: number): string[][] => columns === 0
  ? Array.from({ length: rows }, () => [])
  : text.trim().split(/\r?\n/).map((line) => line.split(",").map((cell) => cell.trim()));

/** Builds exact pinned module presentations and dimension-checked free-module maps. */
export default function SageModuleBuilder({ project, onCreate, onCreated, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>("free");
  const [label, setLabel] = useState("M");
  const [ringId, setRingId] = useState("");
  const [ambientRank, setAmbientRank] = useState("2");
  const [generatorNames, setGeneratorNames] = useState("e1, e2");
  const [relationRank, setRelationRank] = useState("2");
  const [relations, setRelations] = useState("2, 0\n0, 6");
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [mapMatrix, setMapMatrix] = useState("1, 0\n0, 1");
  const [preview, setPreview] = useState<{ signature: string; record: AlgebraObjectRecord } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const freshness = inspectProjectAlgebraFreshness(project);
  const currentRecords = (project.algebraObjects ?? []).filter((entry) => !entry.archived &&
    freshness.find((item) => item.objectId === entry.id)?.status === "fresh").map((entry) => entry.revisions.at(-1)!);
  const rings = currentRecords.filter((record) => record.kind === "integer-ring" || record.kind === "rational-field" ||
    (record.definition.kind === "polynomial-ring" && record.definition.variables.length <= 3 &&
      selectedStructure(project, record.definition.coefficientDomain)?.record.kind === "rational-field"));
  const ring = rings.find((item) => item.id === ringId) ?? rings[0];
  const freeModules = currentRecords.filter((record) => record.definition.kind === "module" &&
    record.definition.relationMap.domainRank === 0);
  const source = freeModules.find((item) => item.id === sourceId) ?? freeModules[0];
  const targetOptions = freeModules.filter((item) => source?.definition.kind === "module" &&
    item.definition.kind === "module" && item.definition.baseRing.objectId === source.definition.baseRing.objectId &&
    item.definition.baseRing.revision === source.definition.baseRing.revision);
  const target = targetOptions.find((item) => item.id === targetId) ?? targetOptions[0];
  const signature = JSON.stringify({ mode, label, ringId: ring?.id, ringRevision: ring?.revision,
    ambientRank, generatorNames, relationRank, relations, sourceId: source?.id, sourceRevision: source?.revision,
    targetId: target?.id, targetRevision: target?.revision, mapMatrix, projectRevision: project.identity.revision });
  const current = preview?.signature === signature ? preview.record : null;
  const validate = (event: FormEvent) => {
    event.preventDefault(); setError(""); setPreview(null);
    try {
      const name = label.trim();
      if (!name || name.length > 120 || project.algebraObjects?.some((entry) => !entry.archived &&
          entry.revisions.at(-1)?.label.toLocaleLowerCase() === name.toLocaleLowerCase()))
        throw new TypeError("Choose a unique module or map name of 1–120 characters in this Project.");
      let definition: ModuleDefinition | ModuleMapDefinition;
      if (mode === "map") {
        if (source?.definition.kind !== "module" || target?.definition.kind !== "module")
          throw new TypeError("Save a free module before creating a module map.");
        definition = { kind: "module-map", sourceModule: ref(source), targetModule: ref(target),
          domainRank: source.definition.ambientRank, codomainRank: target.definition.ambientRank,
          matrix: matrixFromText(mapMatrix, target.definition.ambientRank, source.definition.ambientRank) };
      } else {
        if (!ring) throw new TypeError("Save a ZZ, QQ or QQ polynomial ring before creating a module.");
        const n = Number(ambientRank), m = mode === "free" ? 0 : Number(relationRank);
        definition = { kind: "module", baseRing: ref(ring), ambientRank: n,
          generators: generatorNames.split(",").map((item) => item.trim()),
          relationMap: { domainRank: m, codomainRank: n, matrix: matrixFromText(relations, n, m) } };
      }
      const record = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, crypto.randomUUID()),
        revision: 1, label: name, definition });
      upsertMath3DProjectAlgebraObject(project, record);
      setPreview({ signature, record });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const save = async () => {
    if (!current || busy) return;
    setBusy(true); setError("");
    try { await onCreate(current); onCreated(ref(current)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <section data-testid="cas-module-builder" style={{ display: "grid", gap: 10, maxWidth: 680 }}>
    <h2 style={{ margin: 0 }}>New module or map</h2>
    <div style={{ fontSize: 12 }}>A presented module is R^n / im(A), with a typed relation map A:R^m → R^n.
      Free-module maps have a pinned source and target over the same ring.</div>
    <form onSubmit={validate} className="sage-structure-grid">
      <label>Object type<select aria-label="Module type" value={mode} onChange={(event) => {
        setMode(event.target.value as Mode); setLabel(event.target.value === "map" ? "Map F" : "M"); setPreview(null);
      }}><option value="free">Free module</option><option value="presented">Presented module</option>
        <option value="map">Free-module map</option></select></label>
      <label>Name<input aria-label="Module name" value={label} onChange={(event) => setLabel(event.target.value)}
        maxLength={120} required /></label>
      {mode !== "map" ? <>
        <label>Base ring<select aria-label="Module base ring" value={ring?.id ?? ""}
          onChange={(event) => setRingId(event.target.value)} required>
          {rings.length ? rings.map((item) => <option key={item.id} value={item.id}>{item.label}@{item.revision} · {structureDisplay(item, project)}</option>)
            : <option value="">Create ZZ, QQ or QQ[x] first</option>}</select></label>
        <label>Ambient rank n<input aria-label="Module ambient rank" type="number" min={1} max={6} value={ambientRank}
          onChange={(event) => setAmbientRank(event.target.value)} required /></label>
        <label style={{ gridColumn: "1 / -1" }}>Generator names, comma separated<input aria-label="Module generators"
          value={generatorNames} onChange={(event) => setGeneratorNames(event.target.value)} required /></label>
        {mode === "presented" && <><label>Relation rank m<input aria-label="Module relation rank" type="number"
          min={1} max={6} value={relationRank} onChange={(event) => setRelationRank(event.target.value)} required /></label>
          <label style={{ gridColumn: "1 / -1" }}>Relation matrix A: one row per ambient generator, comma separated columns
            <textarea aria-label="Module relation matrix" rows={5} maxLength={4096} value={relations}
              onChange={(event) => setRelations(event.target.value)} required /></label></>}
      </> : <>
        <label>Source free module<select aria-label="Module map source" value={source?.id ?? ""}
          onChange={(event) => { setSourceId(event.target.value); setTargetId(""); }} required>
          {freeModules.length ? freeModules.map((item) => <option key={item.id} value={item.id}>{item.label}@{item.revision}</option>)
            : <option value="">Create a free module first</option>}</select></label>
        <label>Target free module<select aria-label="Module map target" value={target?.id ?? ""}
          onChange={(event) => setTargetId(event.target.value)} required>
          {targetOptions.map((item) => <option key={item.id} value={item.id}>{item.label}@{item.revision}</option>)}</select></label>
        <label style={{ gridColumn: "1 / -1" }}>Map matrix: one row per target generator, comma separated source columns
          <textarea aria-label="Module map matrix" rows={5} maxLength={4096} value={mapMatrix}
            onChange={(event) => setMapMatrix(event.target.value)} required /></label>
      </>}
      <div style={{ display: "flex", gap: 8 }}><button type="submit" style={action} disabled={busy || (mode === "map" ? !source || !target : !ring)}>Validate & preview</button>
        <button type="button" style={action} onClick={onCancel}>Cancel</button></div>
    </form>
    {error && <div role="alert">{error}</div>}
    {current && <section data-testid="cas-module-preview" style={{ display: "grid", gap: 5,
      border: "1px solid #dbe2ea", borderRadius: 8, padding: 10 }}>
      <strong>{current.label}@1</strong>
      <div>{structureDisplay(current, project)}</div>
      {current.definition.kind === "module" ? <>
        <div>{modulePresentationLabel(current.definition, ring ? structureDisplay(ring, project) : "R")}</div>
        <div>Relation map: {current.definition.relationMap.domainRank} → {current.definition.ambientRank} ·
          {current.definition.relationMap.matrix.length} rows</div>
      </> : current.definition.kind === "module-map" ? <div>Map matrix:
        {current.definition.codomainRank} rows × {current.definition.domainRank} columns</div> : null}
      <div style={{ fontSize: 11, color: "#526477" }}>Definition and parent revisions are pinned; no module classification is inferred.</div>
      <button type="button" style={action} disabled={busy} onClick={() => { void save(); }}>Save to Project</button>
    </section>}
  </section>;
}
