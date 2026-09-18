import { describe, expect, it } from "vitest";
import {
  PYTHON_WORKER_MAX_QUEUED_JOBS,
  WorkerAdmissionQueue,
  WorkerRestartBudget,
} from "../../../src/main/python/workerRuntimePolicy";

describe("native worker runtime policy", () => {
  it("admits one active job, bounds the queue, and resumes work in order", async () => {
    const queue = new WorkerAdmissionQueue();
    const first = await queue.acquire("first", 4, Date.now() + 5000);
    const order: string[] = [];
    const second = queue.acquire("second", 4, Date.now() + 5000).then((release) => { order.push("second"); return release; });
    const third = queue.acquire("third", 4, Date.now() + 5000).then((release) => { order.push("third"); return release; });
    expect(queue.snapshot()).toEqual({ active: 1, queued: 2, queuedBytes: 8 });
    for (let index = 0; index < PYTHON_WORKER_MAX_QUEUED_JOBS - 2; index += 1) {
      void queue.acquire(`extra-${index}`, 4, Date.now() + 5000).catch(() => undefined);
    }
    await expect(queue.acquire("overflow", 4, Date.now() + 5000)).rejects.toThrow(/queue is full/);
    first();
    const releaseSecond = await second;
    expect(order).toEqual(["second"]);
    releaseSecond();
    const releaseThird = await third;
    expect(order).toEqual(["second", "third"]);
    releaseThird();
    queue.close(new Error("worker stopped"));
    expect(queue.snapshot().queued).toBe(0);
  });

  it("expires waiting work and opens the restart circuit after three failures", async () => {
    const queue = new WorkerAdmissionQueue();
    const release = await queue.acquire("busy", 1, Date.now() + 5000);
    await expect(queue.acquire("expired", 1, Date.now() + 10)).rejects.toThrow(/expired in queue/);
    expect(queue.snapshot().queued).toBe(0);
    release();

    let now = 1000;
    const budget = new WorkerRestartBudget(() => now);
    for (let index = 0; index < 3; index += 1) budget.recordFailure();
    expect(budget.canStart()).toBe(false);
    now += 5 * 60 * 1000 + 1;
    expect(budget.canStart()).toBe(true);
  });

  it("runs an interactive request ahead of waiting heavy work", async () => {
    const queue = new WorkerAdmissionQueue();
    const active = await queue.acquire("active", 1, Date.now() + 5000);
    const order: string[] = [];
    const heavy = queue.acquire("heavy", 1, Date.now() + 5000).then((release) => { order.push("heavy"); return release; });
    const interactive = queue.acquire("preview", 1, Date.now() + 5000, "interactive").then((release) => { order.push("preview"); return release; });
    active();
    const releaseInteractive = await interactive;
    expect(order).toEqual(["preview"]);
    releaseInteractive();
    const releaseHeavy = await heavy;
    expect(order).toEqual(["preview", "heavy"]);
    releaseHeavy();
  });
});
