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
  extraMetadata: {
    homepage: "https://github.com/expert10000/Math3D",
  },
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
    target: ["AppImage", "deb", "rpm"],
    category: "Education;Science;Math;",
    maintainer: "Math3D Project",
    vendor: "Math3D Project",
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },
  deb: {
    packageCategory: "science",
    depends: [
      "libgtk-3-0",
      "libnotify4",
      "libnss3",
      "libxss1",
      "libxtst6",
      "xdg-utils",
      "libatspi2.0-0",
      "libuuid1",
      "libsecret-1-0",
      "libgl1",
    ],
    recommends: [],
  },
  rpm: {
    packageCategory: "Applications/Engineering",
    depends: [
      "gtk3",
      "libnotify",
      "nss",
      "libXScrnSaver",
      "libXtst",
      "xdg-utils",
      "at-spi2-core",
      "libuuid",
      "libsecret",
      "mesa-libGL",
    ],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    uninstallDisplayName: productName,
  },
};

module.exports = config;
