import type React from "react";

export const SHARED_INSPECTOR_CATEGORIES = [
  "summary",
  "selection",
  "geometry",
  "analysis",
  "diagnostics",
  "provenance",
  "history",
] as const;

export type SharedInspectorCategory = (typeof SHARED_INSPECTOR_CATEGORIES)[number];

const labels: Record<SharedInspectorCategory, string> = {
  summary: "Summary",
  selection: "Selection",
  geometry: "Geometry",
  analysis: "Analysis",
  diagnostics: "Diagnostics",
  provenance: "Provenance",
  history: "History",
};

export function SharedInspectorShell({
  summary,
  activeCategory,
  onCategoryChange,
  children,
}: {
  summary: React.ReactNode;
  activeCategory: SharedInspectorCategory;
  onCategoryChange: (category: SharedInspectorCategory) => void;
  children: React.ReactNode;
}) {
  return (
    <section data-testid="shared-inspector-shell" style={{ minHeight: 0 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 15, letterSpacing: "0.04em" }}>INSPECTOR</h2>
      <div role="tablist" aria-label="Inspector categories" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {SHARED_INSPECTOR_CATEGORIES.map((category) => {
          const active = category === activeCategory;
          return (
            <button
              key={category}
              type="button"
              role="tab"
              data-testid={`shared-inspector-tab-${category}`}
              aria-selected={active}
              onClick={() => onCategoryChange(category)}
              style={{
                border: `1px solid ${active ? "#60a5fa" : "#dbe4f0"}`,
                borderRadius: 999,
                background: active ? "#eaf3ff" : "#fff",
                color: active ? "#164e8b" : "#334155",
                padding: "4px 8px",
                fontSize: 10,
                fontWeight: 750,
                cursor: "pointer",
              }}
            >
              {labels[category]}
            </button>
          );
        })}
      </div>
      <div
        data-testid="shared-inspector-summary"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          marginBottom: 10,
          padding: "7px 8px",
          border: "1px solid #dbe4ee",
          borderRadius: 8,
          background: "#f8fafc",
          fontSize: 11,
        }}
      >
        {summary}
      </div>
      <div role="tabpanel">{children}</div>
    </section>
  );
}
