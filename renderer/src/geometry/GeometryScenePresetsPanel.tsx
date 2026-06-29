import React from "react";
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
}) => (
  <div style={{ display: "grid", gap: 8, minHeight: 0 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800 }}>Scene presets</div>
        <div style={{ fontSize: 10.5, color: "#475569" }}>
          Repeatable Geometry scenes for renderer, inspector, section, and transform checks.
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: "#475569" }}>{scenes.length} presets</div>
    </div>
    {scenes.length ? (
      <>
        <div
          data-testid="geometry-debug-scene-gallery"
          className="gallery-panel-scroll geometry-gallery-compact"
          style={{ maxHeight: "min(48vh, 420px)", paddingRight: 3 }}
        >
          <div className="gallery-card-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
            {scenes.map((entry) => {
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
        No scene presets are available.
      </div>
    )}
  </div>
);
