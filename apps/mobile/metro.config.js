const path = require("path");
const fs = require("fs");
const { getDefaultConfig } = require("expo/metro-config");
const { resolve: metroResolve } = require("metro-resolver");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const reactRoot = fs.realpathSync(path.resolve(projectRoot, "node_modules/react"));
const reactDomRoot = fs.realpathSync(
  path.resolve(projectRoot, "node_modules/react-dom"),
);
const schedulerFile = require.resolve("scheduler", { paths: [reactRoot] });

config.resolver.extraNodeModules = {
  react: reactRoot,
  "react-dom": reactDomRoot,
  scheduler: path.dirname(schedulerFile),
  "react-native": path.resolve(projectRoot, "node_modules/react-native"),
  "react-native-svg": path.resolve(
    projectRoot,
    "node_modules/react-native-svg",
  ),
  "react-native-web": path.resolve(
    projectRoot,
    "node_modules/react-native-web",
  ),
};

function resolveFromPkg(pkgRoot, subpath) {
  return require.resolve(subpath, { paths: [pkgRoot] });
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "expo-camera") {
    return {
      type: "sourceFile",
      filePath: path.join(projectRoot, "src/camera-web-stub.ts"),
    };
  }
  // Pin every react / react-dom subpath to mobile's React 18 — monorepo
  // Next (web) React 19 otherwise sneaks in via react-dom/client and blanks Expo web.
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    return {
      type: "sourceFile",
      filePath: resolveFromPkg(
        reactRoot,
        moduleName === "react" ? "./index.js" : `./${moduleName.slice("react/".length)}`,
      ),
    };
  }
  if (moduleName === "react-dom" || moduleName.startsWith("react-dom/")) {
    return {
      type: "sourceFile",
      filePath: resolveFromPkg(
        reactDomRoot,
        moduleName === "react-dom"
          ? "./index.js"
          : `./${moduleName.slice("react-dom/".length)}`,
      ),
    };
  }
  if (moduleName === "scheduler" || moduleName.startsWith("scheduler/")) {
    return {
      type: "sourceFile",
      filePath: require.resolve(moduleName, { paths: [reactRoot] }),
    };
  }

  const fromPackage = context.originModulePath.includes(
    `${path.sep}packages${path.sep}`,
  );
  const redirected =
    fromPackage && moduleName.startsWith(".") && moduleName.endsWith(".js")
      ? moduleName.slice(0, -3)
      : moduleName;

  return metroResolve(
    {
      ...context,
      resolveRequest: undefined,
    },
    redirected,
    platform,
  );
};

module.exports = config;
