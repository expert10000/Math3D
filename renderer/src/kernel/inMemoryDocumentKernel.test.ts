import { describe, expect, it } from "vitest";
import {
  createCommandEnvelope,
  structuralHash,
  type CanonicalJsonValue,
  type CommandDefinition,
} from "@math3d/core";
import {
  createInMemoryDocumentKernel,
  type KernelCompletedEvent,
  type KernelOperationResult,
} from "@math3d/kernel";

type TestState = {
  count: number;
  view: { labels: string[] };
};

const payloadRecord = (payload: CanonicalJsonValue): Record<string, CanonicalJsonValue> | null =>
  payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, CanonicalJsonValue>
    : null;

const definitions: readonly CommandDefinition<TestState>[] = [
  {
    type: "counter.add",
    validate: (payload) => {
      const record = payloadRecord(payload);
      return record && Number.isSafeInteger(record.amount)
        ? { ok: true, value: { amount: record.amount as number } }
        : { ok: false, errors: ["counter.add amount must be a safe integer."] };
    },
    project: (state, payload) => ({
      count: state.count + (payloadRecord(payload)!.amount as number),
      view: { labels: [...state.view.labels] },
    }),
  },
  {
    type: "label.append",
    validate: (payload) => {
      const record = payloadRecord(payload);
      return record && typeof record.label === "string"
        ? { ok: true, value: { label: record.label } }
        : { ok: false, errors: ["label.append label must be a string."] };
    },
    project: (state, payload) => ({
      count: state.count,
      view: { labels: [...state.view.labels, payloadRecord(payload)!.label as string] },
    }),
  },
  {
    type: "label.remove-last",
    validate: (payload) => {
      const record = payloadRecord(payload);
      return record && typeof record.label === "string"
        ? { ok: true, value: { label: record.label } }
        : { ok: false, errors: ["label.remove-last label must be a string."] };
    },
    project: (state, payload) => {
      const label = payloadRecord(payload)!.label as string;
      if (state.view.labels[state.view.labels.length - 1] !== label) {
        throw new Error(`Cannot remove non-current label '${label}'.`);
      }
      return {
        count: state.count,
        view: { labels: state.view.labels.slice(0, -1) },
      };
    },
  },
];

const command = (id: string, type: string, payload: CanonicalJsonValue) => createCommandEnvelope({
  commandId: id,
  origin: { kind: "system", sourceId: "kernel-fixture" },
  command: { type, payload },
});

const add = (id: string, amount: number) => command(id, "counter.add", { amount });
const appendLabel = (id: string, label: string) => command(id, "label.append", { label });
const removeLastLabel = (id: string, label: string) => command(id, "label.remove-last", { label });

const reversibleAdd = (transactionId: string, amount: number) => ({
  transactionId,
  commands: [add(`${transactionId}-forward`, amount)],
  mode: "interactive" as const,
  history: {
    kind: "reversible" as const,
    inverseCommands: [add(`${transactionId}-inverse`, -amount)],
  },
});

const expectFailureCode = (result: KernelOperationResult, code: string) => {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.errors[0]?.code).toBe(code);
};

describe("in-memory document kernel", () => {
  it("commits state before delivering immutable completed facts in subscription order", () => {
    const kernel = createInMemoryDocumentKernel({
      initialState: { count: 0, view: { labels: [] } },
      commandDefinitions: definitions,
      historyLimit: 4,
    });
    const observations: string[] = [];
    kernel.subscribe((event) => {
      observations.push(`first:${event.sequence}:${kernel.query((state) => state.count)}`);
      (event.commandIds as string[]).push("illegal");
    });
    kernel.subscribe((event) => {
      observations.push(`second:${event.sequence}:${event.commandIds.join(",")}`);
    });

    const result = kernel.transact(reversibleAdd("tx-1", 3));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(observations).toEqual(["first:1:3", "second:1:tx-1-forward"]);
    expect(result.listenerErrors).toHaveLength(1);
    expect(result.event).toMatchObject({
      sequence: 1,
      type: "document.transaction-committed",
      transactionId: "tx-1",
      commandIds: ["tx-1-forward"],
      history: { limit: 4, undoDepth: 1, redoDepth: 0 },
    });
    expect(result.event.stateHash).toBe(structuralHash(kernel.query((state) => state)));
  });

  it("returns detached frozen query snapshots that cannot mutate owned state", () => {
    const kernel = createInMemoryDocumentKernel({
      initialState: { count: 2, view: { labels: ["owned"] } },
      commandDefinitions: definitions,
    });
    const snapshot = kernel.query((state) => state);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.view.labels)).toBe(true);
    expect(() => (snapshot.view.labels as string[]).push("illegal")).toThrow();
    expect(kernel.query((state) => state.view.labels)).toEqual(["owned"]);
  });

  it("rejects mutations attempted from a read-only query", () => {
    const kernel = createInMemoryDocumentKernel({
      initialState: { count: 2, view: { labels: [] } },
      commandDefinitions: definitions,
    });
    let nestedResult: KernelOperationResult | null = null;

    const observed = kernel.query((state) => {
      nestedResult = kernel.transact(reversibleAdd("tx-from-query", 10));
      return state.count;
    });

    expect(observed).toBe(2);
    expect(nestedResult).not.toBeNull();
    expectFailureCode(nestedResult!, "reentrant-operation");
    expect(kernel.query((state) => state.count)).toBe(2);
    expect(kernel.historyStatus()).toMatchObject({ undoDepth: 0, redoDepth: 0 });
  });

  it("keeps state, history, sequence, and subscribers unchanged after a failed batch", () => {
    const kernel = createInMemoryDocumentKernel({
      initialState: { count: 5, view: { labels: [] } },
      commandDefinitions: definitions,
    });
    const events: KernelCompletedEvent[] = [];
    kernel.subscribe((event) => events.push(event));

    const result = kernel.transact({
      transactionId: "tx-invalid",
      commands: [add("valid-first", 4), command("invalid-second", "counter.add", { amount: 1.5 })],
      history: {
        kind: "reversible",
        inverseCommands: [add("unused-inverse", -4)],
      },
    });

    expectFailureCode(result, "transaction-rejected");
    expect(kernel.query((state) => state.count)).toBe(5);
    expect(kernel.historyStatus()).toEqual({ limit: 100, undoDepth: 0, redoDepth: 0 });
    expect(events).toEqual([]);

    const committed = kernel.transact(reversibleAdd("tx-after-failure", 1));
    expect(committed.ok && committed.event.sequence).toBe(1);
  });

  it("rejects a bad inverse before commit and emits no completed fact", () => {
    const kernel = createInMemoryDocumentKernel({
      initialState: { count: 0, view: { labels: [] } },
      commandDefinitions: definitions,
    });
    const events: KernelCompletedEvent[] = [];
    kernel.subscribe((event) => events.push(event));

    const result = kernel.transact({
      transactionId: "tx-bad-inverse",
      commands: [add("forward", 2)],
      history: {
        kind: "reversible",
        inverseCommands: [command("inverse", "counter.add", { amount: "bad" })],
      },
    });

    expectFailureCode(result, "transaction-rejected");
    expect(kernel.query((state) => state.count)).toBe(0);
    expect(kernel.historyStatus().undoDepth).toBe(0);
    expect(events).toEqual([]);
  });

  it("undoes and redoes heterogeneous transactions with deterministic event order", () => {
    const kernel = createInMemoryDocumentKernel({
      initialState: { count: 0, view: { labels: [] } },
      commandDefinitions: definitions,
    });
    const eventTypes: string[] = [];
    kernel.subscribe((event) => eventTypes.push(`${event.sequence}:${event.type}`));

    expect(kernel.transact({
      transactionId: "tx-mixed",
      commands: [add("mixed-add", 4), appendLabel("mixed-label", "kept")],
      history: {
        kind: "reversible",
        inverseCommands: [removeLastLabel("mixed-label-undo", "kept"), add("mixed-add-undo", -4)],
      },
    }).ok).toBe(true);
    expect(kernel.query((state) => state)).toEqual({ count: 4, view: { labels: ["kept"] } });

    const undone = kernel.undo();
    expect(undone.ok).toBe(true);
    expect(kernel.query((state) => state)).toEqual({ count: 0, view: { labels: [] } });
    expect(kernel.historyStatus()).toMatchObject({ undoDepth: 0, redoDepth: 1 });

    const redone = kernel.redo();
    expect(redone.ok).toBe(true);
    expect(kernel.query((state) => state)).toEqual({ count: 4, view: { labels: ["kept"] } });
    expect(eventTypes).toEqual([
      "1:document.transaction-committed",
      "2:document.history-undone",
      "3:document.history-redone",
    ]);
  });

  it("bounds history, clears redo on a new commit, and clears all history at an irreversible boundary", () => {
    const kernel = createInMemoryDocumentKernel({
      initialState: { count: 0, view: { labels: [] } },
      commandDefinitions: definitions,
      historyLimit: 2,
    });
    kernel.transact(reversibleAdd("tx-1", 1));
    kernel.transact(reversibleAdd("tx-2", 2));
    kernel.transact(reversibleAdd("tx-3", 3));
    expect(kernel.historyStatus()).toEqual({ limit: 2, undoDepth: 2, redoDepth: 0 });

    expect(kernel.undo().ok).toBe(true);
    expect(kernel.undo().ok).toBe(true);
    expectFailureCode(kernel.undo(), "history-empty");
    expect(kernel.query((state) => state.count)).toBe(1);

    expect(kernel.redo().ok).toBe(true);
    expect(kernel.transact(reversibleAdd("tx-new", 10)).ok).toBe(true);
    expect(kernel.historyStatus().redoDepth).toBe(0);
    expectFailureCode(kernel.redo(), "history-empty");

    expect(kernel.transact({
      transactionId: "tx-checkpoint",
      commands: [add("checkpoint-add", 1)],
      history: { kind: "irreversible" },
    }).ok).toBe(true);
    expect(kernel.historyStatus()).toEqual({ limit: 2, undoDepth: 0, redoDepth: 0 });
  });

  it("cleans up subscriptions idempotently", () => {
    const kernel = createInMemoryDocumentKernel({
      initialState: { count: 0, view: { labels: [] } },
      commandDefinitions: definitions,
    });
    let deliveries = 0;
    const unsubscribe = kernel.subscribe(() => { deliveries += 1; });
    kernel.transact(reversibleAdd("tx-before-cleanup", 1));
    unsubscribe();
    unsubscribe();
    kernel.transact(reversibleAdd("tx-after-cleanup", 1));
    expect(deliveries).toBe(1);
  });

  it("rejects re-entrant mutations during event delivery without disturbing the outer commit", () => {
    const kernel = createInMemoryDocumentKernel({
      initialState: { count: 0, view: { labels: [] } },
      commandDefinitions: definitions,
    });
    let nestedResult: KernelOperationResult | null = null;
    const sequences: number[] = [];
    kernel.subscribe((event) => {
      sequences.push(event.sequence);
      nestedResult = kernel.transact(reversibleAdd("tx-nested", 100));
    });

    const outer = kernel.transact(reversibleAdd("tx-outer", 2));

    expect(outer.ok).toBe(true);
    expect(nestedResult).not.toBeNull();
    expectFailureCode(nestedResult!, "reentrant-operation");
    expect(kernel.query((state) => state.count)).toBe(2);
    expect(sequences).toEqual([1]);
    expect(kernel.historyStatus()).toMatchObject({ undoDepth: 1, redoDepth: 0 });
  });
});
