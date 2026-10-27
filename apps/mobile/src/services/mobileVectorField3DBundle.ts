import { Directory, File } from "expo-file-system";
import { MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES } from "@math3d/core";
import type { MobileScientificFileReader } from "../models/mobileVectorField3D";

/** Android's directory picker grants temporary access; files are re-read on each render request. */
export const pickMobileVectorField3DBundle = async () => (await Directory.pickDirectoryAsync()).uri;

export const mobileVectorField3DDirectoryReader = (directoryUri: string): MobileScientificFileReader =>
  async name => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes(".."))
      throw new TypeError("Invalid scientific bundle path.");
    const file = new File(directoryUri, name);
    if (!file.exists) return null;
    if (file.size < 1 || file.size > MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES)
      throw new TypeError(`Scientific bundle file is over budget: ${name}.`);
    return file.bytes();
  };
