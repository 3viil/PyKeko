# MoorhenWrapper

Minimal Electron wrapper for [Moorhen](https://github.com/3viil/MoorHenMH) that gives you a desktop window instead of a browser tab.

## How it works

This is **not** a full Electron port of Moorhen. It's a thin wrapper that:

1. Starts a vite dev server invisibly in the background (from `~/Moorhen/baby-gru/`)
2. Opens an Electron window pointed at `http://localhost:5173/`
3. Forces 32-bit WASM mode (more reliable in Electron's renderer)
4. Sets COEP/COOP headers for SharedArrayBuffer
5. Kills vite when the window closes

On first launch it also runs the baby-gru codegen steps if their outputs are missing (`create-version`, `transpile-ts-worker`, `transpile-protobuf`, `transpile-graphql-codegen`). The `transpile-ts-worker` step builds `public/MoorhenAssets/wasm/CootWorker.js` — without it the Coot command worker can't load (the request falls back to vite's HTML, throwing `Unexpected token '<'`).

The benefit: avoids the CRA/CJS/double-bundling problems of the original MoorhenElectron build path. The vite dev server natively handles all the module resolution and HMR.

## Requirements

- Moorhen source tree at `~/Moorhen/baby-gru/` (clone of [3viil/MoorHenMH](https://github.com/3viil/MoorHenMH))
- Node.js 18+
- Built WASM artifacts in `~/Moorhen/baby-gru/public/MoorhenAssets/wasm/`

## Build

```bash
npm install
npx electron-forge package
xattr -rc out/MoorhenLocal-darwin-arm64/MoorhenLocal.app
cp -r out/MoorhenLocal-darwin-arm64/MoorhenLocal.app /Applications/
```

## Run

Launch from `/Applications/MoorhenLocal.app`, or:

```bash
npx electron .
```

## Debugging

Log file: `/tmp/moorhen-wrapper.log`

To open with DevTools, edit `main.js` and uncomment the `openDevTools` line.

## Dev variant

The dev app builds from this same repo — no separate copy needed:

```bash
npm run package:dev
xattr -rc out/MoorhenDev-darwin-arm64/MoorhenDev.app
cp -r out/MoorhenDev-darwin-arm64/MoorhenDev.app /Applications/
```

`package:dev` sets `MOORHEN_VARIANT=dev`, which `forge.config.js` bakes into `variant.json` (read by `main.js`): it targets `~/Moorhen-dev/baby-gru/` on port 5174, so it won't clash with production (port 5173). For unpackaged runs (`npm start`) you can override at runtime with `MOORHEN_DIR`, `MOORHEN_VITE_PORT`, `MOORHEN_TITLE`, `MOORHEN_LOG_PATH`.
