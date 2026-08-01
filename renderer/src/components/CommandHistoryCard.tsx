import type { CSSProperties, FocusEventHandler, MouseEventHandler, ReactNode } from "react";
import {
  buildUnifiedCommandHistoryRows,
  type UnifiedCommandHistoryEntry,
} from "../selection/unifiedCommandHistory";

type CommandHistoryCardTone = "default" | "construction";

export type CommandHistoryCardProps = {
  readonly command: UnifiedCommandHistoryEntry;
  readonly selected?: boolean;
  readonly previewing?: boolean;
  readonly tone?: CommandHistoryCardTone;
  readonly testId?: string;
  readonly countTestId?: string;
  readonly rowsTestId?: string;
  readonly title?: string;
  readonly actions?: ReactNode;
  readonly footer?: ReactNode;
  readonly onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  readonly onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  readonly onFocus?: FocusEventHandler<HTMLDivElement>;
  readonly onBlur?: FocusEventHandler<HTMLDivElement>;
};

const cardStyle = (selected?: boolean, previewing?: boolean): CSSProperties => ({
  textAlign: "left",
  border: "1px solid " + (selected || previewing ? "#0a66c2" : "#dbe2ea"),
  borderRadius: 7,
  background: previewing ? "#ecfeff" : selected ? "#eaf3ff" : "#f8fafc",
  padding: "5px 7px",
  display: "grid",
  gap: 5,
});

const rowsStyle = (tone: CommandHistoryCardTone): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr)",
  gap: "2px 6px",
  border: "1px solid " + (tone === "construction" ? "#ccfbf1" : "#e2e8f0"),
  borderRadius: 6,
  background: tone === "construction" ? "#f0fdfa" : "#ffffff",
  padding: "4px 6px",
  fontSize: 10,
  color: tone === "construction" ? "#134e4a" : "#334155",
});

const rowLabelStyle = (tone: CommandHistoryCardTone): CSSProperties => ({
  color: tone === "construction" ? "#0f766e" : "#64748b",
  fontWeight: 800,
});

export function CommandHistoryCard({
  command,
  selected,
  previewing,
  tone = "default",
  testId,
  countTestId,
  rowsTestId,
  title,
  actions,
  footer,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: CommandHistoryCardProps) {
  const rows = buildUnifiedCommandHistoryRows(command);
  return (
    <div
      data-testid={testId}
      tabIndex={0}
      title={title}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      style={cardStyle(selected, previewing)}
    >
      <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <strong>{command.title}</strong>
        <span style={{ color: "#64748b" }}>
          {new Date(command.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </span>
      {command.detail && <span style={{ color: "#475569" }}>{command.detail}</span>}
      {command.countsLabel && (
        <span
          data-testid={countTestId}
          style={{
            border: "1px solid #dbeafe",
            borderRadius: 6,
            background: "#eff6ff",
            color: "#1e3a8a",
            padding: "3px 6px",
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          {command.countsLabel}
        </span>
      )}
      <span data-testid={rowsTestId} style={rowsStyle(tone)}>
        {rows.map((row) => (
          <span key={`${row.label}:${row.value}`} style={{ display: "contents" }}>
            <span style={rowLabelStyle(tone)}>{row.label}</span>
            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{row.value}</span>
          </span>
        ))}
      </span>
      {footer}
      {actions && <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>{actions}</span>}
    </div>
  );
}
