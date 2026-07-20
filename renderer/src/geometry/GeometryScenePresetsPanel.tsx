import React, { useMemo, useState } from "react";
import type { GeometryGallerySceneEntry } from "./sceneGalleryCatalog";

export type GeometryScenePresetsPanelProps = {
  scenes: GeometryGallerySceneEntry[];
  selectedScene: GeometryGallerySceneEntry | null;
  activeSceneId: string | null;
  status: string | null;
  replayEnabled: boolean;
  onSelectScene: (sceneId: string) => void;
  onOpenScene: (scene: GeometryGallerySceneEntry) => void;
  onReplayScene: () => void;
  onChoosePanel: (panel: string) => void;
};

type GeometryScenePresetFilter = "all" | "construct" | "playgrounds" | "measure" | "smoke" | "debug";

const GEOMETRY_SCENE_PRESET_FILTER_OPTIONS: Array<{ id: GeometryScenePresetFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "construct", label: "Construct" },
  { id: "playgrounds", label: "Playgrounds" },
  { id: "measure", label: "Measure" },
  { id: "smoke", label: "Smoke" },
  { id: "debug", label: "Debug" },
];

export const GeometryScenePresetsPanel: React.FC<GeometryScenePresetsPanelProps> = ({
  scenes,
  selectedScene,
  activeSceneId,
  status,
  replayEnabled,
  onSelectScene,
  onOpenScene,
  onReplayScene,
  onChoosePanel,
}) => {
  const [filter, setFilter] = useState<GeometryScenePresetFilter>("all");
  const filteredScenes = useMemo(
    () =>
      scenes.filter((entry) => {
        if (filter === "all") return true;
        if (filter === "construct") return entry.category === "Construction Basics";
        if (filter === "playgrounds") return entry.title.toLowerCase().includes("playground") || Boolean(entry.initialScene.metadata?.playground);
        if (filter === "measure") return entry.category === "Measurement";
        if (filter === "smoke") return entry.category === "Release Smoke";
        return entry.category === "Debug Scenes";
      }),
    [filter, scenes]
  );

  return (
    <div style={{ display: "grid", gap: 8, minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Scene presets</div>
          <div style={{ fontSize: 10.5, color: "#475569" }}>
            Repeatable Geometry scenes for renderer, inspector, section, and transform checks.
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "#475569" }}>{filteredScenes.length} / {scenes.length} presets</div>
      </div>
      <div data-testid="geometry-scene-preset-filter-chips" style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        {GEOMETRY_SCENE_PRESET_FILTER_OPTIONS.map((option) => {
          const active = filter === option.id;
          return (
            <button
              key={`geometry-scene-preset-filter-${option.id}`}
              type="button"
              data-testid={`geometry-scene-preset-filter-${option.id}`}
              aria-pressed={active}
              onClick={() => setFilter(option.id)}
              style={{
                fontSize: 10.5,
                padding: "3px 8px",
                borderRadius: 999,
                border: `1px solid ${active ? "#0a66c2" : "#cbd5e1"}`,
                background: active ? "#dbeafe" : "#fff",
                color: active ? "#073763" : "#334155",
                fontWeight: active ? 800 : 600,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {filteredScenes.length ? (
        <>
          <div
            data-testid="geometry-debug-scene-gallery"
            className="gallery-panel-scroll geometry-gallery-compact"
            style={{ maxHeight: "min(48vh, 420px)", paddingRight: 3 }}
          >
            <div className="gallery-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {filteredScenes.map((entry) => {
                const selected = selectedScene?.id === entry.id;
                const objectCount = entry.initialScene.objects?.length ?? 0;
                return (
                  <article
                    key={`geometry-debug-scene-card-${entry.id}`}
                    role="button"
                    tabIndex={0}
                    data-testid={`geometry-debug-scene-card-${entry.id}`}
                    onClick={() => onSelectScene(entry.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onSelectScene(entry.id);
                        onOpenScene(entry);
                      }
                      if (event.key === " ") {
                        event.preventDefault();
                        onSelectScene(entry.id);
                      }
                    }}
                    className={`gallery-scan-card geometry-gallery-scan-card is-compact${selected ? " is-browser-selected" : ""}`}
                    title={`${entry.title}\n${entry.description}`}
                  >
                    <div className="gallery-scan-card-preview">
                      <div className="gallery-scan-card-preview-frame">
                        {entry.thumbnail ? (
                          <img
                            src={entry.thumbnail}
                            alt={`${entry.title} thumbnail`}
                            className="gallery-scan-card-preview-image"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : null}
                      </div>
                    </div>
                    <div className="gallery-scan-card-meta">
                      <div className="gallery-scan-card-title-row">
                        <div className="gallery-scan-card-title">{entry.title.replace("Debug: ", "")}</div>
                      </div>
                      <div className="gallery-scan-card-formula">{objectCount} objects</div>
                      <div className="gallery-scan-card-footer">
                        <button
                          type="button"
                          data-testid={`geometry-debug-scene-open-${entry.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectScene(entry.id);
                            onOpenScene(entry);
                          }}
                          className="gallery-scan-card-action-btn"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          {selectedScene && (
            <div
              data-testid="geometry-debug-scene-selected"
              style={{
                border: "1px solid #cfe1f6",
                borderRadius: 8,
                background: "#eff6ff",
                padding: "7px 8px",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 160px" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#1e3a8a" }}>{selectedScene.title}</div>
                  <div style={{ fontSize: 10.5, color: "#475569" }}>{selectedScene.description}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenScene(selectedScene)}
                  style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px" }}
                >
                  {activeSceneId === selectedScene.id ? "Re-open scene" : "Open scene"}
                </button>
                <button type="button" onClick={onReplayScene} disabled={!replayEnabled} style={{ fontSize: 11, padding: "4px 10px" }}>
                  Replay
                </button>
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", fontSize: 10 }}>
                {(selectedScene.recommendedPanels ?? []).map((panel) => (
                  <button
                    key={`geometry-debug-scene-panel-${selectedScene.id}-${panel}`}
                    type="button"
                    onClick={() => onChoosePanel(panel)}
                    style={{ fontSize: 10, padding: "2px 6px" }}
                  >
                    {panel}
                  </button>
                ))}
                {status && (
                  <span style={{ fontFamily: "monospace", color: "#334155", padding: "2px 0" }}>
                    {status}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{ border: "1px dashed #cbd5e1", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#475569" }}>
          No scene presets match this filter.
        </div>
      )}
    </div>
  );
};
