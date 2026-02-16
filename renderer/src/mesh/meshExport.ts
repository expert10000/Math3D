import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import type { SurfaceMeshData } from "./surfaceMesh";
import { surfaceMeshToGeometry } from "./surfaceMesh";

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const buildMeshObject = (mesh: SurfaceMeshData) => {
  const geom = surfaceMeshToGeometry(mesh);
  if (!geom.getAttribute("normal")) {
    geom.computeVertexNormals();
  }
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 1 });
  const obj = new THREE.Mesh(geom, material);
  obj.name = mesh.label || "surface_mesh";
  return obj;
};

export async function exportMeshToGLB(mesh: SurfaceMeshData, filename: string): Promise<void> {
  const exporter = new GLTFExporter();
  const obj = buildMeshObject(mesh);

  return new Promise((resolve, reject) => {
    exporter.parse(
      obj,
      (res) => {
        if (res instanceof ArrayBuffer) {
          downloadBlob(new Blob([res], { type: "model/gltf-binary" }), filename);
          resolve();
          return;
        }
        const json = JSON.stringify(res);
        downloadBlob(new Blob([json], { type: "application/json" }), filename);
        resolve();
      },
      (err) => reject(err),
      { binary: true }
    );
  });
}

export function exportMeshToOBJ(mesh: SurfaceMeshData, filename: string): void {
  const exporter = new OBJExporter();
  const obj = buildMeshObject(mesh);
  const data = exporter.parse(obj);
  downloadBlob(new Blob([data], { type: "text/plain;charset=utf-8" }), filename);
}
