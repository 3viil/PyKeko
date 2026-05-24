// Build both the production and dev desktop apps from this single repo:
//   npm run package        -> MoorhenLocal.app  (~/Moorhen/baby-gru,     vite port 5173)
//   npm run package:dev    -> MoorhenDev.app     (~/Moorhen-dev/baby-gru, vite port 5174)
//   MOORHEN_VARIANT=dist npm run make
//                          -> Moorhen.dmg + Moorhen.app (self-contained, no vite/node at runtime)
//
// The selected variant is baked into variant.json (read by main.js at runtime),
// so the packaged, double-clickable app knows which Moorhen tree and port to use
// without relying on shell environment variables at launch.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const VARIANTS = {
  prod: {
    name: "MoorhenLocal",
    config: {
      moorhenSubdir: "Moorhen/baby-gru",
      vitePort: 5173,
      logPath: "/tmp/moorhen-wrapper.log",
      title: "Moorhen",
    },
  },
  dev: {
    name: "MoorhenDev",
    config: {
      moorhenSubdir: "Moorhen-dev/baby-gru",
      vitePort: 5174,
      logPath: "/tmp/moorhen-wrapper-dev.log",
      title: "Moorhen Dev",
      devTools: true,
    },
  },
  // dist variant: self-contained, redistributable build. The .app bundles a
  // pre-built static dist/ tree and serves it via an in-process HTTP server,
  // so it does not depend on ~/Moorhen, node, npm, emsdk, or vite at runtime.
  dist: {
    name: "Moorhen",
    config: {
      bundledDist: "static",  // relative to app.asar.unpacked or Resources/app/
      logPath: "/tmp/moorhen-dist.log",
      title: "Moorhen",
    },
  },
};

const variant = VARIANTS[process.env.MOORHEN_VARIANT || "prod"] || VARIANTS.prod;
const IS_DIST = (process.env.MOORHEN_VARIANT || "prod") === "dist";

// Where the baby-gru source tree lives on the build machine.
const BABY_GRU = path.join(os.homedir(), "Moorhen", "baby-gru");
// Staging directory inside MoorhenWrapper. Becomes Resources/app/static/ in
// the packaged app via packagerConfig.extraResource (added below for dist).
const STATIC_DIR = path.join(__dirname, "static");

function log(msg) {
  process.stdout.write("[forge.config] " + msg + "\n");
}

function buildBabyGruSpa() {
  log("Building baby-gru SPA bundle (this takes a few minutes)...");

  // Run codegen first (idempotent — same scripts the wrapper runs at first launch).
  for (const script of ["create-version", "transpile-ts-worker", "transpile-protobuf", "transpile-graphql-codegen"]) {
    log("  npm run " + script);
    execFileSync("npm", ["run", script], { cwd: BABY_GRU, stdio: "inherit" });
  }

  // The repo's vite.config.mts is set up for LIBRARY builds (build.lib).
  // For the SPA we drop a transient alt config alongside it that loads the
  // base config's plugins but disables lib mode. outDir points directly at
  // MoorhenWrapper/static so vite copies built JS + public/ contents there
  // in one step. Cleaned up in finally{}.
  log("Staging built bundle in " + STATIC_DIR);
  if (fs.existsSync(STATIC_DIR)) fs.rmSync(STATIC_DIR, { recursive: true, force: true });

  const altCfgPath = path.join(BABY_GRU, ".vite.config.dist-app.mts");
  const altCfg = `
import baseConfig from "./vite.config.mts";
import { defineConfig } from "vite";

// Disable library-build config so vite builds a real SPA from index.html.
const base = baseConfig as any;
export default defineConfig({
  ...base,
  build: {
    outDir: ${JSON.stringify(STATIC_DIR)},
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    target: "esnext",
    rollupOptions: { output: {} },
  },
});
`;
  fs.writeFileSync(altCfgPath, altCfg);

  try {
    log("  npx vite build --config .vite.config.dist-app.mts");
    execFileSync("npx", ["vite", "build", "--config", ".vite.config.dist-app.mts"], {
      cwd: BABY_GRU,
      stdio: "inherit",
    });
  } finally {
    try { fs.unlinkSync(altCfgPath); } catch (e) {}
  }

  if (!fs.existsSync(STATIC_DIR)) {
    throw new Error("vite build did not produce " + STATIC_DIR);
  }
  log("Static bundle size: " + execFileSync("du", ["-sh", STATIC_DIR]).toString().trim());
}

module.exports = {
  packagerConfig: {
    name: variant.name,
    // For dist, ship the static bundle alongside the JS so main.js can find
    // it at runtime via path.join(process.resourcesPath, 'static').
    extraResource: IS_DIST ? [STATIC_DIR] : undefined,
  },
  hooks: {
    // Bake the variant config so the packaged app self-describes its target tree/port.
    prePackage: async () => {
      fs.writeFileSync(
        path.join(__dirname, "variant.json"),
        JSON.stringify(variant.config, null, 2) + "\n"
      );
      if (IS_DIST) {
        buildBabyGruSpa();
      }
    },
  },
  makers: [
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    // DMG for the dist variant only — prod/dev keep producing .zip
    ...(IS_DIST
      ? [{
          name: "@electron-forge/maker-dmg",
          config: {
            name: "Moorhen",
            overwrite: true,
          },
          platforms: ["darwin"],
        }]
      : []),
  ],
};
