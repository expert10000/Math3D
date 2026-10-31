import { Directory, File } from "expo-file-system";
import { MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES } from "@math3d/core";
import type { MobileScientificFileReader } from "../models/mobileVectorField3D";

/** Android's directory picker grants temporary access; files are re-read on each render request. */
export const pickMobileVectorField3DBundle = async () => (await Directory.pickDirectoryAsync()).uri;

export const mobileVectorField3DDirectoryReader = (directoryUri: string): MobileScientificFileReader =>
  async name => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes(".."))
      throw new TypeError("Invalid scientific bundle path.");
    // A picked Android folder is a SAF tree URI. Joining a filename onto that URI
    // does not produce a child document URI; resolve it through the provider.
    const entry = new Directory(directoryUri).list().find(item => item instanceof File && item.name === name);
    if (!entry) return null;
    // Expo's Android listAsRecords appends '/' to each returned URI, including files.
    const file = new File(entry.uri.replace(/\/$/, ""));
    if (!file.exists) return null;
    if (file.size < 1 || file.size > MAX_SCIENTIFIC_SCENE_RESOURCE_BYTES)
      throw new TypeError(`Scientific bundle file is over budget: ${name}.`);
    return file.bytes();
  };
