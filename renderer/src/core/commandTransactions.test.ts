import { describe, expect, it } from "vitest";
import {
  COMMAND_ENVELOPE_SCHEMA_VERSION,
  createCommandEnvelope,
  deserializeSceneProject,
  normalizeCommandEnvelope,
  projectCommandTransaction,
  structuralHash,
  type CanonicalJsonValue,
  type CommandDefinition,
  type SceneDocument,
} from "@math3d/core";

type CounterState = { count: number; labels: string[] };

const payloadRecord = (payload: CanonicalJsonValue): Record<string, CanonicalJsonValue> | null =>
  payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, CanonicalJsonValue>
    : null;

const addDefinition = (onProject?: () => void): CommandDefinition<CounterState> => ({
  type: "counter.add",
  validate: (payload) => {
    const record = payloadRecord(payload);
    if (!record || !Number.isSafeInteger(record.amount)) {
      return { ok: false, errors: ["counter.add amount must be a safe integer."] };
    }
    return { ok: true, value: { amount: record.amount as number } };
  },
  project: (state, payload) => {
    onProject?.();
    return { ...state, count: state.count + (payloadRecord(payload)!.amount as number) };
  },
});

const labelDefinition: CommandDefinition<CounterState> = {
  type: "counter.label",
  validate: (payload) => {
    const record = payloadRecord(payload);
    return record && typeof record.label === "string"
      ? { ok: true, value: { label: record.label } }
      : { ok: false, errors: ["counter.label label must be a string."] };
  },
  project: (state, payload) => ({
    ...state,
    labels: [...state.labels, payloadRecord(payload)!.label as string],
  }),
};

const envelope = (
  commandId: string,
  type: string,
  payload: CanonicalJsonValue,
  diagnostics?: { issuedAt: number; label: string }
) => createCommandEnvelope({
  commandId,
  origin: { kind: "replay", sourceId: "fixture:counter" },
  command: { type, payload },
  ...(diagnostics ? { diagnostics } : {}),
});

describe("versioned command envelopes", () => {
  it("normalizes legacy scene commands without mixing diagnostics into execution input", () => {
    const result = normalizeCommandEnvelope({
      id: "legacy-1",
      timestamp: 1234,
      actor: "fixture-user",
      command: { type: "scene.set-title", title: "Normalized" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      schemaVersion: COMMAND_ENVELOPE_SCHEMA_VERSION,
      commandId: "legacy-1",
      origin: { kind: "legacy", actorId: "fixture-user" },
      command: { type: "scene.set-title", payload: { title: "Normalized" } },
      diagnostics: { issuedAt: 1234 },
    });
    expect(result.value.command.payload).not.toHaveProperty("timestamp");
    expect(result.value.command.payload).not.toHaveProperty("actor");
    expect(Object.isFrozen(result.value.command.payload)).toBe(true);
  });

  it("rejects unsupported versions, unknown fields, and non-JSON payloads", () => {
    expect(normalizeCommandEnvelope({
      schemaVersion: 2,
      commandId: "bad-version",
      origin: { kind: "interactive" },
      command: { type: "counter.add", payload: { amount: 1 } },
    }).ok).toBe(false);
    expect(normalizeCommandEnvelope({
      schemaVersion: 1,
      commandId: "extra-field",
      origin: { kind: "interactive" },
      command: { type: "counter.add", payload: { amount: 1 } },
      timestamp: 10,
    }).ok).toBe(false);
    expect(() => createCommandEnvelope({
      commandId: "function-payload",
      origin: { kind: "script" },
      command: {
        type: "counter.add",
        payload: { amount: (() => 1) } as unknown as CanonicalJsonValue,
      },
    })).toThrow(/canonical JSON/);
  });

  it("normalizes legacy command logs while reading existing scene projects", () => {
    const scene: SceneDocument = {
      id: "scene-1",
      title: "Legacy command log",
      createdAt: 1,
      updatedAt: 1,
    };
    const loaded = deserializeSceneProject(JSON.stringify({
      format: "math3d.scene-project",
      version: 1,
      scene,
      commandLog: [{
        id: "legacy-title-1",
        timestamp: 20,
        command: { type: "scene.set-title", title: "Next" },
      }],
    }));

    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.commandLog?.[0]).toMatchObject({
      schemaVersion: 1,
      commandId: "legacy-title-1",
      origin: { kind: "legacy" },
      command: { type: "scene.set-title", payload: { title: "Next" } },
    });
  });
});

describe("pure command transactions", () => {
  it("validates the complete batch before invoking any projector", () => {
    let projectionCount = 0;
    const input: CounterState = { count: 1, labels: [] };
    const result = projectCommandTransaction(input, [
      envelope("add-valid", "counter.add", { amount: 2 }),
      envelope("add-invalid", "counter.add", { amount: 1.5 }),
    ], [addDefinition(() => { projectionCount += 1; })], "replay");

    expect(result.ok).toBe(false);
    expect(projectionCount).toBe(0);
    expect(input).toEqual({ count: 1, labels: [] });
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      phase: "validation",
      commandIndex: 1,
      commandId: "add-invalid",
    });
  });

  it("returns no partial state and preserves input when a later projector fails", () => {
    const failingDefinition: CommandDefinition<CounterState> = {
      type: "counter.fail",
      validate: (payload) => ({ ok: true, value: payload }),
      project: () => { throw new Error("fixture projection failure"); },
    };
    const input: CounterState = { count: 4, labels: ["original"] };
    const result = projectCommandTransaction(input, [
      envelope("add-before-failure", "counter.add", { amount: 3 }),
      envelope("project-failure", "counter.fail", {}),
    ], [addDefinition(), failingDefinition], "replay");

    expect(result.ok).toBe(false);
    expect(input).toEqual({ count: 4, labels: ["original"] });
    expect(result).not.toHaveProperty("state");
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ phase: "projection", commandIndex: 1 });
  });

  it("prevents projectors from mutating transaction state in place", () => {
    const mutatingDefinition: CommandDefinition<CounterState> = {
      type: "counter.mutate",
      validate: (payload) => ({ ok: true, value: payload }),
      project: (state) => {
        (state.labels as string[]).push("illegal");
        return state as CounterState;
      },
    };
    const input: CounterState = { count: 0, labels: [] };
    const result = projectCommandTransaction(input, [
      envelope("mutation-attempt", "counter.mutate", {}),
    ], [mutatingDefinition], "replay");

    expect(result.ok).toBe(false);
    expect(input.labels).toEqual([]);
  });

  it("rejects whole-scene replacement interactively but permits controlled replay", () => {
    const replaceDefinition: CommandDefinition<CounterState> = {
      type: "scene.replace",
      validate: (payload) => ({ ok: true, value: payload }),
      project: (_state, payload) => payloadRecord(payload)!.state as CounterState,
    };
    const command = envelope("controlled-replacement", "scene.replace", {
      state: { count: 9, labels: ["imported"] },
    });
    const interactive = projectCommandTransaction(
      { count: 0, labels: [] }, [command], [replaceDefinition], "interactive"
    );
    const replay = projectCommandTransaction(
      { count: 0, labels: [] }, [command], [replaceDefinition], "replay"
    );

    expect(interactive.ok).toBe(false);
    if (!interactive.ok) expect(interactive.errors[0]?.messages[0]).toMatch(/not allowed interactively/);
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.state).toEqual({ count: 9, labels: ["imported"] });
  });

  it("replays deterministically without diagnostic time influencing state", () => {
    const firstCommands = [
      envelope("add-2", "counter.add", { amount: 2 }, { issuedAt: 9999, label: "ignored" }),
      envelope("label-a", "counter.label", { label: "A" }),
      envelope("add-5", "counter.add", { amount: 5 }),
    ];
    const secondCommands = [
      envelope("add-2", "counter.add", { amount: 2 }, { issuedAt: 1, label: "also ignored" }),
      envelope("label-a", "counter.label", { label: "A" }),
      envelope("add-5", "counter.add", { amount: 5 }),
    ];
    const initial: CounterState = { count: 1, labels: [] };
    const first = projectCommandTransaction(initial, firstCommands, [addDefinition(), labelDefinition], "replay");
    const second = projectCommandTransaction(initial, secondCommands, [addDefinition(), labelDefinition], "replay");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.state).toEqual({ count: 8, labels: ["A"] });
    expect(first.state).toEqual(second.state);
    expect(structuralHash(first.state)).toBe(structuralHash(second.state));
  });
});
