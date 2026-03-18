import type { CameraPreset, OverlayDefinition, SceneDocument, SurfaceDefinition } from "./sceneDocument";
import type { GeometryObject } from "./sceneObjects";

export type SceneCommand =
  | {
      type: "scene.set-title";
      title: string;
    }
  | {
      type: "scene.set-metadata";
      metadata: Record<string, string | number | boolean | null>;
    }
  | {
      type: "object.upsert";
      object: GeometryObject;
    }
  | {
      type: "object.remove";
      objectId: string;
    }
  | {
      type: "surface.upsert";
      surface: SurfaceDefinition;
    }
  | {
      type: "surface.remove";
      surfaceId: string;
    }
  | {
      type: "overlay.upsert";
      overlay: OverlayDefinition;
    }
  | {
      type: "overlay.remove";
      overlayId: string;
    }
  | {
      type: "camera.upsert";
      camera: CameraPreset;
    }
  | {
      type: "camera.set-active";
      cameraId: string | null;
    }
  | {
      type: "scene.replace";
      scene: SceneDocument;
    };

export type CommandEnvelope = {
  id: string;
  timestamp: number;
  actor?: string;
  command: SceneCommand;
};
