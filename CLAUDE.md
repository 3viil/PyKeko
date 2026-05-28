# Claude context — `pykeko/PyKeko`

This is the **Electron wrapper repo** for PyKeko, the user's branded desktop app around Moorhen (a Coot-based molecular graphics web app). Named after the pūkeko (NZ swamphen).

## Repo family (all under github.com/pykeko)

| Repo | Purpose | Local clone |
| --- | --- | --- |
| **PyKeko** (this) | Electron wrapper that produces `PyKeko.app` / `PyKeko.dmg` | `~/PyKeko` |
| [PyKekoMCP](https://github.com/pykeko/PyKekoMCP) | MCP server for Claude to drive a running PyKeko | `~/PyKekoMCP` |
| [Moorhen-PyKeko](https://github.com/pykeko/Moorhen-PyKeko) | Fork of upstream `moorhen-coot/Moorhen` with PyKeko customizations | `~/Moorhen` (prod), `~/Moorhen-dev` (dev) |

## Build

```bash
npm install
npm run package         # builds out/PyKeko-darwin-arm64/PyKeko.app (dist, self-contained)
npm run package:dev     # builds out/PyKekoDev-darwin-arm64/PyKekoDev.app (vite live, port 5174)
npm run make            # produces out/make/PyKeko.dmg (dist variant)
```

The dist variant's prePackage hook runs a full vite build of `~/Moorhen/baby-gru` into `static/`, then bundles that into the .app.

Install path:
```bash
xattr -rc out/PyKeko-darwin-arm64/PyKeko.app
rm -rf /Applications/PyKeko.app  # if reinstalling
cp -R out/PyKeko-darwin-arm64/PyKeko.app /Applications/
```

## Naming conventions

- **Prose / display / UI**: `PyKeko`
- **Filesystem / binaries / package names**: `pykeko`
- **Never**: `PyKEKO`
- Default branch: `main` (the `dist-variant` branch was deleted after fast-forward — don't recreate it)

## Wire-protocol identifiers — DO NOT RENAME

These flow between PyKeko (wrapper), PyKekoMCP, and the in-page bridge inside Moorhen-PyKeko. Renaming any of them breaks the control channel:

- IPC channels: `moorhen-control:invoke`, `moorhen-control:result`, `moorhen-control:ready`
- Control file dir: `~/.moorhen-mcp/control-<port>.json`
- Env vars: `MOORHEN_DIR`, `MOORHEN_VARIANT`, `MOORHEN_VITE_PORT`, `MOORHEN_TITLE`, `MOORHEN_LOG_PATH`
- Bridge identifiers: `MoorhenControlBridge`, `window.MoorhenControlApi`, `__moorhenControl`
- MCP tool names: all `moorhen_*`
- Source filenames inside `Moorhen-PyKeko/baby-gru/`: `MoorhenAssets/`, `MoorhenSession.*`, `MoorhenFileLoading.ts`, etc.
- Local clone dirs: `~/Moorhen`, `~/Moorhen-dev` (deliberately kept — too many hard-coded paths to be worth renaming)

If you need to "rebrand" further, change titles, READMEs, app names, package names — never the above.

## Current state (as of pk-v0.2, 2026-05-28)

- Version: `0.2.0` in `package.json`, `CFBundleShortVersionString` derived from it
- Release: [pk-v0.2](https://github.com/pykeko/Moorhen-PyKeko/releases/tag/pk-v0.2) on Moorhen-PyKeko, asset: `PyKeko.dmg` (~197 MB). From 0.2.0 the wrapper carries a matching `pk-v0.2` tag too.
  - 0.2.0 adds: CLI launch+load (`.cif`→dictionary attach, `pykeko 1crn`, `.pml`), single-instance file handoff + `--new`, `remote/pykeko_remote.py` (PyMOL-`-R`-style client), Preferences → "Install command-line launcher" + first-run hint, residue **Edit torsions** panel (local φ/ψ + χ + live Ramachandran), black bg / hydrogens-by-default / PyMOL-default scripting.
- Build/release: `PATH=/opt/homebrew/bin:$PATH npm run make` (Homebrew node 26; the vite dist build is a few minutes). Smoke-test the built app by installing over `/Applications/PyKeko.app` and launching with `--new` — and **don't leave PyKekoDev running**, two coot pthread instances contend at worker-init and the second hangs on "Moorhen is loading…" (not a bug; see project memory).
- [pk-v0.1](https://github.com/pykeko/Moorhen-PyKeko/releases/tag/pk-v0.1): the prior release (`PyKeko.dmg`, 185 MB)
- Icons: `PyKeko.icns` (multi-resolution, used by electron-forge), `PyKeko_icon.png` (rounded-square with dark-corner mask, source for the `.icns` — intended for OS app-icon clip), `PyKeko_avatar.png` (flat-square 5%-crop of the icon — used for the GH org avatar, repo social previews, and README `<img>` embeds), `PyKeko_logo.png` (transparent, for UI embedding)

## Pending follow-ups

- [ ] Delete obsolete GitHub repos (the pre-rename originals — `gh repo list hilgersmt` and look for repos *not* in the table above; plus `strava-analytics`). Needs `gh auth refresh -h github.com -s delete_repo` first.
- [ ] Pin the [install gist](https://gist.github.com/hilgersmt/797821d1fb70599b21fd31159b346a95) on the GitHub profile (web UI; the 4 current pins have 2 slots free)
- [ ] Upload `PyKeko_avatar.png` as social-preview image for each of the 3 pykeko org repos (web UI per repo's Settings page — not API-accessible). Org avatar (`pykeko/settings/profile`) uses the same file.

## Where to look

- `forge.config.js` — variant definitions, packagerConfig.icon, makers
- `main.js` — Electron lifecycle, vite spawn (dev) or static server (dist), control server
- `preload.js` — forces 32-bit WASM, exposes `__moorhenControl` to in-page
