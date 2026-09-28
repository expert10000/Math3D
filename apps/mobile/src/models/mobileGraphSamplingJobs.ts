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
  request(preview: () => void, refine?: () => void) {
    this.cancel(); const generation = this.#generation;
    const frame = (work: () => void) => {
      const handle = this.scheduler.frame(() => {
        this.#frames.delete(handle);
        if (generation === this.#generation) work();
      });
      this.#frames.add(handle);
    };
    frame(preview);
    if (refine) {
      const handle = this.scheduler.delay(() => {
        this.#delays.delete(handle);
        if (generation === this.#generation) frame(refine);
      }, 160);
      this.#delays.add(handle);
    }
  }
}
