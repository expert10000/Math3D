const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  PYTHON_WORKER_MAX_QUEUED_JOBS,
  WorkerAdmissionQueue,
  WorkerRestartBudget,
} = require("./workerRuntimePolicy.ts");

describe("native worker runtime policy", () => {
  it("admits one active job, bounds the queue, and resumes work in order", async () => {
    const queue = new WorkerAdmissionQueue();
    const first = await queue.acquire("first", 4, Date.now() + 5000);
    const order = [];
    const second = queue.acquire("second", 4, Date.now() + 5000).then((release) => { order.push("second"); return release; });
    const third = queue.acquire("third", 4, Date.now() + 5000).then((release) => { order.push("third"); return release; });
    assert.deepEqual(queue.snapshot(), { active: 1, queued: 2, queuedBytes: 8 });
    for (let index = 0; index < PYTHON_WORKER_MAX_QUEUED_JOBS - 2; index += 1) {
      void queue.acquire(`extra-${index}`, 4, Date.now() + 5000).catch(() => undefined);
    }
    await assert.rejects(queue.acquire("overflow", 4, Date.now() + 5000), /queue is full/);
    first();
    const releaseSecond = await second;
    assert.deepEqual(order, ["second"]);
    releaseSecond();
    const releaseThird = await third;
    assert.deepEqual(order, ["second", "third"]);
    releaseThird();
    queue.close(new Error("worker stopped"));
    assert.equal(queue.snapshot().queued, 0);
  });

  it("expires waiting work and opens the restart circuit after three failures", async () => {
    const queue = new WorkerAdmissionQueue();
    const release = await queue.acquire("busy", 1, Date.now() + 5000);
    await assert.rejects(queue.acquire("expired", 1, Date.now() + 10), /expired in queue/);
    assert.equal(queue.snapshot().queued, 0);
    release();

    let now = 1000;
    const budget = new WorkerRestartBudget(() => now);
    for (let index = 0; index < 3; index += 1) budget.recordFailure();
    assert.equal(budget.canStart(), false);
    now += 5 * 60 * 1000 + 1;
    assert.equal(budget.canStart(), true);
  });

  it("runs an interactive request ahead of waiting heavy work", async () => {
    const queue = new WorkerAdmissionQueue();
    const active = await queue.acquire("active", 1, Date.now() + 5000);
    const order = [];
    const heavy = queue.acquire("heavy", 1, Date.now() + 5000).then((release) => { order.push("heavy"); return release; });
    const interactive = queue.acquire("preview", 1, Date.now() + 5000, "interactive").then((release) => { order.push("preview"); return release; });
    active();
    const releaseInteractive = await interactive;
    assert.deepEqual(order, ["preview"]);
    releaseInteractive();
    const releaseHeavy = await heavy;
    assert.deepEqual(order, ["preview", "heavy"]);
    releaseHeavy();
  });
});
