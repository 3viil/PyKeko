# PyKeko Mol* viewer template

A small Vite + React + [Mol\*](https://molstar.org/) project that builds to a
**single self-contained HTML** with everything inlined (~3.4 MB). PyKeko's
"Export portable viewer" action replaces the `__PYKEKO_MVS_JSON_PLACEHOLDER__`
inside `dist/index.html` with a [MolViewSpec (MVS)](https://molstar.org/mol-view-spec/)
JSON document describing the current scene; the viewer loads it on open via
`loadMVS`.

## When to rebuild

Edit any of `src/App.tsx`, `index.html`, or `vite.config.ts`, then:

```bash
cd ~/PyKeko/viewer-template
npm install      # only the first time
npm run build    # produces dist/index.html (~3.4 MB)
```

`dist/index.html` is committed so a fresh `npm run package` in `~/PyKeko` ships
it without first having to install Mol\*. Bump the size budgets in
`vite.config.ts` if a future Mol\* release pushes the bundle past the inline
limit.

## How PyKeko reaches it at runtime

`main.js` looks for the template, in order:

1. `process.resourcesPath/dist/index.html` — the packaged location
   (`forge.config.js` ships `viewer-template/dist` via `extraResource`).
2. `__dirname/viewer-template/dist/index.html` — unpackaged dev runs.
3. `~/PyKeko/viewer-template/dist/index.html` — last-ditch dev fallback.

The injection is targeted (regex-matches the `<script id="__pykeko_mvs__">`
block only) so it can't clobber the same literal that lives inside the inlined
JS bundle.
