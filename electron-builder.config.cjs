"use strict";

const channel = String(process.env.MATH3D_CHANNEL || "stable").trim().toLowerCase();
const isDevChannel = channel === "dev";

const productName = isDevChannel ? "Math3D Dev" : "Math3D";
const appId = isDevChannel ? "com.example.math3d.dev" : "com.example.math3d";
const outputDir = isDevChannel ? "release-dev" : "release";

/** @type {import('electron-builder').Configuration} */
const config = {
  appId,
  productName,
  artifactName: "${productName} Setup ${version}.${ext}",
  directories: {
    output: outputDir,
  },
  files: [
    "dist/**/*",
    "package.json",
    "renderer/dist/**/*",
    "gallery-images/**/*",
    "python/**/*",
    "py/**/*",
  ],
  extraResources: [
    {
      from: "build/python-worker-dist",
      to: "python-worker",
    },
    {
      from: "apps/web/dist",
      to: "web-app",
    },
  ],
  win: {
    target: "nsis",
    icon: "assets/icon.ico",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    uninstallDisplayName: productName,
  },
};

module.exports = config;
