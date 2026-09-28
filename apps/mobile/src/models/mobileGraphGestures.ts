import { panGraph2DViewport, zoomGraph2DViewport, type Graph2DViewport,
  type Graph2DScreenSize, type Graph2DScreenPoint } from "@math3d/core";

export type GraphTouch = Graph2DScreenPoint & { id: string | number };
const ordered = (touches: readonly GraphTouch[]) => [...touches].sort((a, b) => String(a.id).localeCompare(String(b.id)));
const center = (touches: readonly GraphTouch[]) => touches.length === 1 ? touches[0]! :
  { x: (touches[0]!.x + touches[1]!.x) / 2, y: (touches[0]!.y + touches[1]!.y) / 2 };
const distance = (touches: readonly GraphTouch[]) => touches.length < 2 ? 1 :
  Math.max(1, Math.hypot(touches[0]!.x - touches[1]!.x, touches[0]!.y - touches[1]!.y));

/** A multi-pointer session is transient until its last pointer ends: one undo step, or none on cancel. */
export class MobileGraphGesture {
  #original: Graph2DViewport | null = null;
  #baseline: Graph2DViewport | null = null;
  #preview: Graph2DViewport | null = null;
  #size: Graph2DScreenSize = { width: 1, height: 1 };
  #anchors: readonly GraphTouch[] = [];
  #moved = false;
  #multiple = false;
  begin(viewport: Graph2DViewport, size: Graph2DScreenSize, touches: readonly GraphTouch[]) {
    this.cancel();
    if (!touches.length || touches.length > 2) return;
    this.#original = viewport; this.#baseline = viewport; this.#preview = viewport;
    this.#size = size; this.#anchors = ordered(touches); this.#multiple = touches.length > 1;
  }
  update(touches: readonly GraphTouch[]): Graph2DViewport | null {
    if (!this.#original || !this.#baseline || !touches.length) return this.#preview;
    if (touches.length > 2 || touches.some((touch) => !Number.isFinite(touch.x) || !Number.isFinite(touch.y))) {
      this.cancel(); return null;
    }
    const current = ordered(touches);
    this.#multiple ||= current.length > 1;
    if (current.map((touch) => touch.id).join() !== this.#anchors.map((touch) => touch.id).join()) {
      this.#anchors = current; this.#baseline = this.#preview; return this.#preview;
    }
    const from = center(this.#anchors), to = center(current);
    const factor = distance(current) / distance(this.#anchors);
    if (Math.hypot(to.x - from.x, to.y - from.y) > 6 || Math.abs(Math.log(factor)) > 0.02) this.#moved = true;
    if (!this.#moved) return this.#preview;
    const zoomed = current.length > 1 ? zoomGraph2DViewport(this.#baseline, this.#size, from, factor) : this.#baseline;
    this.#preview = panGraph2DViewport(zoomed, this.#size, { x: to.x - from.x, y: to.y - from.y });
    return this.#preview;
  }
  finish(): { viewport: Graph2DViewport | null; tap: Graph2DScreenPoint | null } {
    const result = { viewport: this.#moved ? this.#preview : null,
      tap: this.#original && !this.#moved && !this.#multiple ? center(this.#anchors) : null };
    this.cancel(); return result;
  }
  cancel(): Graph2DViewport | null {
    const original = this.#original;
    this.#original = null; this.#baseline = null; this.#preview = null; this.#anchors = [];
    this.#moved = false; this.#multiple = false;
    return original;
  }
}

/** Logical pixels adapt to small screens; haptics are optional and never required for probing. */
export const mobileGraphProbeRadius = (width: number): number => Math.max(22, Math.min(34, width * 0.065));
