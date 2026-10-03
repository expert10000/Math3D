const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
].map(folder => fs.existsSync(folder) ? fs.realpathSync(folder) : folder);
// Managed worktrees can share dependencies through junctions outside their root.
config.watchFolders = [...new Set([workspaceRoot, ...config.resolver.nodeModulesPaths.filter(folder => fs.existsSync(folder))])];
config.resolver.disableHierarchicalLookup = true;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const workspaceSources = {
    "@math3d/core": path.join(workspaceRoot, "packages/core/src/index.ts"),
    "@math3d/kernel": path.join(workspaceRoot, "packages/kernel/src/index.ts"),
  };
  return context.resolveRequest(context, workspaceSources[moduleName] || moduleName, platform);
};

module.exports = config;
