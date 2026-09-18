export const PYTHON_WORKER_MAX_QUEUED_JOBS = 8;
export const PYTHON_WORKER_MAX_INPUT_BYTES = 1024 * 1024 * 1024;
export const PYTHON_WORKER_MAX_QUEUED_BYTES = 512 * 1024 * 1024;
export const PYTHON_WORKER_RESTART_LIMIT = 3;
export const PYTHON_WORKER_RESTART_WINDOW_MS = 5 * 60 * 1000;

type Waiter = {
  id: string;
  bytes: number;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  priority: "interactive" | "normal";
};

/** One native process executes one request; queued payloads have a separate RAM cap. */
export class WorkerAdmissionQueue {
  private active = false;
  private readonly waiting: Waiter[] = [];
  private queuedBytes = 0;
  private closed: Error | null = null;

  snapshot() { return { active: this.active ? 1 : 0, queued: this.waiting.length, queuedBytes: this.queuedBytes }; }

  acquire(id: string, bytes: number, deadlineAt: number, priority: "interactive" | "normal" = "normal"): Promise<() => void> {
    if (this.closed) return Promise.reject(this.closed);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > PYTHON_WORKER_MAX_INPUT_BYTES) {
      return Promise.reject(new RangeError(`Python worker request exceeds ${PYTHON_WORKER_MAX_INPUT_BYTES} input bytes.`));
    }
    if (deadlineAt <= Date.now()) return Promise.reject(new Error(`Python worker request ${id} expired in queue.`));
    if (!this.active && this.waiting.length === 0) {
      this.active = true;
      return Promise.resolve(this.release());
    }
    if (this.waiting.length >= PYTHON_WORKER_MAX_QUEUED_JOBS || this.queuedBytes + bytes > PYTHON_WORKER_MAX_QUEUED_BYTES) {
      return Promise.reject(new Error("Python worker queue is full."));
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        id, bytes, resolve, reject, priority,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(waiter);
          if (index < 0) return;
          this.waiting.splice(index, 1);
          this.queuedBytes -= bytes;
          reject(new Error(`Python worker request ${id} expired in queue.`));
        }, deadlineAt - Date.now()),
      };
      if (priority === "interactive") {
        const firstNormal = this.waiting.findIndex((item) => item.priority === "normal");
        this.waiting.splice(firstNormal < 0 ? this.waiting.length : firstNormal, 0, waiter);
      } else {
        this.waiting.push(waiter);
      }
      this.queuedBytes += bytes;
    });
  }

  close(error: Error): void {
    if (this.closed) return;
    this.closed = error;
    for (const waiter of this.waiting.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.queuedBytes = 0;
  }

  private release(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (!next) { this.active = false; return; }
      this.queuedBytes -= next.bytes;
      clearTimeout(next.timer);
      next.resolve(this.release());
    };
  }
}

/** Three unexpected failures in five minutes open the restart circuit. */
export class WorkerRestartBudget {
  private failures: number[] = [];
  constructor(private readonly now: () => number = Date.now) {}
  recordFailure(): void { this.trim(); this.failures.push(this.now()); }
  canStart(): boolean { this.trim(); return this.failures.length < PYTHON_WORKER_RESTART_LIMIT; }
  snapshot() {
    this.trim();
    return {
      failuresInWindow: this.failures.length,
      retryAfter: this.failures.length >= PYTHON_WORKER_RESTART_LIMIT ? this.failures[0]! + PYTHON_WORKER_RESTART_WINDOW_MS : null,
    };
  }
  private trim(): void {
    const cutoff = this.now() - PYTHON_WORKER_RESTART_WINDOW_MS;
    this.failures = this.failures.filter((at) => at > cutoff);
  }
}
