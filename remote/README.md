# pykeko-remote — drive a running PyKeko from scripts (à la PyMOL `-R`)

PyKeko runs a token-authenticated HTTP control server on localhost (the same one
PyKekoMCP uses). `pykeko_remote.py` is a dependency-free Python client for it — so
you can script a **running** PyKeko window the way you drive PyMOL over RPC.

It auto-discovers the running instance by reading `~/.moorhen-mcp/control-*.json`
and pinging each, so you don't pass a port unless several apps are open.

## Python

```python
import pykeko_remote as pk

app = pk.connect()                 # auto-find the running PyKeko (or connect(vite_port=5174))
app.load("1crn")                   # fetch coordinates from RCSB by PDB id
app.load("/data/model.pdb")        # ...or load a local file
app.load_files("model.pdb", "ligand.cif")   # batch: the dict attaches to the model
app.go_to("//A/15")
app.refine("//A/15", mode="TRIPLE")
app.auto_fit_rotamer("//A/15")
app.flip_peptide("//A/16")
app.add_waters()
app.pymol("bg_color black")        # PyMOL-style command through PyKeko's translator
app.screenshot("shot.png")
print(app.state())                 # {'molecules': [...], 'maps': [...], 'activeMapMolNo': ...}
```

Every control verb is reachable; the named methods are thin wrappers, and
`app.coot(command, args, mol)` / `app._post(verb, args)` call anything directly.

## Shell

```sh
pykeko-remote state
pykeko-remote load 1crn
pykeko-remote load model.pdb ligand.cif      # files batched; PDB ids fetched
pykeko-remote goto //A/15
pykeko-remote refine //A/15 TRIPLE
pykeko-remote pymol "bg_color black"
pykeko-remote screenshot out.png
pykeko-remote verb getState                  # call any control verb with JSON args
pykeko-remote --port 5174 state              # target PyKekoDev specifically
```

## Notes

- Requires a PyKeko window to be **open** (it drives the live session; it doesn't launch one).
- Python 3 stdlib only — no `pip install`.
- Production `PyKeko.app` uses a random control port; `pykeko-remote` finds it automatically.
  If both PyKeko and PyKekoDev are open, pass `--port`/`vite_port=` to disambiguate.
