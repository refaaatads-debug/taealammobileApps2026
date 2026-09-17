const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const port = Number(process.env.PORT || 8081);
const metroPort = Number(process.env.EXPO_METRO_PORT || port + 100);
const configuredDomain =
  process.env.REPLIT_EXPO_DEV_DOMAIN ||
  process.env.REPLIT_DEV_DOMAIN ||
  process.env.EXPO_PUBLIC_DOMAIN ||
  '';

function hostnameFromDomain(value) {
  if (!value) return '';
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname;
  } catch {
    return value.replace(/^https?:\/\//i, '').split('/')[0];
  }
}

const hostname = hostnameFromDomain(configuredDomain);
const proxyUrl = hostname ? `https://${hostname}` : '';
const environment = {
  ...process.env,
  BROWSER: 'none',
  EXPO_UNSTABLE_HEADLESS: '1',
  EXPO_NO_DEPENDENCY_VALIDATION: '1',
  EXPO_NO_INTERACTIVE: '1',
  EXPO_NO_QR_CODE: '1',
  EXPO_PUBLIC_DOMAIN: hostname || configuredDomain,
  EXPO_PUBLIC_REPL_ID: process.env.REPL_ID || process.env.EXPO_PUBLIC_REPL_ID || '',
  EXPO_PACKAGER_PROXY_URL: proxyUrl || undefined,
};

console.log(`Starting Expo development server on port ${port}`);
console.log(`Metro will run behind the Preview proxy on port ${metroPort}`);
if (hostname) {
  console.log(`Using Expo development host ${hostname}`);
}

const expo = spawn(
  'pnpm',
  [
    'exec',
    'expo',
    'start',
    '--go',
    '--lan',
    '--port',
    String(metroPort),
    '--max-workers',
    '1',
  ],
  {
    cwd: path.resolve(__dirname, '..'),
    env: environment,
    stdio: 'inherit',
  },
);

function getNativePlatform(req, requestUrl) {
  const headerPlatform = String(req.headers['expo-platform'] || '').toLowerCase();
  if (headerPlatform === 'ios' || headerPlatform === 'android') return headerPlatform;

  const queryPlatform = requestUrl.searchParams.get('platform');
  if (queryPlatform === 'ios' || queryPlatform === 'android') return queryPlatform;

  const userAgent = String(req.headers['user-agent'] || '');
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod|ios|cfnetwork|darwin/i.test(userAgent)) return 'ios';
  return 'ios';
}

function isNativeClient(req, requestUrl) {
  if (req.headers['expo-platform']) return true;
  if (req.headers.accept?.includes('application/json')) return true;
  return /expo|okhttp|cfnetwork|android|iphone|ipad|ipod/i.test(
    String(req.headers['user-agent'] || ''),
  );
}

let stopping = false;

function unavailableResponse(res, message = 'Expo preview is starting') {
  if (res.writableEnded) return;
  if (!res.headersSent) {
    res.writeHead(503, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '2',
    });
  }
  res.end(message);
}

function checkMetroStatus(res) {
  const statusRequest = http.request(
    {
      hostname: '127.0.0.1',
      port: metroPort,
      method: 'GET',
      path: '/status',
      headers: {
        host: `127.0.0.1:${metroPort}`,
      },
      timeout: 1500,
    },
    (statusResponse) => {
      const isReady =
        (statusResponse.statusCode || 0) >= 200 &&
        (statusResponse.statusCode || 0) < 300;
      statusResponse.resume();
      if (!isReady) {
        unavailableResponse(res);
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-react-native-project-root': path.resolve(__dirname, '..'),
      });
      res.end('packager-status:running');
    },
  );

  statusRequest.once('timeout', () => {
    statusRequest.destroy(new Error('Metro status check timed out'));
  });
  statusRequest.once('error', () => {
    unavailableResponse(res);
  });
  statusRequest.end();
}

function proxyRequest(req, res) {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const headers = { ...req.headers, host: `127.0.0.1:${metroPort}` };
  // The Replit proxy terminates the public origin before forwarding to Metro.
  // Metro would otherwise reject the public Origin as an unauthorized CORS host.
  delete headers.origin;
  const platform = getNativePlatform(req, requestUrl);
  const isManifestRequest = requestUrl.pathname === '/manifest';
  const isNativeRootRequest =
    requestUrl.pathname === '/' && isNativeClient(req, requestUrl);
  const shouldServeNativeManifest = isManifestRequest || isNativeRootRequest;

  // Expo Go sometimes requests the root URL without expo-platform. Forward the
  // platform explicitly so Metro returns the native manifest instead of Web HTML.
  if (shouldServeNativeManifest) {
    headers['expo-platform'] = platform;
    headers.accept = 'application/json';
  }

  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: metroPort,
      method: req.method,
      path: `${requestUrl.pathname}${requestUrl.search}`,
      headers,
    },
    (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      if (shouldServeNativeManifest && (upstreamResponse.statusCode || 0) < 400) {
        responseHeaders['content-type'] = 'application/json; charset=utf-8';
      }
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    },
  );

  upstream.once('error', (error) => {
    unavailableResponse(res, `Expo preview is starting: ${error.message}`);
  });

  req.pipe(upstream);
}

const proxy = http.createServer((req, res) => {
  if ((req.url || '/').split('?')[0] === '/status') {
    // Do not advertise the artifact as healthy while the Metro upstream is
    // still booting or has already exited. Otherwise the managed workflow
    // keeps the proxy alive and Preview repeatedly shows ECONNREFUSED.
    checkMetroStatus(res);
    return;
  }
  proxyRequest(req, res);
});

proxy.on('upgrade', (req, socket, head) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const headers = { ...req.headers, host: `127.0.0.1:${metroPort}` };
  delete headers.origin;
  const upstream = http.request({
    hostname: '127.0.0.1',
    port: metroPort,
    method: req.method,
    path: `${requestUrl.pathname}${requestUrl.search}`,
    headers,
  });

  upstream.once('upgrade', (upstreamResponse, upstreamSocket, upstreamHead) => {
    socket.write(
      `HTTP/1.1 ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage}\r\n` +
      Object.entries(upstreamResponse.headers)
        .flatMap(([key, value]) => {
          const values = Array.isArray(value) ? value : [value];
          return values.map((item) => `${key}: ${item}`);
        })
        .join('\r\n') +
      '\r\n\r\n',
    );
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
  });

  upstream.once('error', () => socket.destroy());
  upstream.end();
});

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  proxy.close();
  if (!expo.killed) expo.kill('SIGTERM');
  if (exitCode !== 0) process.exitCode = exitCode;
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);

proxy.listen(port, '0.0.0.0', () => {
  console.log(`Preview proxy listening on port ${port}`);
});

expo.once('error', (error) => {
  console.error(`Failed to start Expo development server: ${error.message}`);
  process.exitCode = 1;
});

expo.once('exit', (code, signal) => {
  if (stopping) return;
  if (signal) {
    console.log(`Expo development server stopped by ${signal}`);
  } else if (code !== 0) {
    console.error(`Expo development server exited with code ${code}`);
  }
  // Never leave a healthy-looking proxy behind a dead Metro process. Closing
  // the proxy lets the managed workflow restart the complete service.
  stop(code ?? 1);
});