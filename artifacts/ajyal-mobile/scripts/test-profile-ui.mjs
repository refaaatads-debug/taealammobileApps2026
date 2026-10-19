import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ajyal-profile-ui-"));
let buildDir = path.join(tempRoot, "web-dev");
const profileStoreKey = (role) => `ajyal.profile-test.v1:${role}:profile-test-${role}`;
let browser;
let server;
let cdp;
const mockSupabaseAuthRequests = [];
const mockSupabaseRequests = [];
const observedBrowserRequests = [];

function runWebExport({ production = false, supabaseUrl = "http://127.0.0.1:0" } = {}) {
  console.log(`Building the isolated Expo Web ${production ? "production" : "development"} test bundle...`);
  const result = spawnSync("pnpm", [
    "exec", "expo", "export", "--platform", "web",
    ...(!production ? ["--dev"] : []),
    ...(production ? ["--clear"] : []),
    "--output-dir", buildDir, "--max-workers", "1",
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CI: "1",
      EXPO_PUBLIC_PROFILE_TEST_MODE: "true",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: production ? "test-publishable-key" : "",
      EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
    },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 600_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    assert.equal(result.status, 0, "Expo Web test bundle export failed");
  }
  assert.ok(fs.existsSync(path.join(buildDir, "index.html")), "Expo export did not create index.html");
  console.log("Isolated web test bundle ready.");
}

function runProfileTestPolicyTests() {
  console.log("Checking the shared profile-test route policy...");
  const result = spawnSync("node", [
    "--experimental-strip-types",
    "--test",
    "lib/__tests__/profileTestPolicy.test.mjs",
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    assert.equal(result.status, 0, "Profile-test route policy tests failed");
  }
  process.stdout.write(result.stdout ?? "");
}

function runAndroidProductionExport() {
  buildDir = path.join(tempRoot, "android-production");
  console.log("Building the Expo Android production bundle with the test flag enabled...");
  const result = spawnSync("pnpm", [
    "exec", "expo", "export", "--platform", "android", "--clear",
    "--output-dir", buildDir, "--max-workers", "1",
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CI: "1",
      EXPO_PUBLIC_PROFILE_TEST_MODE: "true",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      EXPO_PUBLIC_SUPABASE_URL: "https://isolated-supabase.test",
      EXPO_PUBLIC_API_DOMAIN: "api.ajyalalmaerifa.com",
      EXPO_PUBLIC_DOMAIN: "api.ajyalalmaerifa.com",
    },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 600_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
    assert.equal(result.status, 0, "Expo Android production bundle export failed");
  }

  const androidBundleDirectory = path.join(buildDir, "_expo", "static", "js", "android");
  assert.ok(fs.existsSync(androidBundleDirectory), "Expo export did not create an Android production bundle");
  const bundleFiles = fs.readdirSync(androidBundleDirectory).filter((name) => name.endsWith(".hbc"));
  assert.equal(bundleFiles.length, 1, "Expected one Hermes Android production bundle");
  const bundle = fs.readFileSync(path.join(androidBundleDirectory, bundleFiles[0]));
  assert.ok(bundle.length > 0, "Android production bundle is empty");
  assert.ok(bundle.includes(Buffer.from("/profile-test")), "The Android bundle does not contain the deep-link route under test");
  const testAccountMarkers = [
    "profile-test-student",
    "profile-test-teacher",
    "student@profile-test.invalid",
    "teacher@profile-test.invalid",
    "isolated-student-session",
    "isolated-teacher-session",
    "ajyal.profile-test.v1:",
    "طالبة تجريبية",
    "0501111111",
    "الاسم قبل التعديل",
    "0500000000",
    "teacher-profile-test",
    "بنك الاختبار",
    "SA0000000000000000000000",
    "معلم الاختبار",
  ];
  for (const marker of testAccountMarkers) {
    assert.ok(
      !bundle.includes(Buffer.from(marker)),
      `Android production bundle contains profile-test data: ${marker}`,
    );
  }

  const routeEntry = fs.readFileSync(path.join(projectRoot, "app", "profile-test.tsx"), "utf8");
  assert.ok(routeEntry.includes('@/lib/profileTestRoute'), "The profile-test route must use the platform-specific route component");
  const nativeRoute = fs.readFileSync(path.join(projectRoot, "lib", "profileTestRoute.tsx"), "utf8");
  assert.match(nativeRoute, /<Redirect href="\/"\s*\/>/, "The native profile-test route must redirect to the app entry path");
  assert.doesNotMatch(
    nativeRoute,
    /profileTestSessions|profile-test\.invalid|ajyal\.profile-test\.v1:/,
    "The native profile-test route must not import or name test account data",
  );
  console.log("Android production bundle keeps the deep-link route, redirects it to the app entry path, and excludes profile-test data.");
}

function createStaticServer() {
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };
  return http.createServer((request, response) => {
    let requestUrl;
    let pathname;
    try {
      requestUrl = new URL(request.url, "http://localhost");
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      response.writeHead(400).end("Invalid URL");
      return;
    }
    if (pathname === "/auth/v1/token") {
      mockSupabaseRequests.push(`${request.method} ${request.url}`);
      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }
      if (request.method === "POST") {
        mockSupabaseAuthRequests.push(requestUrl.searchParams.get("grant_type"));
        request.resume();
        request.on("end", () => {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ code: "invalid_credentials", message: "Invalid login credentials" }));
        });
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "Mock Supabase endpoint not found" }));
      return;
    }
    const candidate = path.resolve(buildDir, `.${pathname}`);
    if (candidate !== buildDir && !candidate.startsWith(`${buildDir}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    let filePath = candidate;
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      filePath = path.join(buildDir, "index.html");
    }
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

class DevToolsConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const handler of this.handlers.get(message.method) ?? []) {
        handler(message);
      }
    });
  }

  call(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out calling Chrome DevTools method ${method}`));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) ?? new Set();
    handlers.add(handler);
    this.handlers.set(method, handlers);
    return () => handlers.delete(handler);
  }

  waitFor(method, predicate = () => true, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out waiting for browser event ${method}`));
      }, timeoutMs);
      const unsubscribe = this.on(method, (event) => {
        if (!predicate(event)) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(event);
      });
    });
  }

  async evaluate(expression) {
    const response = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, this.sessionId);
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text ?? "Browser evaluation failed");
    }
    return response.result?.value;
  }
}

async function startBrowser() {
  const chromiumPath = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";
  assert.ok(fs.existsSync(chromiumPath), `Chromium executable not found at ${chromiumPath}`);
  browser = spawn(chromiumPath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--remote-allow-origins=*",
    `--user-data-dir=${path.join(tempRoot, "chrome-profile")}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let output = "";
  const collectOutput = (chunk) => { output += chunk.toString(); };
  browser.stdout.on("data", collectOutput);
  browser.stderr.on("data", collectOutput);
  const deadline = Date.now() + 60_000;
  let websocketUrl;
  while (Date.now() < deadline && browser.exitCode === null) {
    websocketUrl = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (websocketUrl) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(websocketUrl, `Chromium did not start its debugging endpoint: ${output.slice(-1000)}`);

  const socket = new WebSocket(websocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  cdp = new DevToolsConnection(socket);
  const { targetId } = await cdp.call("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.call("Target.attachToTarget", { targetId, flatten: true });
  cdp.sessionId = sessionId;
  await Promise.all(["Page.enable", "Runtime.enable", "DOM.enable", "Network.enable"]
    .map((method) => cdp.call(method, {}, sessionId)));
  cdp.on("Page.javascriptDialogOpening", (event) => {
    void cdp.call("Page.handleJavaScriptDialog", { accept: true }, event.sessionId).catch(() => {});
  });
  return targetId;
}

async function evaluateInPage(expression) {
  return cdp.evaluate(expression);
}

async function waitFor(description, expression, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await evaluateInPage(expression);
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

async function waitForProfileForm(description) {
  try {
    return await waitFor(
      description,
      "Boolean(document.querySelector('[data-testid=\"profile-full-name\"]'))",
      60_000,
    );
  } catch (error) {
    const page = await evaluateInPage(
      "({ url: location.href, readyState: document.readyState, body: document.body?.innerText?.slice(0, 500) })",
    ).catch(() => null);
    throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(page)}; ${error.message}`);
  }
}

async function clickTestId(testId) {
  const found = await evaluateInPage(`(() => {
    const element = [...document.querySelectorAll("[data-testid]")]
      .find((candidate) => candidate.getAttribute("data-testid") === ${JSON.stringify(testId)});
    if (!element) return false;
    element.scrollIntoView({ block: "center" });
    const target = element instanceof HTMLInputElement ? element : element.querySelector("input") ?? element;
    target.click();
    return true;
  })()`);
  assert.equal(found, true, `Could not find the ${testId} control`);
}

async function fillTestId(testId, value) {
  const filled = await evaluateInPage(`(() => {
    const element = [...document.querySelectorAll("[data-testid]")]
      .find((candidate) => candidate.getAttribute("data-testid") === ${JSON.stringify(testId)});
    if (!element) return false;
    element.scrollIntoView({ block: "center" });
    element.focus();
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: ${JSON.stringify(value)},
    }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert.equal(filled, true, `Could not fill the ${testId} field`);
}

async function fillPlaceholder(placeholders, value) {
  const acceptedPlaceholders = Array.isArray(placeholders) ? placeholders : [placeholders];
  const filled = await evaluateInPage(`(() => {
    const acceptedPlaceholders = ${JSON.stringify(acceptedPlaceholders)};
    const element = [...document.querySelectorAll("input")]
      .find((candidate) => acceptedPlaceholders.includes(candidate.getAttribute("placeholder")));
    if (!element) return false;
    element.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: ${JSON.stringify(value)},
    }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  assert.equal(filled, true, `Could not fill the ${acceptedPlaceholders.join(" / ")} field`);
}

async function readField(testId) {
  return evaluateInPage(`(() => {
    const element = [...document.querySelectorAll("[data-testid]")]
      .find((candidate) => candidate.getAttribute("data-testid") === ${JSON.stringify(testId)});
    return element?.value ?? null;
  })()`);
}

async function readText(testId) {
  return evaluateInPage(`(() => {
    const element = [...document.querySelectorAll("[data-testid]")]
      .find((candidate) => candidate.getAttribute("data-testid") === ${JSON.stringify(testId)});
    return element?.textContent ?? null;
  })()`);
}

async function readCheckedState(testId) {
  return evaluateInPage(`(() => {
    const element = [...document.querySelectorAll("[data-testid]")]
      .find((candidate) => candidate.getAttribute("data-testid") === ${JSON.stringify(testId)});
    if (!element) return null;
    const ariaChecked = element.getAttribute("aria-checked")
      ?? element.getAttribute("aria-selected")
      ?? element.getAttribute("aria-pressed");
    if (ariaChecked !== null) return ariaChecked === "true";
    const input = element instanceof HTMLInputElement ? element : element.querySelector("input");
    return typeof input?.checked === "boolean" ? input.checked : null;
  })()`);
}

async function navigate(url) {
  const loaded = cdp.waitFor("Page.loadEventFired", (event) => event.sessionId === cdp.sessionId);
  await cdp.call("Page.navigate", { url }, cdp.sessionId);
  await loaded;
  await waitForProfileForm("profile form");
}

async function readStoredProfile(role) {
  const key = profileStoreKey(role);
  return evaluateInPage(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}) || "null")`);
}

async function failNextProfileStoreWrite(role, when = "true") {
  await evaluateInPage(`(() => {
    const key = ${JSON.stringify(profileStoreKey(role))};
    const original = Storage.prototype.setItem;
    let armed = true;
    Storage.prototype.setItem = function(storageKey, value) {
      if (armed && storageKey === key && (${when})) {
        armed = false;
        Storage.prototype.setItem = original;
        throw new Error("Simulated temporary profile storage failure");
      }
      return original.call(this, storageKey, value);
    };
    return true;
  })()`);
}

async function saveAndReload(role, expectedValues, simulateFailure = false) {
  if (simulateFailure) {
    await failNextProfileStoreWrite(role);
    await clickTestId("save-profile");
    await waitFor(
      "visible profile save error",
      "document.querySelector('[data-testid=\"profile-save-error\"]')?.textContent.includes('Simulated temporary profile storage failure')",
    );
    for (const [testId, value] of Object.entries(expectedValues.fields)) {
      assert.equal(await readField(testId), value, `${testId} was lost after a failed save`);
    }
    for (const [testId, value] of Object.entries(expectedValues.states ?? {})) {
      assert.equal(await readCheckedState(testId), value, `${testId} state was lost after a failed save`);
    }
    await clickTestId("retry-profile-save");
  } else {
    await clickTestId("save-profile");
  }
  await waitFor("isolated profile save", `(() => {
    const saved = JSON.parse(localStorage.getItem(${JSON.stringify(profileStoreKey(role))}) || "null");
    const profile = saved?.tables?.profiles?.[0];
    return ${JSON.stringify(expectedValues.fullName)} === profile?.full_name
      && ${JSON.stringify(expectedValues.phone)} === profile?.phone;
  })()`);
  const reloaded = cdp.waitFor("Page.loadEventFired", (event) => event.sessionId === cdp.sessionId);
  await cdp.call("Page.reload", { ignoreCache: true }, cdp.sessionId);
  await reloaded;
  await waitForProfileForm("profile form after reload");
  for (const [testId, value] of Object.entries(expectedValues.fields)) {
    assert.equal(await readField(testId), value, `${testId} did not survive a page reload`);
  }
  for (const [testId, value] of Object.entries(expectedValues.states ?? {})) {
    assert.equal(await readCheckedState(testId), value, `${testId} state did not survive a page reload`);
  }
  for (const [testId, value] of Object.entries(expectedValues.texts ?? {})) {
    assert.ok((await readText(testId))?.includes(value), `${testId} did not show ${value} after a page reload`);
  }
}

async function testStudentProfile(baseUrl) {
  console.log("Testing student account edits and reload...");
  await navigate(`${baseUrl}/profile-test?role=student`);
  await fillTestId("profile-full-name", "طالبة واجهة الاختبار");
  await fillTestId("profile-phone", "0551234567");
  await clickTestId("student-stage-الثانوية");
  await clickTestId("notify-before-session");
  await saveAndReload("student", {
    fullName: "طالبة واجهة الاختبار",
    phone: "0551234567",
    fields: {
      "profile-full-name": "طالبة واجهة الاختبار",
      "profile-phone": "0551234567",
    },
    states: {
      "notify-before-session": false,
    },
    texts: {
      "student-stage-selected-label": "الثانوية",
    },
  }, true);
  const stored = await readStoredProfile("student");
  assert.equal(stored.tables.profiles[0].teaching_stage, "الثانوية");
  assert.equal(stored.tables.profiles[0].notify_before_session, false);
  assert.ok(
    await evaluateInPage("document.body.innerText.includes('ملف الحساب')"),
    "The account screen did not open directly from the test session",
  );
}

async function testTeacherCertificate(baseUrl, imagePath) {
  console.log("Testing teacher account fields and certificate actions...");
  await navigate(`${baseUrl}/profile-test?role=teacher`);
  await fillTestId("profile-full-name", "معلم واجهة الاختبار");
  await fillTestId("profile-phone", "0557654321");
  await fillTestId("teacher-bio", "خبرة اختبار واجهة المعلم");
  await fillTestId("teacher-bank-name", "بنك الواجهة");
  await clickTestId("teacher-stage-الثانوية");
  await clickTestId("notify-after-session");
  await saveAndReload("teacher", {
    fullName: "معلم واجهة الاختبار",
    phone: "0557654321",
    fields: {
      "profile-full-name": "معلم واجهة الاختبار",
      "profile-phone": "0557654321",
      "teacher-bio": "خبرة اختبار واجهة المعلم",
      "teacher-bank-name": "بنك الواجهة",
    },
    states: {
      "notify-after-session": true,
    },
  });
  let stored = await readStoredProfile("teacher");
  assert.deepEqual(stored.tables.teacher_profiles[0].teaching_stages, ["الابتدائية", "الثانوية"]);
  assert.equal(stored.tables.profiles[0].notify_after_session, true);

  await fillTestId("certificate-name", "شهادة واجهة الاختبار");
  await clickTestId("pick-certificate");
  await waitFor("browser file input", "Boolean(document.querySelector('input[type=\"file\"]'))");
  const { root } = await cdp.call("DOM.getDocument", {}, cdp.sessionId);
  const { nodeId: fileInputNodeId } = await cdp.call("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: 'input[type="file"]',
  }, cdp.sessionId);
  assert.ok(fileInputNodeId, "The certificate picker did not create a file input");
  await cdp.call("DOM.setFileInputFiles", {
    files: [imagePath],
    nodeId: fileInputNodeId,
  }, cdp.sessionId);
  await waitFor(
    "selected certificate name",
    "document.querySelector('[data-testid=\"pick-certificate\"]')?.innerText.includes('certificate-ui-test.png')",
  );
  await failNextProfileStoreWrite(
    "teacher",
    "JSON.parse(value)?.tables?.teacher_certificates?.length > (JSON.parse(localStorage.getItem(key) || 'null')?.tables?.teacher_certificates?.length ?? 0)",
  );
  await clickTestId("upload-certificate");
  await waitFor(
    "visible certificate upload error",
    "document.querySelector('[data-testid=\"certificate-upload-error\"]')?.textContent.includes('Simulated temporary profile storage failure')",
  );
  assert.equal(await readField("certificate-name"), "شهادة واجهة الاختبار");
  assert.ok(
    await evaluateInPage("document.querySelector('[data-testid=\"pick-certificate\"]')?.innerText.includes('certificate-ui-test.png')"),
    "The selected certificate file was lost after a failed upload",
  );
  await clickTestId("retry-certificate-upload");
  const viewControl = await waitFor(
    "visible certificate view action",
    "document.querySelector('[data-testid^=\"view-certificate-\"]')?.getAttribute('data-testid')",
  );
  assert.ok(
    await evaluateInPage(`document.querySelector('[data-testid="${viewControl}"]')?.textContent?.includes('عرض')`),
    "The certificate row did not show its Arabic View action",
  );
  assert.ok(
    await evaluateInPage(`document.querySelector('[data-testid="${viewControl}"]')?.getAttribute('aria-label')?.includes('شهادة واجهة الاختبار')`),
    "The certificate View action is missing its accessible label",
  );
  await waitFor("isolated certificate upload", `(() => {
    const value = JSON.parse(localStorage.getItem(${JSON.stringify(profileStoreKey("teacher"))}) || "null");
    return value?.tables?.teacher_certificates?.length === 1 && value?.files?.length === 1;
  })()`);
  stored = await readStoredProfile("teacher");
  assert.equal(stored.tables.teacher_certificates[0].name, "شهادة واجهة الاختبار");
  assert.equal(stored.tables.teacher_certificates[0].file_name, "certificate-ui-test.png");

  await evaluateInPage(`window.__profileTestExternalOpenCount = 0;
    window.open = () => { window.__profileTestExternalOpenCount += 1; return null; };`);
  await clickTestId(viewControl);
  await waitFor(
    "certificate image shown inside the app",
    `Boolean(document.querySelector('[data-testid="certificate-image-preview"]'))`,
  );
  assert.equal(await evaluateInPage("window.__profileTestExternalOpenCount"), 0, "The certificate viewer opened an external window");
  await clickTestId("close-certificate-viewer");
  await waitFor(
    "closing the in-app certificate viewer",
    `!document.querySelector('[data-testid="certificate-viewer-content"]')`,
  );

  const certificateId = viewControl.replace("view-certificate-", "");
  await evaluateInPage(`(() => {
    const key = ${JSON.stringify(profileStoreKey("teacher"))};
    const value = JSON.parse(localStorage.getItem(key) || "null");
    value.files = [];
    localStorage.setItem(key, JSON.stringify(value));
  })()`);
  await navigate(`${baseUrl}/profile-test?role=teacher`);
  await clickTestId(viewControl);
  await waitFor(
    "missing certificate object recovery action",
    `document.querySelector('[data-testid="restore-certificate-${certificateId}"]')?.textContent.includes('اختيار الصورة الأصلية')`,
  );
  await clickTestId(`restore-certificate-${certificateId}`);
  await waitFor("replacement image picker", "Boolean(document.querySelector('input[type=\"file\"]'))");
  const { root: restoreRoot } = await cdp.call("DOM.getDocument", {}, cdp.sessionId);
  const { nodeId: restoreInputNodeId } = await cdp.call("DOM.querySelector", {
    nodeId: restoreRoot.nodeId,
    selector: 'input[type="file"]',
  }, cdp.sessionId);
  assert.ok(restoreInputNodeId, "The restore action did not create an image file input");
  await cdp.call("DOM.setFileInputFiles", {
    files: [imagePath],
    nodeId: restoreInputNodeId,
  }, cdp.sessionId);
  await waitFor(
    "restored certificate image shown inside the app",
    `Boolean(document.querySelector('[data-testid="certificate-image-preview"]'))`,
  );
  stored = await readStoredProfile("teacher");
  assert.equal(stored.tables.teacher_certificates.length, 1, "Restoring a missing image must not create a duplicate certificate row");
  assert.equal(stored.files.length, 1, "The original certificate storage path was not restored");
  assert.equal(stored.files[0][0], stored.tables.teacher_certificates[0].file_url);
  await clickTestId("close-certificate-viewer");
  await waitFor(
    "closing the restored certificate viewer",
    `!document.querySelector('[data-testid="certificate-viewer-content"]')`,
  );

  const deleteControl = await evaluateInPage(
    "document.querySelector('[data-testid^=\"delete-certificate-\"]')?.getAttribute('data-testid')",
  );
  assert.ok(deleteControl, "Uploaded certificate has no delete control");
  await clickTestId(deleteControl);
  await waitFor(
    "certificate removal from the page",
    "!document.querySelector('[data-testid^=\"view-certificate-\"]')",
  );
  stored = await readStoredProfile("teacher");
  assert.deepEqual(stored.tables.teacher_certificates, []);
  assert.deepEqual(stored.files, []);
}

async function testProductionProfileTestRoute(baseUrl) {
  console.log("Testing direct profile-test links in the production bundle...");

  await cdp.call("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.clear(); localStorage.setItem("ajyal.onboarding.completed.v1", "1");`,
  }, cdp.sessionId);

  for (const role of ["student", "teacher"]) {
    const navigation = await cdp.call("Page.navigate", {
      url: `${baseUrl}/profile-test?role=${role}`,
    }, cdp.sessionId);
    assert.ok(!navigation.errorText, `The ${role} production deep link failed to load: ${navigation.errorText}`);
    try {
      await waitFor(
        "standard production sign-in screen",
        `Boolean(document.querySelector('[data-testid="login-mode-button"]'))`,
        60_000,
      );
    } catch (error) {
      const page = await evaluateInPage(
        "({ url: location.href, readyState: document.readyState, body: document.body?.innerText?.slice(0, 500) })",
      ).catch(() => null);
      throw new Error(`Production sign-in screen did not appear: ${JSON.stringify(page)}; ${error.message}`);
    }

    const state = await evaluateInPage(`({
      pathname: window.location.pathname,
      body: document.body.innerText,
      hasProfileForm: Boolean(document.querySelector('[data-testid="profile-full-name"]')),
      hasTestEmail: document.body.innerText.includes('student@profile-test.invalid')
        || document.body.innerText.includes('teacher@profile-test.invalid'),
      hasTestStorage: Object.keys(localStorage).some((key) => key.startsWith('ajyal.profile-test.v1:')),
    })`);
    assert.equal(state.pathname, "/", `The ${role} test route was not redirected out of production`);
    assert.equal(state.hasProfileForm, false, `The ${role} profile test form appeared in production`);
    assert.equal(state.hasTestEmail, false, `The ${role} fake profile appeared in production`);
    assert.equal(state.hasTestStorage, false, `The ${role} test session was created in production`);
    assert.match(state.body, /تسجيل الدخول|Sign in/, "The standard sign-in screen did not appear");
  }

  await fillPlaceholder(["البريد الإلكتروني", "Email address"], "release-smoke@example.invalid");
  await fillPlaceholder(["كلمة المرور", "Password"], "not-a-real-password");
  const requestStart = observedBrowserRequests.length;
  await clickTestId("login-button");
  const deadline = Date.now() + 30_000;
  while (mockSupabaseAuthRequests.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!mockSupabaseAuthRequests.includes("password")) {
    const formState = await evaluateInPage(`(() => ({
      url: location.href,
      readyState: document.readyState,
      email: [...document.querySelectorAll("input")].find((input) =>
        ["البريد الإلكتروني", "Email address"].includes(input.getAttribute("placeholder")))?.value ?? null,
      passwordLength: [...document.querySelectorAll("input")].find((input) =>
        ["كلمة المرور", "Password"].includes(input.getAttribute("placeholder")))?.value?.length ?? null,
      loginButton: document.querySelector('[data-testid="login-button"]')?.innerText ?? null,
      body: document.body.innerText.slice(-400),
    }))()`);
    assert.fail(`The normal sign-in flow did not reach the configured Supabase client: ${JSON.stringify({
      mockSupabaseRequests,
      browserRequests: observedBrowserRequests.slice(requestStart),
      formState,
    })}`);
  }
}

async function main() {
  const productionOnly = process.argv.includes("--production-only");
  runProfileTestPolicyTests();
  if (!productionOnly) runWebExport({ production: false });
  server = createStaticServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const imagePath = path.join(tempRoot, "certificate-ui-test.png");
  fs.writeFileSync(imagePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  if (productionOnly) {
    buildDir = path.join(tempRoot, "web-production");
    runWebExport({
      production: true,
      supabaseUrl: baseUrl,
    });
  }
  await startBrowser();

  const productionSupabaseWrites = [];
  cdp.on("Network.requestWillBeSent", (event) => {
    const url = event.params.request.url;
    const method = event.params.request.method;
    observedBrowserRequests.push(`${method} ${url}`);
    if (/supabase|ajyalalmaerifa\.com/i.test(url) && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      productionSupabaseWrites.push(`${method} ${url}`);
    }
  });

  if (productionOnly) {
    await testProductionProfileTestRoute(baseUrl);
    assert.deepEqual(productionSupabaseWrites, [], "The production route test attempted a write to production Supabase");
    runAndroidProductionExport();
    console.log("Production direct-link tests passed for web and Android bundles; sign-in uses the configured Supabase client.");
    return;
  }

  await testStudentProfile(baseUrl);
  await testTeacherCertificate(baseUrl, imagePath);
  assert.deepEqual(productionSupabaseWrites, [], "The UI test attempted a write to production Supabase");

  buildDir = path.join(tempRoot, "web-production");
  runWebExport({ production: true, supabaseUrl: baseUrl });
  await testProductionProfileTestRoute(baseUrl);
  assert.deepEqual(productionSupabaseWrites, [], "The production route test attempted a write to production Supabase");
  runAndroidProductionExport();
  console.log("Profile UI tests passed for student and teacher; production deep links use normal auth on web and Android.");
}

try {
  await main();
} finally {
  if (cdp?.socket?.readyState === WebSocket.OPEN) cdp.socket.close();
  if (browser && browser.exitCode === null) browser.kill("SIGTERM");
  if (server?.listening) server.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}