const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");

const MOORHEN_DIR = path.join(os.homedir(), "Moorhen/baby-gru");
const VITE_PORT = 5173;
const VITE_URL = `http://localhost:${VITE_PORT}/`;
const LOG_PATH = "/tmp/moorhen-wrapper.log";

let viteProcess = null;
let mainWindow = null;

function log(msg) {
  try { fs.appendFileSync(LOG_PATH, new Date().toISOString() + " " + msg + "\n"); } catch (e) {}
}

function checkServer() {
  return new Promise((resolve) => {
    const req = http.get(VITE_URL, (res) => {
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

async function ensureGenerated() {
  // Run codegen if generated files are missing (first-time setup or after fresh clone)
  const needsCodegen =
    !fs.existsSync(path.join(MOORHEN_DIR, "src/version.js")) ||
    !fs.existsSync(path.join(MOORHEN_DIR, "src/protobuf/MoorhenSession.js")) ||
    !fs.existsSync(path.join(MOORHEN_DIR, "src/utils/__graphql__/graphql.ts"));
  if (!needsCodegen) return;
  log("Running one-time codegen (version, protobuf, graphql)...");
  const env = { ...process.env, PATH: "/opt/homebrew/bin:" + (process.env.PATH || "") };
  const { execFileSync } = require("child_process");
  for (const script of ["create-version", "transpile-protobuf", "transpile-graphql-codegen"]) {
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
    dialog.showErrorBox("Moorhen not found", `Moorhen source directory not found at:\n${MOORHEN_DIR}`);
    return false;
  }

  // Ensure auto-generated files exist
  await ensureGenerated();

  // Build env: prepend Homebrew bin (avoid CCP4's old node)
  const env = { ...process.env, PATH: "/opt/homebrew/bin:" + (process.env.PATH || "") };

  // Source emsdk env if it exists - but easier to just rely on PATH
  viteProcess = spawn(
    "/opt/homebrew/bin/npx",
    ["vite", "--config", "vite.config.mts", "--port", String(VITE_PORT), "--strictPort"],
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Moorhen",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Required for SharedArrayBuffer / WASM threading
      enableBlinkFeatures: "SharedArrayBuffer",
      // Disable sandbox - WASM pthread workers need to spawn child workers
      sandbox: false,
    },
  });
  mainWindow.loadURL(VITE_URL);
  // Force 32-bit WASM (memory64 unreliable in some Electron configs)
  // by overriding WebAssembly.validate to return false for memory64 detection probe
  mainWindow.webContents.on("dom-ready", () => {
    mainWindow.webContents.executeJavaScript(`
      const origValidate = WebAssembly.validate;
      WebAssembly.validate = function(bytes) {
        // Detect memory64 probe (4 imports of memory)
        const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (arr.length === 13 && arr[12] === 4) return false;
        return origValidate.call(this, bytes);
      };
      console.log('Forced 32-bit WASM mode');
    `).catch(e => log("force32 error: " + e.message));
  });
  mainWindow.webContents.openDevTools({ mode: "detach" });
  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    log(`renderer console: ${message}`);
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

// vite-plugin-cross-origin-isolation already sets COEP/COOP — don't override here

app.whenReady().then(async () => {
  fs.writeFileSync(LOG_PATH, "=== Moorhen wrapper started " + new Date().toISOString() + " ===\n");
  log("App ready");
  const ok = await startVite();
  if (ok) {
    createWindow();
  } else {
    app.quit();
  }
});

app.on("window-all-closed", () => {
  log("All windows closed, killing vite");
  if (viteProcess) {
    try { viteProcess.kill("SIGTERM"); } catch (e) {}
  }
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
