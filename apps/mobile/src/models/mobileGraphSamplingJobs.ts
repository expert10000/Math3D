export interface MobileGraphScheduler {
  frame(callback: () => void): number;
  cancelFrame(handle: number): void;
  delay(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  cancelDelay(handle: ReturnType<typeof setTimeout>): void;
}

/** Coalesce previews and discard deferred refinements on a new viewport/source or pause. */
export class MobileGraphSamplingJobs {
  #generation = 0;
  #frames = new Set<number>();
  #delays = new Set<ReturnType<typeof setTimeout>>();
  constructor(private readonly scheduler: MobileGraphScheduler) {}
  cancel() {
    ++this.#generation;
    for (const handle of this.#frames) this.scheduler.cancelFrame(handle);
    for (const handle of this.#delays) this.scheduler.cancelDelay(handle);
    this.#frames.clear(); this.#delays.clear();
  }
  request(preview: () => void, refine?: () => boolean | void) {
    this.cancel(); const generation = this.#generation;
    const frame = (work: () => void) => {
      const handle = this.scheduler.frame(() => {
        this.#frames.delete(handle);
        if (generation === this.#generation) work();
      });
      this.#frames.add(handle);
    };
    frame(preview);
    const defer = (work: () => void, ms: number) => {
      const handle = this.scheduler.delay(() => {
        this.#delays.delete(handle);
        if (generation === this.#generation) frame(work);
      }, ms);
      this.#delays.add(handle);
    };
    if (refine) {
      let retries = 0;
      const settle = () => {
        // Cold resume/layout can exhaust a tiny quantum before producing geometry.
        // Retry only deadline-limited refinement, at most twice, never a busy loop.
        if (refine() === true && retries++ < 2 && generation === this.#generation) defer(settle, 240 * retries);
      };
      defer(settle, 160);
    }
  }
}
