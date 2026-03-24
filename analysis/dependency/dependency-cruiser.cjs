/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [],
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
