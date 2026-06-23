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
  linux: {
    artifactName: "${productName}-${version}-linux-${arch}.${ext}",
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
      { target: "rpm", arch: ["x64"] },
    ],
    category: "Science",
    maintainer: "expert10000 <expert10000@users.noreply.github.com>",
    synopsis: "Interactive 3D mathematics workspace",
    description:
      "Math3D is an interactive 3D mathematics workspace for explicit, implicit, and parametric surfaces; topology; geometry; complex analysis; mesh inspection; and Python-backed computation.",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    uninstallDisplayName: productName,
  },
};

module.exports = config;
