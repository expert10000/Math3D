const identity = require("./version.json");

module.exports = {
  expo: {
    name: "Math3D Mobile",
    slug: "math3d-mobile",
    version: identity.version,
    entryPoint: "./index.js",
    orientation: "default",
    userInterfaceStyle: "light",
    assetBundlePatterns: ["**/*"],
    plugins: [[
      "expo-camera",
      {
        cameraPermission: "Allow Math3D to scan a temporary desktop worker pairing code.",
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ]],
    android: {
      package: identity.applicationId,
      versionCode: identity.build,
    },
    ios: {
      bundleIdentifier: identity.applicationId,
      buildNumber: String(identity.build),
    },
    newArchEnabled: false,
  },
};
