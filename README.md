# MoorhenWrapper

Minimal Electron wrapper for [Moorhen](https://github.com/3viil/MoorHenMH) that gives you a desktop window instead of a browser tab.

## How it works

This is **not** a full Electron port of Moorhen. It's a thin wrapper that:

1. Starts a vite dev server invisibly in the background (from `~/Moorhen/baby-gru/`)
2. Opens an Electron window pointed at `http://localhost:5173/`
3. Forces 32-bit WASM mode (more reliable in Electron's renderer)
4. Sets COEP/COOP headers for SharedArrayBuffer
5. Kills vite when the window closes

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

There's a separate `MoorhenWrapper-Dev` that points to `~/Moorhen-dev/baby-gru/` for experimental work. It uses port 5174 to avoid conflicting with the production version.
