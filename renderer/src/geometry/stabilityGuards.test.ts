import { describe, expect, it } from "vitest";
import {
  filterGeometryDerivedProducts,
  filterGeometryMeshKeyRefs,
  filterGeometryObjectIdRefs,
  filterGeometryRecordByObjectIds,
  filterGeometrySavedSectionCurves,
  sanitizeGeometryComparePair,
  sanitizeGeometryPickRef,
} from "./stabilityGuards";

describe("geometry stability guards", () => {
  it("removes stale references after object deletion", () => {
    const validIds = new Set(["a", "b"]);

    const pair = sanitizeGeometryComparePair("a", "c", validIds);
    expect(pair).toEqual({ aId: "a", bId: null });

    const pick = sanitizeGeometryPickRef({ meshKey: "c", point: 1 }, validIds);
    expect(pick).toBeNull();

    const measured = filterGeometryMeshKeyRefs(
      [
        { id: "m1", meshKey: "a" },
        { id: "m2", meshKey: "c" },
      ],
      validIds
    );
    expect(measured).toEqual([{ id: "m1", meshKey: "a" }]);

    const annotations = filterGeometryObjectIdRefs(
      [
        { id: "ann1", objectId: "a" as string | null },
        { id: "ann2", objectId: "c" as string | null },
        { id: "ann3", objectId: null as string | null },
      ],
      validIds
    );
    expect(annotations).toEqual([
      { id: "ann1", objectId: "a" },
      { id: "ann3", objectId: null },
    ]);

    const sections = filterGeometrySavedSectionCurves(
      [
        { id: "s1", objectId: "a" },
        { id: "s2", objectId: "c" },
      ],
      validIds
    );
    expect(sections).toEqual([{ id: "s1", objectId: "a" }]);

    const history = filterGeometryRecordByObjectIds(
      {
        a: [{ step: 1 }],
        c: [{ step: 2 }],
      },
      validIds
    );
    expect(Object.keys(history)).toEqual(["a"]);

    const derived = filterGeometryDerivedProducts(
      [
        { id: "d1", linkedObjectIds: ["a"], resultObjectId: "b" },
        { id: "d2", linkedObjectIds: ["c"], resultObjectId: "b" },
        { id: "d3", linkedObjectIds: ["a"], resultObjectId: "c" },
      ],
      validIds
    );
    expect(derived).toEqual([{ id: "d1", linkedObjectIds: ["a"], resultObjectId: "b" }]);
  });

  it("survives stress workflow with create/edit/undo-redo/save-load/delete-reload", () => {
    type Session = {
      validIds: Set<string>;
      compareA: string | null;
      compareB: string | null;
      pick: { meshKey?: string | null } | null;
      hover: { meshKey?: string | null } | null;
      measured: Array<{ meshKey: string }>;
      marked: Array<{ meshKey: string }>;
      annotations: Array<{ objectId: string | null }>;
      sections: Array<{ objectId: string }>;
      history: Record<string, Array<{ op: string; n: number }>>;
      revision: Record<string, number>;
      derived: Array<{ linkedObjectIds?: string[]; resultObjectId?: string }>;
    };

    const sanitize = (session: Session): Session => {
      const pair = sanitizeGeometryComparePair(session.compareA, session.compareB, session.validIds);
      return {
        ...session,
        compareA: pair.aId,
        compareB: pair.bId,
        pick: sanitizeGeometryPickRef(session.pick, session.validIds),
        hover: sanitizeGeometryPickRef(session.hover, session.validIds),
        measured: filterGeometryMeshKeyRefs(session.measured, session.validIds),
        marked: filterGeometryMeshKeyRefs(session.marked, session.validIds),
        annotations: filterGeometryObjectIdRefs(session.annotations, session.validIds),
        sections: filterGeometrySavedSectionCurves(session.sections, session.validIds),
        history: filterGeometryRecordByObjectIds(session.history, session.validIds),
        revision: filterGeometryRecordByObjectIds(session.revision, session.validIds),
        derived: filterGeometryDerivedProducts(session.derived, session.validIds),
      };
    };

    const assertNoStaleRefs = (session: Session) => {
      if (session.compareA) expect(session.validIds.has(session.compareA)).toBe(true);
      if (session.compareB) expect(session.validIds.has(session.compareB)).toBe(true);
      if (session.compareA && session.compareB) expect(session.compareA).not.toBe(session.compareB);
      if (session.pick?.meshKey) expect(session.validIds.has(session.pick.meshKey)).toBe(true);
      if (session.hover?.meshKey) expect(session.validIds.has(session.hover.meshKey)).toBe(true);
      for (const edge of session.measured) expect(session.validIds.has(edge.meshKey)).toBe(true);
      for (const edge of session.marked) expect(session.validIds.has(edge.meshKey)).toBe(true);
      for (const ann of session.annotations) {
        if (ann.objectId) expect(session.validIds.has(ann.objectId)).toBe(true);
      }
      for (const section of session.sections) expect(session.validIds.has(section.objectId)).toBe(true);
      for (const key of Object.keys(session.history)) expect(session.validIds.has(key)).toBe(true);
      for (const key of Object.keys(session.revision)) expect(session.validIds.has(key)).toBe(true);
      for (const entry of session.derived) {
        for (const id of entry.linkedObjectIds ?? []) expect(session.validIds.has(id)).toBe(true);
        if (entry.resultObjectId) expect(session.validIds.has(entry.resultObjectId)).toBe(true);
      }
    };

    let session: Session = {
      validIds: new Set(),
      compareA: null,
      compareB: null,
      pick: null,
      hover: null,
      measured: [],
      marked: [],
      annotations: [],
      sections: [],
      history: {},
      revision: {},
      derived: [],
    };

    // create 100 objects
    for (let i = 0; i < 100; i++) {
      const id = `obj-${i}`;
      session.validIds.add(id);
      session.history[id] = [{ op: "create", n: i }];
      session.revision[id] = 0;
    }
    session.compareA = "obj-1";
    session.compareB = "obj-2";
    session.pick = { meshKey: "obj-3" };
    session.hover = { meshKey: "obj-4" };
    session.measured = [{ meshKey: "obj-5" }, { meshKey: "obj-6" }];
    session.marked = [{ meshKey: "obj-7" }];
    session.annotations = [{ objectId: "obj-8" }, { objectId: null }];
    session.sections = [{ objectId: "obj-9" }];
    session = sanitize(session);
    assertNoStaleRefs(session);

    // apply 100 transforms
    for (let i = 0; i < 100; i++) {
      const id = `obj-${i}`;
      session.revision[id] = (session.revision[id] ?? 0) + 1;
      session.history[id] = [...(session.history[id] ?? []), { op: "transform", n: i }];
    }

    // apply face edits repeatedly
    for (let i = 0; i < 100; i++) {
      const id = `obj-${i % 20}`;
      session.revision[id] = (session.revision[id] ?? 0) + 1;
      session.history[id] = [...(session.history[id] ?? []), { op: "face-edit", n: i }];
    }

    // undo/redo 100 times (modeled as revision/history changes)
    const undoStack: Array<{ id: string; op: string }> = [];
    const redoStack: Array<{ id: string; op: string }> = [];
    for (let i = 0; i < 100; i++) {
      const id = `obj-${i % 20}`;
      undoStack.push({ id, op: `edit-${i}` });
      session.revision[id] = Math.max(0, (session.revision[id] ?? 0) - 1);
    }
    for (let i = 0; i < 100; i++) {
      const last = undoStack.pop();
      if (!last) break;
      redoStack.push(last);
      session.revision[last.id] = Math.max(0, (session.revision[last.id] ?? 0) + 1);
    }
    for (let i = 0; i < 100; i++) {
      const last = redoStack.pop();
      if (!last) break;
      undoStack.push(last);
      session.revision[last.id] = Math.max(0, (session.revision[last.id] ?? 0) - 1);
    }

    // compare many object pairs
    for (let i = 0; i < 50; i++) {
      session.compareA = `obj-${i}`;
      session.compareB = `obj-${(i + 1) % 100}`;
      session = sanitize(session);
    }

    // save/load project
    const serialized = JSON.stringify({
      ...session,
      validIds: Array.from(session.validIds),
    });
    const restoredRaw = JSON.parse(serialized) as Omit<Session, "validIds"> & { validIds: string[] };
    session = sanitize({
      ...restoredRaw,
      validIds: new Set(restoredRaw.validIds),
    });
    assertNoStaleRefs(session);

    // promote to mesh + derived result object
    session.validIds.add("mesh-promoted-0");
    session.derived.push({ linkedObjectIds: ["obj-0"], resultObjectId: "mesh-promoted-0" });
    session = sanitize(session);
    assertNoStaleRefs(session);

    // delete source object
    session.validIds.delete("obj-0");
    session = sanitize(session);
    expect(session.compareA).not.toBe("obj-0");
    expect(session.compareB).not.toBe("obj-0");
    expect(session.pick?.meshKey).not.toBe("obj-0");
    assertNoStaleRefs(session);

    // reload scene and verify no ghost references remain
    const reload = JSON.parse(
      JSON.stringify({
        ...session,
        validIds: Array.from(session.validIds),
      })
    ) as Omit<Session, "validIds"> & { validIds: string[] };
    const reloaded = sanitize({
      ...reload,
      validIds: new Set(reload.validIds),
    });
    assertNoStaleRefs(reloaded);
  });
});
