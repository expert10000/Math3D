import { join } from "node:path";

export type QuantumSceneExampleSummary = {
  id: string; label: string; description: string; model: "SSH" | "QWZ" | "Hydrogenic";
};
type BundledExample = QuantumSceneExampleSummary & {
  fixtureGroup: "quantum-scene" | "quantum-scene-orbitals";
  folder: string; fingerprint: string;
};

/** Pinned, already verified Theory Lab exports. No scene is generated in Math3D. */
export const BUNDLED_QUANTUM_SCENE_EXAMPLES: readonly BundledExample[] = [
  { id: "qwz-curvature", label: "QWZ · Berry curvature", description: "Signed curvature surface, zone guides and reciprocal vectors",
    model: "QWZ", fixtureGroup: "quantum-scene", folder: "run-97a132d1d712414bb62bb8c9212f517e.qscene",
    fingerprint: "a0c0e7947516f2f4132b15155096b9711b3c7eae207f805e9a066371035570b3" },
  { id: "qwz-bands", label: "QWZ · energy bands", description: "Two supplied band surfaces over the Brillouin zone",
    model: "QWZ", fixtureGroup: "quantum-scene", folder: "run-97a132d1d712414bb62bb8c9212f517e-bands.qscene",
    fingerprint: "06d389b6094b1633a161252bf0bb8c4bba64f0266294578a3b0b0fd8b7c4e061" },
  { id: "ssh-chain", label: "SSH · finite chain", description: "Supplied sites, bonds and edge-localization context",
    model: "SSH", fixtureGroup: "quantum-scene", folder: "run-145ac3f06cb940c28d457937345b0243.qscene",
    fingerprint: "58c8bd8705e0f3b2bfc694460a38a275187d0bde1df93faf30fd2d5e20afd0b6" },
  { id: "ssh-bands", label: "SSH · energy bands", description: "Two supplied bands along a one-dimensional k path",
    model: "SSH", fixtureGroup: "quantum-scene", folder: "run-145ac3f06cb940c28d457937345b0243-bands.qscene",
    fingerprint: "57e56d34e2dfe218f70a2c9bcd6068c6b733ac00abbdb8f72d63b57e9370521b" },
  { id: "hydrogen-1s", label: "Hydrogenic · 1s", description: "Verified scalar and complex orbital field",
    model: "Hydrogenic", fixtureGroup: "quantum-scene-orbitals", folder: "orbital-1s.qscene",
    fingerprint: "b7b996f012fbd503d9e3a9b87e5b326e6dafb317dc308c69bff174151e96b2a7" },
  { id: "hydrogen-2s", label: "Hydrogenic · 2s", description: "Orbital field with a radial node",
    model: "Hydrogenic", fixtureGroup: "quantum-scene-orbitals", folder: "orbital-2s.qscene",
    fingerprint: "3895440f551d204898b49424293019ce01009b13442d750a655f744f324007fc" },
  { id: "hydrogen-2p", label: "Hydrogenic · 2p", description: "Orbital field with angular structure",
    model: "Hydrogenic", fixtureGroup: "quantum-scene-orbitals", folder: "orbital-2p.qscene",
    fingerprint: "55379e422fa98bcb6f29ed1ac6380a34b6586face6070a37e1ca2436823526b5" },
  { id: "hydrogen-3p", label: "Hydrogenic · 3p", description: "Real-basis orbital field",
    model: "Hydrogenic", fixtureGroup: "quantum-scene-orbitals", folder: "orbital-3p.qscene",
    fingerprint: "6b9148c8337051a56c0bc49e3027fa6173987582ff28f26cfcbaffd66c665cc8" },
  { id: "hydrogen-3d", label: "Hydrogenic · 3d", description: "Complex orbital field with angular nodes",
    model: "Hydrogenic", fixtureGroup: "quantum-scene-orbitals", folder: "orbital-3d.qscene",
    fingerprint: "bba0b0610a809260da3e4b9e9a5f210f54776ffff2b9f821aa2eba9ed882703b" },
];

export function listBundledQuantumSceneExamples(): QuantumSceneExampleSummary[] {
  return BUNDLED_QUANTUM_SCENE_EXAMPLES.map(({ id, label, description, model }) => ({ id, label, description, model }));
}

export function bundledQuantumSceneExample(id: unknown): BundledExample {
  const example = typeof id === "string" ? BUNDLED_QUANTUM_SCENE_EXAMPLES.find(item => item.id === id) : undefined;
  if (!example) throw new TypeError("Unknown bundled quantum scene example");
  return example;
}

export function bundledQuantumSceneDirectory(example: BundledExample, appPath: string, resourcesPath: string,
  packaged: boolean): string {
  return packaged ? join(resourcesPath, "quantum-scenes", example.fixtureGroup, example.folder) :
    join(appPath, "tests", "fixtures", example.fixtureGroup, example.folder);
}
