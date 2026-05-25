const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

// Variant config is baked into variant.json at package time (see forge.config.js)
// and overridable via env vars for unpackaged `npm start` / `electron .` runs.
// Defaults are the dist values.
function loadVariant() {
  try { return require(path.join(__dirname, "variant.json")); } catch (e) { return {}; }
}
const VARIANT = loadVariant();
const MOORHEN_DIR = process.env.MOORHEN_DIR
  || path.join(os.homedir(), VARIANT.moorhenSubdir || "Moorhen/baby-gru");
const LOG_PATH = process.env.MOORHEN_LOG_PATH || VARIANT.logPath || "/tmp/pykeko.log";
const WINDOW_TITLE = process.env.MOORHEN_TITLE || VARIANT.title || "PyKeko";
const OPEN_DEVTOOLS = VARIANT.devTools === true;

// dist variant: serve a packaged static bundle instead of running vite.
// process.resourcesPath points at the .app's Resources/ when packaged;
// in dev (electron .) it points elsewhere — fall back to ../static then.
function resolveStaticDir() {
  if (!VARIANT.bundledDist) return null;
  const packagedPath = path.join(process.resourcesPath, VARIANT.bundledDist);
  if (fs.existsSync(packagedPath)) return packagedPath;
  const devPath = path.join(__dirname, VARIANT.bundledDist);
  if (fs.existsSync(devPath)) return devPath;
  return null;
}
const STATIC_DIR = resolveStaticDir();
const IS_DIST = !!STATIC_DIR;

// Port is dynamic in dist mode (whatever the static server picks), fixed
// in dev mode (matches vite port so MoorhenMCP can find it).
let SERVE_PORT = parseInt(process.env.MOORHEN_VITE_PORT || VARIANT.vitePort || "5173", 10);

let viteProcess = null;
let staticServer = null;
let mainWindow = null;

function log(msg) {
  try { fs.appendFileSync(LOG_PATH, new Date().toISOString() + " " + msg + "\n"); } catch (e) {}
}

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${SERVE_PORT}/`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(500, () => { req.destroy(); resolve(false); });
  });
}

async function waitForServer(timeoutSec = 60) {
  for (let i = 0; i < timeoutSec * 2; i++) {
    if (await checkServer()) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// In-process static-file server for the dist variant. Serves the packaged
// SPA bundle with the COOP/COEP headers SharedArrayBuffer requires. Picks a
// random localhost port (returned via SERVE_PORT) so multiple installs can
// coexist.
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".map":  "application/json; charset=utf-8",
  ".cif":  "chemical/x-cif",
  ".pdb":  "chemical/x-pdb",
  ".mtz":  "application/octet-stream",
  ".txt":  "text/plain; charset=utf-8",
  ".xml":  "application/xml; charset=utf-8",
};

function startStaticServer(distDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split("?")[0];
      // SPA fallback: any path that doesn't match a real file falls back to /index.html
      let filePath = path.join(distDir, decodeURIComponent(urlPath));
      // Path traversal guard
      if (!filePath.startsWith(distDir)) { res.writeHead(403); return res.end(); }
      fs.stat(filePath, (err, st) => {
        if (err || st.isDirectory()) {
          // Try /index.html (root and SPA-routed paths)
          filePath = path.join(distDir, "index.html");
        }
        fs.readFile(filePath, (rerr, data) => {
          if (rerr) { res.writeHead(404); return res.end(String(rerr.message || rerr)); }
          const ext = path.extname(filePath).toLowerCase();
          const mime = MIME_TYPES[ext] || "application/octet-stream";
          res.writeHead(200, {
            "content-type": mime,
            "cross-origin-opener-policy": "same-origin",
            "cross-origin-embedder-policy": "require-corp",
            "cache-control": "no-store",
          });
          res.end(data);
        });
      });
    });
    server.on("error", reject);
    // Port 0 → OS picks free port
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      log("static server on 127.0.0.1:" + port + " serving " + distDir);
      resolve({ server, port });
    });
  });
}

async function ensureGenerated() {
  // Run codegen if generated files are missing (first-time setup or after fresh clone)
  const needsCodegen =
    !fs.existsSync(path.join(MOORHEN_DIR, "src/version.js")) ||
    !fs.existsSync(path.join(MOORHEN_DIR, "public/MoorhenAssets/wasm/CootWorker.js")) ||
    !fs.existsSync(path.join(MOORHEN_DIR, "src/protobuf/MoorhenSession.js")) ||
    !fs.existsSync(path.join(MOORHEN_DIR, "src/utils/__graphql__/graphql.ts"));
  if (!needsCodegen) return;
  log("Running one-time codegen (version, ts-worker, protobuf, graphql)...");
  const env = { ...process.env, PATH: "/opt/homebrew/bin:" + (process.env.PATH || "") };
  const { execFileSync } = require("child_process");
  // Order matches baby-gru's prestart script; transpile-ts-worker builds
  // public/MoorhenAssets/wasm/CootWorker.js, without which the Coot command
  // worker fails to load (script returns vite's HTML fallback).
  for (const script of ["create-version", "transpile-ts-worker", "transpile-protobuf", "transpile-graphql-codegen"]) {
    try {
      execFileSync("/opt/homebrew/bin/npm", ["run", script], { cwd: MOORHEN_DIR, env, stdio: "pipe" });
      log("  " + script + " ok");
    } catch (e) {
      log("  " + script + " failed: " + e.message);
    }
  }
}

async function startVite() {
  // Check if vite is already running
  if (await checkServer()) {
    log("Vite already running, reusing");
    return true;
  }

  log("Starting vite from " + MOORHEN_DIR);
  if (!fs.existsSync(MOORHEN_DIR)) {
    dialog.showErrorBox("Moorhen source not found", `Moorhen source directory not found at:\n${MOORHEN_DIR}`);
    return false;
  }

  // Ensure auto-generated files exist
  await ensureGenerated();

  // Build env: prepend Homebrew bin (avoid CCP4's old node)
  const env = { ...process.env, PATH: "/opt/homebrew/bin:" + (process.env.PATH || "") };

  // Source emsdk env if it exists - but easier to just rely on PATH
  viteProcess = spawn(
    "/opt/homebrew/bin/npx",
    ["vite", "--config", "vite.config.mts", "--port", String(SERVE_PORT), "--strictPort"],
    {
      cwd: MOORHEN_DIR,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  viteProcess.stdout.on("data", (data) => log("vite stdout: " + data.toString().trim()));
  viteProcess.stderr.on("data", (data) => log("vite stderr: " + data.toString().trim()));
  viteProcess.on("exit", (code) => { log("vite exited with code " + code); viteProcess = null; });

  const ready = await waitForServer(60);
  if (!ready) {
    log("Vite failed to start within 60s");
    dialog.showErrorBox("Server start failed", "Vite dev server did not become ready within 60 seconds.\nCheck " + LOG_PATH);
    return false;
  }
  log("Vite ready");
  return true;
}

async function startBundledServer() {
  if (!STATIC_DIR) {
    dialog.showErrorBox("Bundled assets missing",
      "The distribution build expects a static bundle but none was found.\n" +
      "Looked at: " + path.join(process.resourcesPath, VARIANT.bundledDist || "static"));
    return false;
  }
  try {
    const { server, port } = await startStaticServer(STATIC_DIR);
    staticServer = server;
    SERVE_PORT = port;
    return true;
  } catch (e) {
    log("static server failed: " + e.message);
    dialog.showErrorBox("Server start failed", "Could not start in-process static server: " + e.message);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: WINDOW_TITLE,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Required for SharedArrayBuffer / WASM threading
      enableBlinkFeatures: "SharedArrayBuffer",
      // Disable sandbox - WASM pthread workers need to spawn child workers
      sandbox: false,
      // Preload sets window.MOORHEN_FORCE_32BIT early (avoids the 64-bit init hang)
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.loadURL(`http://localhost:${SERVE_PORT}/`);
  // 32-bit WASM is forced via window.MOORHEN_FORCE_32BIT, set early by preload.js.
  // (The old dom-ready WebAssembly.validate override never matched the probe — it checked
  //  arr[12] instead of arr[11] — and being renderer-only could not reach the Coot worker.)
  if (OPEN_DEVTOOLS) mainWindow.webContents.openDevTools({ mode: "detach" });
  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    log(`renderer console: ${message}`);
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

// vite-plugin-cross-origin-isolation already sets COEP/COOP — don't override here

// ---- Control server (for MoorhenMCP) ---------------------------------------
// Local HTTP endpoint that the MoorhenMCP server POSTs commands to. Token-auth,
// 127.0.0.1 only. Non-screenshot verbs are forwarded to the renderer's
// MoorhenControlBridge over IPC; "screenshot" is served here via capturePage.
const CONTROL_PORT = parseInt(process.env.MOORHEN_CONTROL_PORT || String((SERVE_PORT || 5173) + 36827), 10); // 5173->42000
const CONTROL_TOKEN = process.env.MOORHEN_CONTROL_TOKEN || crypto.randomBytes(16).toString("hex");
// CONTROL_FILE is keyed by serve port so multiple PyKeko instances (dev/dist) coexist
function controlFilePath() {
  return path.join(os.homedir(), ".moorhen-mcp", `control-${SERVE_PORT}.json`);
}
const controlPending = new Map(); // id -> { resolve, reject, timer }

function invokeRenderer(win, verb, args) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { controlPending.delete(id); reject(new Error("renderer timeout")); }, 120000);
    controlPending.set(id, { resolve, reject, timer });
    win.webContents.send("moorhen-control:invoke", { id, verb, args });
  });
}

function startControlServer(win) {
  ipcMain.on("moorhen-control:result", (_e, res) => {
    const p = controlPending.get(res.id);
    if (!p) return;
    clearTimeout(p.timer); controlPending.delete(res.id);
    if (res.ok) p.resolve(res.result); else p.reject(new Error(res.error || "control error"));
  });
  ipcMain.on("moorhen-control:ready", (_e, verbs) => log("control bridge ready; verbs: " + (verbs || []).join(",")));

  const server = http.createServer((req, res) => {
    if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 50 * 1024 * 1024) req.destroy(); });
    req.on("end", async () => {
      const reply = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      let msg;
      try { msg = JSON.parse(body || "{}"); } catch (e) { return reply(400, { ok: false, error: "bad json" }); }
      if (msg.token !== CONTROL_TOKEN) return reply(403, { ok: false, error: "bad token" });
      try {
        let result;
        if (msg.verb === "ping") result = { ok: true, title: WINDOW_TITLE, vitePort: SERVE_PORT };
        else if (msg.verb === "screenshot") result = { png: (await win.webContents.capturePage()).toPNG().toString("base64") };
        else result = await invokeRenderer(win, msg.verb, msg.args);
        reply(200, { ok: true, result });
      } catch (e) { reply(200, { ok: false, error: String((e && e.message) || e) }); }
    });
  });
  server.on("error", (e) => log("control server error: " + e.message));
  server.listen(CONTROL_PORT, "127.0.0.1", () => {
    log(`control server on 127.0.0.1:${CONTROL_PORT}`);
    try {
      const ctlFile = controlFilePath();
      fs.mkdirSync(path.dirname(ctlFile), { recursive: true });
      fs.writeFileSync(ctlFile, JSON.stringify({ port: CONTROL_PORT, token: CONTROL_TOKEN, vitePort: SERVE_PORT, title: WINDOW_TITLE, pid: process.pid }, null, 2));
    } catch (e) { log("control file write failed: " + e.message); }
  });
}

app.whenReady().then(async () => {
  fs.writeFileSync(LOG_PATH, "=== PyKeko wrapper started " + new Date().toISOString() + " ===\n");
  log("App ready (variant=" + (IS_DIST ? "dist" : "dev") + ")");
  const ok = IS_DIST ? await startBundledServer() : await startVite();
  if (ok) {
    createWindow();
    startControlServer(mainWindow);
  } else {
    app.quit();
  }
});

app.on("window-all-closed", () => {
  log("All windows closed, shutting down");
  if (viteProcess) {
    try { viteProcess.kill("SIGTERM"); } catch (e) {}
  }
  if (staticServer) {
    try { staticServer.close(); } catch (e) {}
  }
  try { fs.unlinkSync(controlFilePath()); } catch (e) {}
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
