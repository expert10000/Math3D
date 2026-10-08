import type { KernelWorkspaceModule } from "@math3d/core";
export type ProjectDocumentLocation = { id: string; module: KernelWorkspaceModule };
/** Bounded presentation history; scientific undo and source generations are independent. */
export class ProjectNavigation {
  private entries: ProjectDocumentLocation[] = [];
  private cursor = -1;
  visit(location: ProjectDocumentLocation) {
    if (this.entries[this.cursor]?.id === location.id) return;
    this.entries = [...this.entries.slice(0, this.cursor + 1), location].slice(-32);
    this.cursor = this.entries.length - 1;
  }
  get canBack() { return this.cursor > 0; }
  get canForward() { return this.cursor < this.entries.length - 1; }
  back() { return this.canBack ? this.entries[--this.cursor] : null; }
  forward() { return this.canForward ? this.entries[++this.cursor] : null; }
}
