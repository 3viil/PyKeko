// Build both the production and dev desktop apps from this single repo:
//   npm run package        -> MoorhenLocal.app  (~/Moorhen/baby-gru,     vite port 5173)
//   npm run package:dev    -> MoorhenDev.app     (~/Moorhen-dev/baby-gru, vite port 5174)
//
// The selected variant is baked into variant.json (read by main.js at runtime),
// so the packaged, double-clickable app knows which Moorhen tree and port to use
// without relying on shell environment variables at launch.
const fs = require("fs");
const path = require("path");

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
    },
  },
};

const variant = VARIANTS[process.env.MOORHEN_VARIANT || "prod"] || VARIANTS.prod;

module.exports = {
  packagerConfig: { name: variant.name },
  hooks: {
    // Bake the variant config so the packaged app self-describes its target tree/port.
    prePackage: async () => {
      fs.writeFileSync(
        path.join(__dirname, "variant.json"),
        JSON.stringify(variant.config, null, 2) + "\n"
      );
    },
  },
  makers: [{ name: "@electron-forge/maker-zip", platforms: ["darwin"] }],
};
