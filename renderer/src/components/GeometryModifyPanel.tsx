import React from "react";
import type {
  GeometryModifyCommand,
  GeometryModifyCommandId,
  GeometryModifyGroup,
  GeometryModifyRepresentation,
} from "../geometry/modifyOperations";
import type { GeometrySemanticSelection } from "../geometry/semanticSelection";

type GeometryModifyPanelProps = {
  semantic: GeometrySemanticSelection | null;
  selectionCount: number;
  representation: GeometryModifyRepresentation;
  groups: readonly GeometryModifyGroup[];
  onCommand: (command: GeometryModifyCommand) => void;
};

const STATUS_STYLE: Record<GeometryModifyCommand["status"], React.CSSProperties> = {
  available: { background: "#dcfce7", borderColor: "#86efac", color: "#166534" },
  warning: { background: "#fef3c7", borderColor: "#fcd34d", color: "#92400e" },
  unavailable: { background: "#f1f5f9", borderColor: "#cbd5e1", color: "#64748b" },
};

const STATUS_LABEL: Record<GeometryModifyCommand["status"], string> = {
  available: "AVAILABLE",
  warning: "AVAILABLE · WARNING",
  unavailable: "UNAVAILABLE",
};

const CommandButton = ({ command, onCommand }: { command: GeometryModifyCommand; onCommand: (command: GeometryModifyCommand) => void }) => (
  <button
    type="button"
    data-testid={`geometry-modify-command-${command.id}`}
    data-status={command.status}
    disabled={command.status === "unavailable"}
    onClick={() => onCommand(command)}
    title={command.explanation}
    style={{
      border: `1px solid ${STATUS_STYLE[command.status].borderColor}`,
      borderRadius: 7,
      background: "#fff",
      color: "#0f172a",
      padding: "6px 7px",
      display: "grid",
      gap: 3,
      textAlign: "left",
      opacity: command.status === "unavailable" ? 0.72 : 1,
    }}
  >
    <strong style={{ fontSize: 10.5 }}>{command.label}</strong>
    <span style={{ ...STATUS_STYLE[command.status], border: "1px solid", borderRadius: 999, padding: "1px 5px", fontSize: 8, fontWeight: 900, justifySelf: "start" }}>
      {STATUS_LABEL[command.status]}
    </span>
    <span style={{ fontSize: 8.5, lineHeight: 1.25, color: "#64748b" }}>{command.explanation}</span>
  </button>
);

const Group = ({ group, onCommand }: { group: GeometryModifyGroup; onCommand: (command: GeometryModifyCommand) => void }) => {
  const contents = (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 9.5, color: "#64748b", marginBottom: 5 }}>{group.description}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))", gap: 5 }}>
        {group.commands.map((command) => <CommandButton key={command.id} command={command} onCommand={onCommand} />)}
      </div>
    </div>
  );
  return group.discrete ? (
    <details data-testid="geometry-modify-discrete-group" style={{ borderTop: "1px solid #cbd5e1", paddingTop: 6 }}>
      <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 900 }}>{group.label}</summary>
      {contents}
    </details>
  ) : (
    <section data-testid={`geometry-modify-group-${group.id}`}>
      <div style={{ fontSize: 11, fontWeight: 900 }}>{group.label}</div>
      {contents}
    </section>
  );
};

export const GeometryModifyPanel: React.FC<GeometryModifyPanelProps> = ({
  semantic,
  selectionCount,
  representation,
  groups,
  onCommand,
}) => (
  <section
    data-testid="geometry-selection-driven-modify"
    style={{
      border: "1px solid #93c5fd",
      borderRadius: 9,
      background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
      padding: 8,
      display: "grid",
      gap: 8,
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#1e3a8a" }}>Modify selected entity</div>
        <div data-testid="geometry-modify-selection-summary" style={{ fontSize: 10.5, color: "#475569" }}>
          {semantic ? `${semantic.label} · ${selectionCount} selected` : "No semantic entity selected"}
        </div>
      </div>
      <span style={{ fontSize: 9, fontWeight: 900, color: "#334155", textTransform: "uppercase" }}>{representation.replaceAll("-", " ")}</span>
    </div>
    {groups.map((group) => <Group key={group.id} group={group} onCommand={onCommand} />)}
  </section>
);

export type { GeometryModifyCommandId };
