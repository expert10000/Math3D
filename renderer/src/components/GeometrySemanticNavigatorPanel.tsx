import type React from "react";
import type {
  GeometrySemanticFilter,
  GeometrySemanticFilterKey,
  GeometrySemanticNavigationCommand,
  GeometrySemanticSelection,
  GeometrySemanticSelector,
} from "../geometry/semanticSelection";

const FILTERS: readonly { id: GeometrySemanticFilterKey; label: string }[] = [
  { id: "curves", label: "Curves" },
  { id: "surfaces", label: "Surfaces" },
  { id: "solids", label: "Solids" },
  { id: "construction", label: "Construction" },
  { id: "hidden", label: "Hidden" },
  { id: "derived", label: "Derived" },
  { id: "trimBoundaries", label: "Trim boundaries" },
];

const COMMANDS: readonly { id: GeometrySemanticNavigationCommand; label: string }[] = [
  { id: "frame", label: "Frame" },
  { id: "isolate", label: "Isolate" },
  { id: "hide-others", label: "Hide others" },
  { id: "parent", label: "Parent" },
  { id: "child", label: "Child" },
  { id: "connected", label: "Connected" },
  { id: "loop", label: "Loop" },
  { id: "chain", label: "Chain" },
  { id: "similar", label: "Similar" },
  { id: "source", label: "Source" },
  { id: "derivative", label: "Derivative" },
];

const SELECTORS: readonly { id: GeometrySemanticSelector; label: string }[] = [
  { id: "tangent", label: "Tangent" },
  { id: "g0-connected", label: "G0 connected" },
  { id: "g1-connected", label: "G1 connected" },
  { id: "same-radius", label: "Same radius" },
  { id: "coplanar", label: "Coplanar" },
  { id: "coaxial", label: "Coaxial" },
  { id: "same-surface-type", label: "Same surface type" },
  { id: "trim-loops", label: "Trim loops" },
];

const pill = (active = false): React.CSSProperties => ({
  border: `1px solid ${active ? "#2563eb" : "#cbd5e1"}`,
  borderRadius: 999,
  padding: "3px 8px",
  background: active ? "#dbeafe" : "#fff",
  color: active ? "#1d4ed8" : "#334155",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
});

type Props = {
  semantic: GeometrySemanticSelection | null;
  filter: GeometrySemanticFilter;
  selectionCount: number;
  status: string | null;
  onToggleFilter: (key: GeometrySemanticFilterKey) => void;
  onCommand: (command: GeometrySemanticNavigationCommand) => void;
  onSelector: (selector: GeometrySemanticSelector) => void;
};

export const GeometrySemanticNavigatorPanel = ({
  semantic,
  filter,
  selectionCount,
  status,
  onToggleFilter,
  onCommand,
  onSelector,
}: Props) => (
  <details
    open
    data-testid="geometry-semantic-navigator"
    style={{ marginTop: 10, border: "1px solid #bfdbfe", borderRadius: 8, background: "#f8fbff", padding: 8 }}
  >
    <summary style={{ fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Semantic selection and Navigate</summary>
    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
      <div data-testid="geometry-semantic-selection-readout" style={{ fontSize: 10.5, display: "grid", gap: 2 }}>
        <strong>{semantic?.label ?? "No semantic entity selected"}</strong>
        {semantic && (
          <>
            <span style={{ color: "#475569" }}>{semantic.kind} · {semantic.category} · revision {semantic.sourceRevision}</span>
            <span style={{ color: "#64748b", fontFamily: "monospace", overflowWrap: "anywhere" }}>{semantic.id}</span>
            <span style={{ color: "#64748b" }}>
              {Object.keys(semantic.aliases).length} semantic IDs · {selectionCount} selected
            </span>
          </>
        )}
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, marginBottom: 4 }}>Selection filters</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter[entry.id]}
              data-testid={`geometry-semantic-filter-${entry.id}`}
              onClick={() => onToggleFilter(entry.id)}
              style={pill(filter[entry.id])}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, marginBottom: 4 }}>Navigate</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {COMMANDS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-testid={`geometry-semantic-command-${entry.id}`}
              disabled={!semantic}
              onClick={() => onCommand(entry.id)}
              style={pill(false)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, marginBottom: 4 }}>Select by geometry</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {SELECTORS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-testid={`geometry-semantic-selector-${entry.id}`}
              disabled={!semantic}
              onClick={() => onSelector(entry.id)}
              style={pill(false)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {status && <div data-testid="geometry-semantic-status" style={{ fontSize: 10.5, color: "#075985" }}>{status}</div>}
    </div>
  </details>
);
