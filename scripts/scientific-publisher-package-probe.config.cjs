"use strict";

// Narrow unpacked-app probe for the optional scientific publisher assets.
// This deliberately does not replace the full installer pipeline or its worker/web gates.
const base = require("../electron-builder.config.cjs");

module.exports = {
  ...base,
  directories: { ...base.directories, output: "output/scientific-publisher-package-probe" },
  extraResources: base.extraResources.filter((item) =>
    item.to === "scientific-scenes/sincos.sscene" || item.to === "scientific-scenes/thermal-gradient.sscene" ||
    item.to === "scientific-scenes/complex-wave.sscene" || item.to === "scientific-scenes/vortex-flow.sscene" ||
    item.to === "scientific-scenes/vortex-volume.sscene" ||
    item.to?.startsWith("scientific-publisher/")),
  win: { ...base.win, target: "dir" },
};
