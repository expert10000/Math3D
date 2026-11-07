# M3D20-15c — screenshot provenance gate

The current public gallery is a **source-build gallery**. Its browser and quantum capture indexes do not identify an exact release commit, while Field Explorer and module analysis manifests do. Cards show the recorded short source commit where available and **build unpinned** otherwise. None of these images is labeled as a signed 2.0 installer capture.

Before a `release-2.0.0` screenshot folder or its images can be used by the public site, the site build requires:

- an exact stable 2.0.0 candidate manifest and the installer whose SHA-256 matches it;
- passing fresh-install evidence for that same source commit and installer, including signature, installed resources, worker without Python, and first-use Study checks;
- a `release-2.0.0/manifest.json` with `math3d/release20-gallery/v1`, the same commit and installer digest, and at least one Surface, Quantum, and Algebra capture;
- each capture's decoded PNG (at least 1400×900), SHA-256, scenario, source hash, and a separate hashed `math3d/release20-scene-capture/v1` evidence JSON stating the exact installed version, commit, installer, verified source, and installed UI capture result.

Run `node scripts/verify-release20-gallery.mjs <candidate-manifest> <installer> <fresh-install-evidence> <gallery-dir>` to check the exact files. The public-site build invokes the gate whenever a `release-2.0.0` folder exists; set `MATH3D_RELEASE20_CANDIDATE_MANIFEST`, `MATH3D_RELEASE20_INSTALLER`, and `MATH3D_RELEASE20_FRESH_EVIDENCE` to those exact paths. A page reference to a 2.0 image without the folder also fails. The fixture test mutates image, scene evidence, and installer identity to verify rejection.

This gate checks consistency and integrity of evidence. A JSON file alone cannot prove a person visually reviewed a capture. The capture process must still produce scene evidence from a real installed app run, and the release reviewer must inspect the images. No exact 2.0 candidate is present yet, so no 2.0 screenshot signoff is claimed.
