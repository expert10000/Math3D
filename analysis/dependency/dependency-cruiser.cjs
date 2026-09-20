/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-must-not-import-higher-layers",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: "^(packages/kernel|renderer|src|apps)/" },
    },
    {
      name: "kernel-must-not-import-runtime-or-feature-layers",
      severity: "error",
      from: { path: "^packages/kernel/" },
      to: { path: "^(renderer|src|apps)/" },
    },
    {
      name: "renderer-must-not-import-electron-main",
      severity: "error",
      from: { path: "^renderer/", pathNot: "\\.(test|spec)\\.[cm]?[jt]sx?$" },
      to: { path: "^src/" },
    },
    {
      name: "mobile-must-not-import-desktop-or-renderer",
      severity: "error",
      from: { path: "^apps/mobile/" },
      to: { path: "^(renderer|src|apps/desktop)/" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    includeOnly: "^(apps|packages|renderer|src|scripts)",
    exclude:
      "(^|/)(dist|build|release|coverage|node_modules|legacy|data|docs/api|site|output|playwright-report|test-results)(/|$)",
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
};
