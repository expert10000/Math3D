export type WorkspaceDockId = "surfaces" | "mesh" | "volume" | "curves" | "topology" | "geometry" | "complex";

export type WorkspaceDockLayout = {
  left: number;
  right: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  viewerMaximized: boolean;
};

export const WORKSPACE_DOCKS_STORAGE_KEY = "math3d.ui.workspaceDocks.v1";

const recommendedWidths: Record<WorkspaceDockId, Pick<WorkspaceDockLayout, "left" | "right">> = {
  surfaces: { left: 320, right: 300 },
  mesh: { left: 300, right: 420 },
  volume: { left: 340, right: 380 },
  curves: { left: 360, right: 320 },
  topology: { left: 340, right: 360 },
  geometry: { left: 460, right: 340 },
  complex: { left: 420, right: 380 },
};

export const recommendedWorkspaceDockLayout = (id: WorkspaceDockId): WorkspaceDockLayout => ({
  ...recommendedWidths[id],
  leftCollapsed: false,
  rightCollapsed: false,
  viewerMaximized: false,
});

export const normalizeWorkspaceDockLayout = (id: WorkspaceDockId, value: unknown): WorkspaceDockLayout => {
  const fallback = recommendedWorkspaceDockLayout(id);
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<WorkspaceDockLayout>;
  return {
    left: Number.isFinite(candidate.left) ? Math.max(240, Math.min(640, Number(candidate.left))) : fallback.left,
    right: Number.isFinite(candidate.right) ? Math.max(240, Math.min(640, Number(candidate.right))) : fallback.right,
    leftCollapsed: candidate.leftCollapsed === true,
    rightCollapsed: candidate.rightCollapsed === true,
    viewerMaximized: candidate.viewerMaximized === true,
  };
};

export const parseWorkspaceDockLayouts = (value: string | null): Partial<Record<WorkspaceDockId, WorkspaceDockLayout>> => {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    return (Object.keys(recommendedWidths) as WorkspaceDockId[]).reduce<Partial<Record<WorkspaceDockId, WorkspaceDockLayout>>>(
      (layouts, id) => ({ ...layouts, [id]: normalizeWorkspaceDockLayout(id, (parsed as Record<string, unknown>)[id]) }),
      {}
    );
  } catch {
    return {};
  }
};
