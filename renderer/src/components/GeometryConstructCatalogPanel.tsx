import React, { useEffect, useMemo, useState } from "react";
import type { GeometryGalleryRecipe } from "../geometry/objectGalleryCatalog";
import {
  DEFAULT_GEOMETRY_CONSTRUCT_PARAMETER_VALUES,
  GEOMETRY_CONSTRUCT_FAMILIES,
  GEOMETRY_CONSTRUCT_TOOL_BY_ID,
  buildGeometryConstructRecipe,
  geometryConstructSourcesReady,
  type GeometryConstructParameter,
  type GeometryConstructTool,
} from "../geometry/constructCatalog";

type GeometryConstructReference = { id: string; label: string };

type GeometryConstructCatalogPanelProps = {
  references: readonly GeometryConstructReference[];
  selectedReferenceIds: readonly string[];
  onPreviewRecipeChange: (recipe: GeometryGalleryRecipe | null) => void;
  onCommit: (recipe: GeometryGalleryRecipe, tool: GeometryConstructTool, sourceObjectIds: readonly string[]) => void;
  onOpenLegacy: (target: NonNullable<GeometryConstructTool["legacyTarget"]>) => void;
};

const panelStyle: React.CSSProperties = {
  border: "1px solid #93c5fd",
  borderRadius: 9,
  background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
  padding: 8,
  display: "grid",
  gap: 8,
};

const toolButtonStyle = (selected: boolean): React.CSSProperties => ({
  border: `1px solid ${selected ? "#2563eb" : "#cbd5e1"}`,
  borderRadius: 7,
  background: selected ? "#dbeafe" : "#ffffff",
  color: "#0f172a",
  minHeight: 48,
  padding: "6px 7px",
  display: "grid",
  gap: 2,
  textAlign: "left",
  alignContent: "center",
});

const stepStyle = (active: boolean, complete: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? "#2563eb" : complete ? "#86efac" : "#cbd5e1"}`,
  borderRadius: 999,
  background: active ? "#dbeafe" : complete ? "#f0fdf4" : "#f8fafc",
  color: active ? "#1d4ed8" : complete ? "#166534" : "#64748b",
  padding: "2px 7px",
  fontSize: 9.5,
  fontWeight: 800,
});

const normalizeSourceIds = (
  tool: GeometryConstructTool,
  selected: readonly string[],
  references: readonly GeometryConstructReference[]
) => Array.from({ length: tool.referenceCount }, (_, index) => selected[index] ?? references[index]?.id ?? "");

export const GeometryConstructCatalogPanel: React.FC<GeometryConstructCatalogPanelProps> = ({
  references,
  selectedReferenceIds,
  onPreviewRecipeChange,
  onCommit,
  onOpenLegacy,
}) => {
  const [search, setSearch] = useState("");
  const [openFamilyIds, setOpenFamilyIds] = useState<Set<string>>(() => new Set(["primitives", "reference"]));
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [sourceObjectIds, setSourceObjectIds] = useState<string[]>([]);
  const [parameters, setParameters] = useState<Partial<Record<GeometryConstructParameter["id"], number>>>({
    ...DEFAULT_GEOMETRY_CONSTRUCT_PARAMETER_VALUES,
  });
  const selectedTool = selectedToolId ? GEOMETRY_CONSTRUCT_TOOL_BY_ID.get(selectedToolId) ?? null : null;
  const sourcesReady = selectedTool ? geometryConstructSourcesReady(selectedTool, sourceObjectIds) : false;
  const previewRecipe = useMemo(
    () => selectedTool && sourcesReady
      ? buildGeometryConstructRecipe(selectedTool, parameters, sourceObjectIds)
      : null,
    [parameters, selectedTool, sourceObjectIds, sourcesReady]
  );

  useEffect(() => {
    onPreviewRecipeChange(previewRecipe);
  }, [onPreviewRecipeChange, previewRecipe]);

  useEffect(() => () => onPreviewRecipeChange(null), [onPreviewRecipeChange]);

  const chooseTool = (tool: GeometryConstructTool) => {
    setSelectedToolId(tool.id);
    setParameters({ ...DEFAULT_GEOMETRY_CONSTRUCT_PARAMETER_VALUES });
    setSourceObjectIds(normalizeSourceIds(tool, selectedReferenceIds, references));
    if (tool.legacyTarget) {
      onPreviewRecipeChange(null);
      onOpenLegacy(tool.legacyTarget);
    }
  };

  const commit = () => {
    if (!selectedTool || !previewRecipe) return;
    onCommit(previewRecipe, selectedTool, sourceObjectIds);
    setSelectedToolId(null);
    setSourceObjectIds([]);
    onPreviewRecipeChange(null);
  };

  const searchNeedle = search.trim().toLowerCase();
  const visibleFamilies = GEOMETRY_CONSTRUCT_FAMILIES.map((family) => ({
    ...family,
    tools: family.tools.filter((tool) =>
      !searchNeedle || `${tool.label} ${tool.description} ${tool.id}`.toLowerCase().includes(searchNeedle)
    ),
  })).filter((family) => family.tools.length > 0);

  return (
    <section data-testid="geometry-construct-taxonomy" style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#1e3a8a" }}>Construct by entity</div>
          <div style={{ fontSize: 10.5, color: "#475569" }}>Choose → references → preview → parameters → commit</div>
        </div>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: "#166534" }}>scene-safe draft</span>
      </div>
      <input
        data-testid="geometry-construct-taxonomy-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search all construction tools"
        style={{ width: "100%", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} data-testid="geometry-construct-lifecycle">
        <span style={stepStyle(!selectedTool, !!selectedTool)}>1 Choose tool</span>
        <span style={stepStyle(!!selectedTool && !sourcesReady, sourcesReady)}>2 References</span>
        <span style={stepStyle(!!previewRecipe, !!previewRecipe)}>3 Preview</span>
        <span style={stepStyle(!!previewRecipe, !!previewRecipe)}>4 Parameters</span>
        <span style={stepStyle(false, false)}>5 Commit</span>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {visibleFamilies.map((family) => (
          <details
            key={family.id}
            data-testid={`geometry-construct-family-${family.id}`}
            open={searchNeedle ? true : openFamilyIds.has(family.id)}
            onToggle={(event) => {
              if (searchNeedle) return;
              const open = event.currentTarget.open;
              setOpenFamilyIds((current) => {
                const next = new Set(current);
                if (open) next.add(family.id);
                else next.delete(family.id);
                return next;
              });
            }}
          >
            <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 900, color: "#1f2937" }}>
              {family.label} <span style={{ color: "#64748b", fontWeight: 600 }}>({family.tools.length})</span>
            </summary>
            <div style={{ fontSize: 9.5, color: "#64748b", margin: "3px 0 5px" }}>{family.description}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: 5 }}>
              {family.tools.map((tool) => {
                const selected = tool.id === selectedToolId;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    data-testid={`geometry-construct-tool-${tool.id}`}
                    onClick={() => chooseTool(tool)}
                    aria-pressed={selected}
                    style={toolButtonStyle(selected)}
                    title={tool.description}
                  >
                    <strong style={{ fontSize: 10.5 }}>{tool.label}</strong>
                    <span style={{ fontSize: 8.5, color: tool.classification === "existing" ? "#166534" : "#1d4ed8" }}>
                      {tool.classification === "existing" ? "EXISTING" : "NEW"}
                      {tool.referenceCount ? ` · ${tool.referenceCount} ref` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </details>
        ))}
      </div>
      {selectedTool && !selectedTool.legacyTarget && (
        <div data-testid="geometry-construct-draft" style={{ borderTop: "1px solid #bfdbfe", paddingTop: 7, display: "grid", gap: 7 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: 11 }}>{selectedTool.label}</strong>
            <span style={{ fontSize: 9.5, color: previewRecipe ? "#166534" : "#92400e", fontWeight: 800 }}>
              {previewRecipe ? "Preview active · not in history" : "Waiting for references"}
            </span>
          </div>
          {selectedTool.referenceCount > 0 && (
            <div style={{ display: "grid", gap: 5 }}>
              {Array.from({ length: selectedTool.referenceCount }, (_, index) => (
                <label key={`source-${index}`} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 6, alignItems: "center", fontSize: 10 }}>
                  <span>Reference {index + 1}</span>
                  <select
                    data-testid={`geometry-construct-reference-${index}`}
                    value={sourceObjectIds[index] ?? ""}
                    onChange={(event) => setSourceObjectIds((current) => {
                      const next = [...current];
                      next[index] = event.target.value;
                      return next;
                    })}
                  >
                    <option value="">Choose scene object</option>
                    {references.map((reference) => (
                      <option key={reference.id} value={reference.id}>{reference.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {!!selectedTool.parameters?.length && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 5 }}>
              {selectedTool.parameters.map((parameter) => (
                <label key={parameter.id} style={{ display: "grid", gap: 2, fontSize: 9.5, color: "#475569" }}>
                  <span>{parameter.label}</span>
                  <input
                    data-testid={`geometry-construct-param-${parameter.id}`}
                    type="number"
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step}
                    value={parameters[parameter.id] ?? DEFAULT_GEOMETRY_CONSTRUCT_PARAMETER_VALUES[parameter.id]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      setParameters((current) => ({ ...current, [parameter.id]: value }));
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="geometry-construct-commit"
              onClick={commit}
              disabled={!previewRecipe}
              style={{ fontWeight: 800 }}
            >
              Commit {selectedTool.label}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedToolId(null);
                setSourceObjectIds([]);
                onPreviewRecipeChange(null);
              }}
            >
              Cancel draft
            </button>
          </div>
        </div>
      )}
      {selectedTool?.legacyTarget && (
        <div data-testid="geometry-construct-existing-tools" style={{ fontSize: 10, color: "#475569" }}>
          Existing {selectedTool.label} tools are open below with their current selection and preview behavior preserved.
        </div>
      )}
    </section>
  );
};
