const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, '.expo', 'web-preview');
const buildDir = path.join(projectRoot, '.expo', 'web-preview-next');
const fallbackOutputDir = path.join(projectRoot, 'web-build');
const nativeBuildDir = path.join(projectRoot, 'static-build');
const nativeBuildScript = path.join(projectRoot, 'scripts', 'build.js');
const basePath = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const port = Number(process.env.PORT || 22030);
let activeOutputDir = fs.existsSync(path.join(outputDir, 'index.html'))
  ? outputDir
  : fallbackOutputDir;
const sourceRoots = ['app', 'components', 'contexts', 'hooks', 'lib', 'constants', 'assets'];
let nativeBuildProcess = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function runExport() {
  return new Promise((resolve, reject) => {
    console.log('Building static Expo Web Preview...');
    const exportProcess = spawn(
      'pnpm',
      [
        'exec',
        'expo',
        'export',
        '--platform',
        'web',
        '--output-dir',
        buildDir,
        '--clear',
        '--no-bytecode',
        '--max-workers',
        '1',
      ],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          EXPO_UNSTABLE_HEADLESS: '1',
          EXPO_NO_DEPENDENCY_VALIDATION: '1',
          EXPO_NO_WEB_SETUP: '1',
          EXPO_PUBLIC_DOMAIN: process.env.REPLIT_DEV_DOMAIN || process.env.EXPO_PUBLIC_DOMAIN || '',
          EXPO_PUBLIC_REPL_ID: process.env.REPL_ID || process.env.EXPO_PUBLIC_REPL_ID || '',
        },
        stdio: 'inherit',
      },
    );

    exportProcess.once('error', reject);
    exportProcess.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Expo Web export failed (code=${code ?? 'none'}, signal=${signal ?? 'none'})`));
      }
    });
  });
}

function activateBuild() {
  const indexPath = path.join(buildDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Expo Web export completed without an index file: ${indexPath}`);
  }

  const previousDir = `${outputDir}-previous`;
  if (fs.existsSync(previousDir)) fs.rmSync(previousDir, { recursive: true, force: true });
  if (fs.existsSync(outputDir)) fs.renameSync(outputDir, previousDir);
  fs.renameSync(buildDir, outputDir);
  if (fs.existsSync(previousDir)) fs.rmSync(previousDir, { recursive: true, force: true });
}

function latestSourceMtime(directory) {
  if (!fs.existsSync(directory)) return 0;
  const stat = fs.statSync(directory);
  if (stat.isFile()) return stat.mtimeMs;

  let latest = stat.mtimeMs;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.expo' || entry.name === 'web-build') continue;
    latest = Math.max(latest, latestSourceMtime(path.join(directory, entry.name)));
  }
  return latest;
}

function shouldBuildPreview() {
  if (process.env.PREVIEW_BUILD === '1') return true;
  const indexPath = path.join(outputDir, 'index.html');
  if (!fs.existsSync(indexPath)) return true;

  const bundleMtime = fs.statSync(indexPath).mtimeMs;
  return sourceRoots.some((root) => latestSourceMtime(path.join(projectRoot, root)) > bundleMtime);
}

function shouldBuildNativePreview() {
  if (process.env.PREVIEW_NATIVE_BUILD === '0') return false;
  const iosManifest = path.join(nativeBuildDir, 'ios', 'manifest.json');
  const androidManifest = path.join(nativeBuildDir, 'android', 'manifest.json');
  if (!fs.existsSync(iosManifest) || !fs.existsSync(androidManifest)) return true;

  const manifestMtime = Math.min(
    fs.statSync(iosManifest).mtimeMs,
    fs.statSync(androidManifest).mtimeMs,
  );
  return sourceRoots.some(
    (root) => latestSourceMtime(path.join(projectRoot, root)) > manifestMtime,
  );
}

function startNativePreviewBuild() {
  if (!shouldBuildNativePreview()) {
    console.log(`Using existing native Expo Preview build at ${nativeBuildDir}`);
    return;
  }

  console.log('Building native Expo Preview bundles for iOS and Android...');
  nativeBuildProcess = spawn(process.execPath, [nativeBuildScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      EXPO_UNSTABLE_HEADLESS: '1',
      EXPO_NO_DEPENDENCY_VALIDATION: '1',
      EXPO_BUILD_PORT: process.env.EXPO_BUILD_PORT || '22130',
    },
    stdio: 'inherit',
  });
  nativeBuildProcess.once('exit', (code, signal) => {
    nativeBuildProcess = null;
    if (code === 0) {
      console.log(`Native Expo Preview build ready at ${nativeBuildDir}`);
    } else {
      console.error(
        `Native Expo Preview build failed (code=${code ?? 'none'}, signal=${signal ?? 'none'})`,
      );
    }
  });
}

function stripBasePath(pathname) {
  if (basePath && pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || '/';
  }
  if (basePath && pathname === basePath) return '/';
  return pathname || '/';
}

function safeFilePath(relativePath) {
  const normalized = path.posix.normalize(`/${relativePath}`).replace(/^\/+/, '');
  const filePath = path.resolve(activeOutputDir, normalized);
  if (filePath !== activeOutputDir && !filePath.startsWith(`${activeOutputDir}${path.sep}`)) {
    return null;
  }
  return filePath;
}

function safeNativeFilePath(relativePath) {
  const normalized = path.posix.normalize(`/${relativePath}`).replace(/^\/+/, '');
  const filePath = path.resolve(nativeBuildDir, normalized);
  if (filePath !== nativeBuildDir && !filePath.startsWith(`${nativeBuildDir}${path.sep}`)) {
    return null;
  }
  return filePath;
}

function serveNativeManifest(platform, res) {
  const manifestPath = path.join(nativeBuildDir, platform, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    res.writeHead(503, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '5',
    });
    res.end(JSON.stringify({ error: `Native Expo build is still being prepared for ${platform}` }));
    return;
  }

  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'expo-protocol-version': '1',
    'expo-sfv-version': '0',
  });
  fs.createReadStream(manifestPath).pipe(res);
}

function getNativePlatform(req, requestUrl) {
  const headerPlatform = req.headers['expo-platform'];
  if (headerPlatform === 'ios' || headerPlatform === 'android') return headerPlatform;

  const queryPlatform = requestUrl.searchParams.get('platform');
  if (queryPlatform === 'ios' || queryPlatform === 'android') return queryPlatform;

  const userAgent = String(req.headers['user-agent'] || '');
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod|ios|cfnetwork|darwin/i.test(userAgent)) return 'ios';
  return 'ios';
}

function getIndexHtml(requestPath) {
  const indexPath = path.join(activeOutputDir, 'index.html');
  if (!fs.existsSync(indexPath)) return null;
  let html = fs.readFileSync(indexPath, 'utf8');
  const prefix = basePath && requestPath.startsWith(`${basePath}/`) ? basePath : '';
  if (prefix) {
    html = html
      .replaceAll('href="/', `href="${prefix}/`)
      .replaceAll('src="/', `src="${prefix}/`);
  }
  return html;
}

function serveFile(filePath, res) {
  const extension = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME_TYPES[extension] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

function startServer() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = stripBasePath(requestUrl.pathname);

    if (pathname === '/status') {
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end('packager-status:running');
      return;
    }

    const nativePlatform = getNativePlatform(req, requestUrl);
    if (pathname === '/manifest' && nativePlatform) {
      serveNativeManifest(nativePlatform, res);
      return;
    }

    if (pathname === '/' && nativePlatform && req.headers.accept?.includes('application/json')) {
      serveNativeManifest(nativePlatform, res);
      return;
    }

    if (pathname === '/' || pathname.endsWith('/index.html')) {
      const html = getIndexHtml(requestUrl.pathname);
      if (!html) {
        res.writeHead(503, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          'retry-after': '5',
        });
        res.end('Preview bundle is still being prepared');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME_TYPES['.html'],
        'cache-control': 'no-store',
      });
      res.end(html);
      return;
    }

    const filePath = safeFilePath(pathname);
    if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      serveFile(filePath, res);
      return;
    }

    const nativeFilePath = safeNativeFilePath(pathname);
    if (nativeFilePath && fs.existsSync(nativeFilePath) && fs.statSync(nativeFilePath).isFile()) {
      serveFile(nativeFilePath, res);
      return;
    }

    // Expo Router handles client-side routes. Return the shell for deep links
    // while keeping missing assets as real 404s.
    if (path.extname(pathname) === '') {
      const html = getIndexHtml(requestUrl.pathname);
      if (!html) {
        res.writeHead(503, {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          'retry-after': '5',
        });
        res.end('Preview bundle is still being prepared');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME_TYPES['.html'],
        'cache-control': 'no-store',
      });
      res.end(html);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Serving static Expo Web Preview on port ${port} from ${activeOutputDir}`);
  });
}

startServer();
startNativePreviewBuild();
if (shouldBuildPreview()) {
  runExport()
    .then(() => {
      activateBuild();
      activeOutputDir = outputDir;
      console.log(`Static Expo Web Preview bundle ready at ${outputDir}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      if (!fs.existsSync(path.join(activeOutputDir, 'index.html'))) {
        process.exitCode = 1;
      }
    });
} else {
  console.log(`Using existing static Expo Web Preview bundle at ${activeOutputDir}`);
}