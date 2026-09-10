export type SharedPickWorkspace = "geometry" | "mesh";
export type SharedTopologyPickKind = "object" | "face" | "edge" | "vertex";
export type SharedPickVec3 = [number, number, number];

export interface SharedPickTargetContract {
  readonly objectId: string;
  readonly objectLabel: string;
  readonly objectType?: string | null;
  readonly sceneEntityId?: string | null;
  readonly sourceSceneEntityId?: string | null;
  readonly sourceRevision?: number | null;
}

export interface SharedPickSpatialContract {
  readonly worldPoint: SharedPickVec3;
  readonly localPoint?: SharedPickVec3 | null;
  readonly normal?: SharedPickVec3 | null;
}

export interface SharedPickContract<TKind extends string = SharedTopologyPickKind>
  extends SharedPickTargetContract,
    SharedPickSpatialContract {
  readonly workspace: SharedPickWorkspace;
  readonly kind: TKind;
  readonly pickEntityId: string;
  readonly label: string;
  readonly stale?: boolean;
}

const encode = (value: string | number): string => encodeURIComponent(String(value));

export const sharedPickEntityId = (input: {
  workspace: SharedPickWorkspace;
  objectId: string;
  kind: string;
  localId?: string | number | null;
}): string =>
  ["pick-v1", input.workspace, input.objectId, input.kind, input.localId ?? "root"].map(encode).join(":");

export const createSharedPickContract = <TKind extends string>(input: {
  workspace: SharedPickWorkspace;
  kind: TKind;
  objectId: string;
  objectLabel: string;
  objectType?: string | null;
  sceneEntityId?: string | null;
  sourceSceneEntityId?: string | null;
  sourceRevision?: number | null;
  localId?: string | number | null;
  worldPoint?: SharedPickVec3 | null;
  localPoint?: SharedPickVec3 | null;
  normal?: SharedPickVec3 | null;
  label: string;
  stale?: boolean;
}): SharedPickContract<TKind> => ({
  workspace: input.workspace,
  kind: input.kind,
  objectId: input.objectId,
  objectLabel: input.objectLabel,
  objectType: input.objectType ?? null,
  sceneEntityId: input.sceneEntityId ?? null,
  sourceSceneEntityId: input.sourceSceneEntityId ?? null,
  sourceRevision: input.sourceRevision ?? null,
  pickEntityId: sharedPickEntityId({
    workspace: input.workspace,
    objectId: input.objectId,
    kind: input.kind,
    localId: input.localId,
  }),
  worldPoint: input.worldPoint ?? [0, 0, 0],
  localPoint: input.localPoint ?? null,
  normal: input.normal ?? null,
  label: input.label,
  stale: input.stale ?? false,
});
