import { join } from "node:path";

export type QuantumSceneExampleSummary = {
  id: string; label: string; description: string; model: "SSH" | "QWZ" | "BHZ" | "BBH" | "Kitaev" | "Weyl" | "Nodal" | "Landau" | "Hofstadter" | "Hydrogenic";
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
  { id: "bhz-bands", label: "BHZ · paired-block bulk bands", description: "Four producer-supplied bands and spin-conserved Z₂ with mesh status; no edge-state claim",
    model: "BHZ", fixtureGroup: "quantum-scene", folder: "run-b918512202b94cfaa0e181c9afd1f158-bands.qscene",
    fingerprint: "83f2d740e1bae2de189a595a660eb948b5af11b6a5735a8d06f7ac8593491684" },
  { id: "bhz-general-continuum", label: "BHZ · Atlas continuum bands", description: "Four verified continuum bands with A, B, C, D, M and optional spin mixing",
    model: "BHZ", fixtureGroup: "quantum-scene", folder: "run-c53d91611dd34bac80a93f9b56f0e74e-continuum-bands.qscene",
    fingerprint: "dd8f117df5608010b9084822a88a6fb315b51df05f1994f8d7cf41c5457db8a9" },
  { id: "bhz-general-lattice", label: "BHZ · lattice and ribbon", description: "Four lattice bands, inversion Z₂ and producer-supplied open-ribbon samples",
    model: "BHZ", fixtureGroup: "quantum-scene", folder: "run-c53d91611dd34bac80a93f9b56f0e74e-lattice-bands.qscene",
    fingerprint: "da10956e0e91257319d6af296f6cedac55d6597857b9c03e400c9789c1585893" },
  { id: "bbh-bands", label: "BBH · bulk bands", description: "Four producer-supplied periodic bands and sampled gap; no quadrupole invariant",
    model: "BBH", fixtureGroup: "quantum-scene", folder: "run-4fb258a3692f40479c097181ca9d779a-bands.qscene",
    fingerprint: "e9e5c5c1a09ad8c61a042d838c1be418f3d72d4e20352c5f42c057b7b5d999ee" },
  { id: "bbh-finite", label: "BBH · finite corner density", description: "Exact density samples from four midgap states on an open 4 × 4 lattice",
    model: "BBH", fixtureGroup: "quantum-scene", folder: "run-4fb258a3692f40479c097181ca9d779a-bbh-finite.qscene",
    fingerprint: "b3f31f31b4e70ebc93056a19727ae35838cea17485a69e8353cd9908ec706c7b" },
  { id: "bbh-wilson", label: "BBH · nested Wilson quadrupole", description: "Producer-supplied occupied Wilson branches, nested sector polarizations and gap validity",
    model: "BBH", fixtureGroup: "quantum-scene", folder: "run-7f366d57030b42c88d1c4afa89e059fe-bbh-wilson.qscene",
    fingerprint: "ab7df85c5968426640348da5c502bd09bceacb97fea09fe2268571e30acbeca6" },
  { id: "kitaev-bands", label: "Kitaev · supplied BdG bands", description: "Periodic spinless real-pairing bands and source bulk gap; no invariant",
    model: "Kitaev", fixtureGroup: "quantum-scene", folder: "run-18145016435540afafc5a2a06870566f-bands.qscene",
    fingerprint: "470c081952dc2f574d2166469e32e801db4b3c1b4269f0d2434c468ca4776a4f" },
  { id: "kitaev-finite", label: "Kitaev · finite end-site density", description: "Exact mean density of the near-zero pair on 16 open sites",
    model: "Kitaev", fixtureGroup: "quantum-scene", folder: "run-18145016435540afafc5a2a06870566f-kitaev-finite.qscene",
    fingerprint: "a6ae2fc98ab5f19c07452262c829cb3de07b37c4126844a4c749de3680d8356f" },
  { id: "kitaev-invariant", label: "Kitaev · bulk Pfaffian and winding", description: "Producer-supplied BdG chiral curve and conditional bulk invariant; finite end density stays separate",
    model: "Kitaev", fixtureGroup: "quantum-scene", folder: "run-75fb3f43371e40d58fc0eda2e8c14fa1-kitaev-invariant.qscene",
    fingerprint: "aeb6f86c4cce213919d8cbe70a52f95028470999e1136918c03ef848fec92515" },
  { id: "weyl-local", label: "Weyl · local enclosed node", description: "Verified enclosing-sphere Berry flux and exact supplied samples; no lattice or Fermi arcs",
    model: "Weyl", fixtureGroup: "quantum-scene", folder: "run-f8bf5412469c49b7bb878b8001d341cf-weyl.qscene",
    fingerprint: "e9aa57785442e2ddb1d8c8bd4caebdfbdc0caa55bd75955b225af47bae05f80c" },
  { id: "nodal-ring", label: "Nodal · continuum ring and Berry loop", description: "Exact producer-supplied ring, loop and band samples; no drumhead-state claim",
    model: "Nodal", fixtureGroup: "quantum-scene", folder: "run-404460538ac24288b4b1c0ee240551ee-nodal.qscene",
    fingerprint: "d36aacadbdce37feb960a1bbda3c41840500a41c50ad79c9d468f77db9a55342" },
  { id: "landau-levels", label: "Landau · continuum level fan", description: "Exact signed-field and level-energy samples; no Hall, edge, or plateau claim",
    model: "Landau", fixtureGroup: "quantum-scene", folder: "run-6758e75a58594f6d98ee98e7c9ac5e03-landau.qscene",
    fingerprint: "ecd2fd63ad0fa08012c517d83a7a1289703e4f89e32bddf43a278e4c50a0b416" },
  { id: "hofstadter-bands", label: "Hofstadter · Harper magnetic bands", description: "Four exact bands at reduced flux 1/4; no Chern or edge claim",
    model: "Hofstadter", fixtureGroup: "quantum-scene", folder: "run-9e46f98c78e842ebb12c92d5a73e8446-hofstadter.qscene",
    fingerprint: "d45afe591bae7bfc6bd8fffcc224a01c1dd62a9ebf32825434230da44bf9ec29" },
  { id: "hofstadter-chern", label: "Hofstadter · occupied-gap Chern", description: "Source-supplied FHS flux for gapped occupied subspaces; the touching middle gap is undefined",
    model: "Hofstadter", fixtureGroup: "quantum-scene", folder: "run-93c5726d6bce49e1b752916c751281e3-hofstadter.qscene",
    fingerprint: "313709c6b8c84a03b01f4ba99b728ad9aabe3f2197f14e4ed1f1b63483f2dac8" },
  { id: "hofstadter-strip", label: "Hofstadter · finite open strip", description: "Exact sorted strip energies and left/right boundary weights; no filled-level Hall claim",
    model: "Hofstadter", fixtureGroup: "quantum-scene", folder: "run-e02feae009f4467394f141d9291863bb-hofstadter-strip.qscene",
    fingerprint: "b9b0caaae37b36a5e5d0d8f85d98ee9735542c43ede2186538c51a673331d1b2" },
  { id: "hofstadter-hall", label: "Hofstadter · filled bulk Hall response", description: "One occupied band, resolved global gap, signed ideal e²/h value; no plateau or strip-channel claim",
    model: "Hofstadter", fixtureGroup: "quantum-scene", folder: "run-6008c2747b6a48dca666c7072a6e3756-hofstadter.qscene",
    fingerprint: "ca976485d14a650e81038be85c00a7b2768d87826b519a04a1ef56093a8c14ac" },
  { id: "hofstadter-butterfly", label: "Hofstadter · verified flux butterfly", description: "Six reduced rational fluxes, supplied periodic bands and conditional filled bulk Hall values; no plateau claim",
    model: "Hofstadter", fixtureGroup: "quantum-scene", folder: "fixture-hofstadter-flux-pq4-butterfly.qscene",
    fingerprint: "6fafae63130a5d21b3b2a1538913c4eeec35e61c07fa4a96fa8745fe11d2ad22" },
  { id: "hofstadter-bulk-edge", label: "Hofstadter · verified bulk–edge comparison", description: "One periodic bulk and two finite strips; sampled crossing consistency only where gap and width checks resolve",
    model: "Hofstadter", fixtureGroup: "quantum-scene", folder: "fixture-hofstadter-edge-1-3-edge.qscene",
    fingerprint: "6625329c1ce7ee2693e1bb1781badcd8f7cac97972c74d47198e4dae24030cbc" },
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
