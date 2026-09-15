import {
  canonicalJsonStringify,
  isDocumentIdentity,
  type CanonicalJsonValue,
  type DocumentIdentity,
} from "@math3d/core";

export const DOMAIN_ADAPTER_CONFORMANCE_SCHEMA_VERSION = 1 as const;

export type AdapterHistorySnapshot = Readonly<{ undoDepth: number; redoDepth: number }>;
export type DomainAdapterSnapshot = Readonly<{
  identity: DocumentIdentity;
  structuralState: CanonicalJsonValue;
  persistentState: CanonicalJsonValue;
  history: AdapterHistorySnapshot;
}>;

export type DomainAdapterConformanceFixture<Adapter> = Readonly<{
  name: string;
  create: () => Adapter;
  snapshot: (adapter: Adapter) => DomainAdapterSnapshot;
  preview: (adapter: Adapter) => void | Promise<void>;
  commitStructuralEdit: (adapter: Adapter) => void | Promise<void>;
  attemptInvalidEdit: (adapter: Adapter) => void | Promise<void>;
  undo: (adapter: Adapter) => void | Promise<void>;
  redo: (adapter: Adapter) => void | Promise<void>;
  replay: (adapter: Adapter) => Adapter | Promise<Adapter>;
  reopen: (adapter: Adapter) => Adapter | Promise<Adapter>;
  queryIsolation: (adapter: Adapter) => boolean | Promise<boolean>;
}>;

export const DOMAIN_ADAPTER_CHECKS = [
  "identity.valid",
  "preview.transient",
  "commit.single-revision",
  "invalid.atomic",
  "history.undo",
  "history.redo",
  "replay.parity",
  "persistence.parity",
  "query.isolated",
] as const;
export type DomainAdapterCheckId = (typeof DOMAIN_ADAPTER_CHECKS)[number];

export type ConformanceCheckResult<CheckId extends string = string> = Readonly<{
  id: CheckId;
  passed: boolean;
  detail: string;
}>;

export type DomainAdapterConformanceReport = Readonly<{
  schemaVersion: typeof DOMAIN_ADAPTER_CONFORMANCE_SCHEMA_VERSION;
  fixture: string;
  passed: boolean;
  checks: readonly ConformanceCheckResult<DomainAdapterCheckId>[];
}>;

const sameJson = (left: CanonicalJsonValue, right: CanonicalJsonValue): boolean =>
  canonicalJsonStringify(left) === canonicalJsonStringify(right);

const result = <Id extends string>(id: Id, passed: boolean, detail: string): ConformanceCheckResult<Id> =>
  Object.freeze({ id, passed, detail });

const freezeReport = <T extends { checks: readonly ConformanceCheckResult[] }>(report: T): Readonly<T> => {
  Object.freeze(report.checks);
  return Object.freeze(report);
};

export const runDomainAdapterConformance = async <Adapter>(
  fixture: DomainAdapterConformanceFixture<Adapter>
): Promise<DomainAdapterConformanceReport> => {
  const adapter = fixture.create();
  const initial = fixture.snapshot(adapter);
  const checks: ConformanceCheckResult<DomainAdapterCheckId>[] = [];
  checks.push(result("identity.valid", isDocumentIdentity(initial.identity), "Initial document identity is strict and versioned."));

  await fixture.preview(adapter);
  const previewed = fixture.snapshot(adapter);
  checks.push(result(
    "preview.transient",
    previewed.identity.revision === initial.identity.revision &&
      previewed.identity.structuralHash === initial.identity.structuralHash &&
      sameJson(previewed.structuralState, initial.structuralState) &&
      previewed.history.undoDepth === initial.history.undoDepth,
    "Preview/hover state cannot change source identity, structure, or history."
  ));

  await fixture.commitStructuralEdit(adapter);
  const committed = fixture.snapshot(adapter);
  checks.push(result(
    "commit.single-revision",
    committed.identity.id === initial.identity.id &&
      committed.identity.revision === initial.identity.revision + 1 &&
      committed.identity.structuralHash !== initial.identity.structuralHash &&
      !sameJson(committed.structuralState, initial.structuralState) &&
      committed.history.undoDepth === initial.history.undoDepth + 1,
    "One structural commit advances one revision and creates one reversible history entry."
  ));

  let invalidRejected = false;
  try { await fixture.attemptInvalidEdit(adapter); } catch { invalidRejected = true; }
  const afterInvalid = fixture.snapshot(adapter);
  checks.push(result(
    "invalid.atomic",
    invalidRejected &&
      afterInvalid.identity.revision === committed.identity.revision &&
      sameJson(afterInvalid.structuralState, committed.structuralState) &&
      afterInvalid.history.undoDepth === committed.history.undoDepth,
    "Invalid work is rejected without partial mutation or history."
  ));

  const replayed = fixture.snapshot(await fixture.replay(adapter));
  checks.push(result(
    "replay.parity",
    replayed.identity.id === committed.identity.id && replayed.identity.revision === committed.identity.revision &&
      replayed.identity.structuralHash === committed.identity.structuralHash && sameJson(replayed.structuralState, committed.structuralState),
    "Replay reproduces source identity and canonical structure."
  ));
  const reopened = fixture.snapshot(await fixture.reopen(adapter));
  checks.push(result(
    "persistence.parity",
    reopened.identity.id === committed.identity.id && reopened.identity.revision === committed.identity.revision &&
      reopened.identity.structuralHash === committed.identity.structuralHash &&
      sameJson(reopened.structuralState, committed.structuralState) && sameJson(reopened.persistentState, committed.persistentState),
    "Save/reopen preserves identity, structure, and durable presentation metadata."
  ));

  await fixture.undo(adapter);
  const undone = fixture.snapshot(adapter);
  checks.push(result(
    "history.undo",
    sameJson(undone.structuralState, initial.structuralState) && undone.history.redoDepth === 1,
    "Undo restores the exact prior structural state and exposes one redo."
  ));
  await fixture.redo(adapter);
  const redone = fixture.snapshot(adapter);
  checks.push(result(
    "history.redo",
    sameJson(redone.structuralState, committed.structuralState) && redone.identity.structuralHash === committed.identity.structuralHash,
    "Redo restores the committed structural state and identity."
  ));
  checks.push(result("query.isolated", await fixture.queryIsolation(adapter), "Read queries cannot mutate authoritative adapter state."));

  return freezeReport({
    schemaVersion: DOMAIN_ADAPTER_CONFORMANCE_SCHEMA_VERSION,
    fixture: fixture.name,
    passed: checks.every((check) => check.passed),
    checks: Object.freeze(checks),
  });
};

export type SelectionConformanceSnapshot = Readonly<{
  sourceRevision: number;
  hoverId: string | null;
  committedIds: readonly string[];
  historyDepth: number;
}>;

export type SelectionConformanceFixture<State> = Readonly<{
  name: string;
  create: () => State;
  snapshot: (state: State) => SelectionConformanceSnapshot;
  hover: (state: State) => State;
  commit: (state: State) => State;
  clear: (state: State) => State;
  structuralChange: (state: State) => State;
  locateBack: (state: State) => CanonicalJsonValue | null;
  inspectorQueryIsolation: (state: State) => boolean;
}>;

export const SELECTION_CONFORMANCE_CHECKS = [
  "hover.transient",
  "selection.committed",
  "selection.clear",
  "selection.history-policy",
  "selection.structural-remap-or-clear",
  "selection.locate-back",
  "selection.inspector-isolated",
] as const;
export type SelectionConformanceCheckId = (typeof SELECTION_CONFORMANCE_CHECKS)[number];

export type SelectionConformanceReport = Readonly<{
  schemaVersion: typeof DOMAIN_ADAPTER_CONFORMANCE_SCHEMA_VERSION;
  fixture: string;
  passed: boolean;
  checks: readonly ConformanceCheckResult<SelectionConformanceCheckId>[];
}>;

export const runSelectionConformance = <State>(fixture: SelectionConformanceFixture<State>): SelectionConformanceReport => {
  const initialState = fixture.create();
  const initial = fixture.snapshot(initialState);
  const hoveredState = fixture.hover(initialState);
  const hovered = fixture.snapshot(hoveredState);
  const committedState = fixture.commit(hoveredState);
  const committed = fixture.snapshot(committedState);
  const clearedState = fixture.clear(committedState);
  const cleared = fixture.snapshot(clearedState);
  const changedState = fixture.structuralChange(committedState);
  const changed = fixture.snapshot(changedState);
  const checks: ConformanceCheckResult<SelectionConformanceCheckId>[] = [
    result("hover.transient", hovered.hoverId !== null && hovered.committedIds.length === 0 && hovered.historyDepth === initial.historyDepth && hovered.sourceRevision === initial.sourceRevision, "Hover is transient."),
    result("selection.committed", committed.committedIds.length > 0 && committed.hoverId === hovered.hoverId, "Committed selection is explicit."),
    result("selection.clear", cleared.committedIds.length === 0, "Empty-space clear removes committed selection."),
    result("selection.history-policy", committed.historyDepth === initial.historyDepth + 1 && cleared.historyDepth === committed.historyDepth + 1, "Commit and clear follow the declared history policy."),
    result("selection.structural-remap-or-clear", changed.sourceRevision === committed.sourceRevision + 1 && changed.committedIds.every((id) => committed.committedIds.includes(id)), "Structural change remaps stable IDs or clears invalid selections."),
    result("selection.locate-back", fixture.locateBack(committedState) !== null, "Committed selection locates back to a source reference."),
    result("selection.inspector-isolated", fixture.inspectorQueryIsolation(committedState), "Inspector queries cannot mutate selection authority."),
  ];
  return freezeReport({ schemaVersion: DOMAIN_ADAPTER_CONFORMANCE_SCHEMA_VERSION, fixture: fixture.name, passed: checks.every((check) => check.passed), checks: Object.freeze(checks) });
};
