"use strict";

// Isolated installed-app acceptance for the read-only quantum scene handoff.
// It uses the production renderer/main bundle and an independent app identity,
// without replacing a user's Math3D installation or bundling optional workers.
const base = require("../electron-builder.config.cjs");
const productName = "Math3D Quantum Handoff Probe";
module.exports = {
  ...base,
  appId: "org.expert10000.math3d.quantum-handoff-probe",
  productName,
  artifactName: "Math3D-Quantum-Handoff-Probe-Setup-${version}.${ext}",
  directories: { ...base.directories, output: "output/quantum-handoff-installed-probe" },
  extraResources: [],
  win: { ...base.win, target: "nsis" },
  nsis: { ...base.nsis, uninstallDisplayName: productName },
};
