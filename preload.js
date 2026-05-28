// PyKeko preload — runs before page scripts in an isolated world.
//
// 1) Force 32-bit WASM: the 64-bit Coot module init hangs intermittently in Electron
//    (createCoot64Module deadlocks in the worker). The renderer loader and
//    MoorhenCommandCentre read window.MOORHEN_FORCE_32BIT; the latter appends
//    ?force32=1 to the CootWorker URL so the worker (separate context) honors it too.
//    The browser build has no preload, so it keeps 64-bit.
//
// 2) Control channel for PyKekoMCP: expose window.__moorhenControl so the in-page
//    MoorhenControlBridge can receive invoke messages from the Electron main process
//    (which fronts the local HTTP control server) and return results — over IPC,
//    keeping contextIsolation on (no nodeIntegration in the renderer).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("MOORHEN_FORCE_32BIT", true);

contextBridge.exposeInMainWorld("__moorhenControl", {
  onInvoke: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on("moorhen-control:invoke", handler);
    return () => ipcRenderer.removeListener("moorhen-control:invoke", handler);
  },
  sendResult: (res) => ipcRenderer.send("moorhen-control:result", res),
  ready: (verbs) => ipcRenderer.send("moorhen-control:ready", verbs),
  // Renderer -> main: show a native OS open dialog rooted at the working directory
  // and load the chosen files (the File menu's "Open Files" uses this under Electron,
  // since a browser <input type=file> can't set a starting directory).
  openFiles: () => ipcRenderer.invoke("pykeko:open-files"),
  // Renderer -> main: install / check the `pykeko` command-line launcher in
  // /usr/local/bin (VS Code-style). installCliLauncher prompts for admin once.
  installCliLauncher: () => ipcRenderer.invoke("pykeko:install-cli"),
  cliLauncherStatus: () => ipcRenderer.invoke("pykeko:cli-status"),
});
