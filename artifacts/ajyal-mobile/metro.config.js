const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

// Expo's pnpm monorepo defaults watch every workspace package and the root
// node_modules tree. Preview only needs the app and its generated API client;
// watching the other artifacts exhausts inotify before the first web bundle.
config.watchFolders = [
  projectRoot,
  path.join(workspaceRoot, 'lib/api-client-react'),
  path.join(workspaceRoot, 'lib/api-spec'),
  path.join(workspaceRoot, 'lib/api-zod'),
];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
];

module.exports = config;
