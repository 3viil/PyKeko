"""pykeko_remote — drive a running PyKeko app from Python, à la PyMOL's ``-R``.

PyKeko already runs a token-authenticated HTTP control server on localhost (the
same one PyKekoMCP uses). This module is a thin, dependency-free client for it,
so you can script a *running* PyKeko window from Python exactly the way you drive
PyMOL over RPC.

    import pykeko_remote as pk
    app = pk.connect()                 # auto-find the running PyKeko
    app.load("1crn")                   # fetch from RCSB by PDB id
    app.load("/path/to/model.pdb")     # ...or load a local file (PDB/mmCIF/MTZ/map/dict)
    app.go_to("//A/15")
    app.refine("//A/15", mode="TRIPLE")
    app.screenshot("shot.png")
    print(app.state())

If more than one PyKeko is open, pass ``connect(vite_port=5174)`` to pick one
(5174 = PyKekoDev; the production app uses a random port — see its title via
``pk.instances()``).

Stdlib only — works with any Python 3 without ``pip install``.
"""

import os
import json
import glob
import base64
import urllib.request

CONTROL_DIR = os.path.expanduser("~/.moorhen-mcp")


class PyKeko:
    """A connection to one running PyKeko control server."""

    def __init__(self, port, token, info=None):
        self.port = port
        self.token = token
        self.info = info or {}

    # ---- transport --------------------------------------------------------
    def _post(self, verb, args=None, timeout=120):
        body = json.dumps({"token": self.token, "verb": verb, "args": args or []}).encode()
        req = urllib.request.Request(
            "http://127.0.0.1:%d" % self.port,
            data=body,
            headers={"content-type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as r:
            res = json.loads(r.read().decode())
        if not res.get("ok"):
            raise RuntimeError(res.get("error", "control error"))
        return res.get("result")

    def ping(self):
        return self._post("ping", timeout=5)

    # ---- loading ----------------------------------------------------------
    def load(self, path_or_id, name=None):
        """Load a local file (by path) or fetch coordinates from RCSB (by 4-char PDB id).

        Local files go through the batch loader, so a restraints CIF passed alongside
        a model attaches to it (same behaviour as ``pykeko model.pdb ligand.cif``)."""
        if os.path.isfile(path_or_id):
            with open(path_or_id, "rb") as fh:
                data = base64.b64encode(fh.read()).decode()
            spec = {"name": os.path.basename(path_or_id), "dataBase64": data}
            return self._post("loadFiles", [[spec]])
        if len(path_or_id) == 4 and path_or_id[0].isdigit():
            url = "https://files.rcsb.org/download/%s.pdb" % path_or_id.upper()
            return self._post("loadCoordsFromURL", [url, name or path_or_id])
        raise ValueError("not an existing file or a 4-char PDB id: %r" % path_or_id)

    def load_files(self, *paths):
        """Batch-load several local files in one call (coords/maps/dicts, order-independent)."""
        specs = []
        for p in paths:
            with open(p, "rb") as fh:
                specs.append({"name": os.path.basename(p), "dataBase64": base64.b64encode(fh.read()).decode()})
        return self._post("loadFiles", [specs])

    # ---- query ------------------------------------------------------------
    def state(self):
        return self._post("getState")

    # ---- navigation / editing (thin wrappers over the control verbs) ------
    def go_to(self, cid, mol=None):
        return self._post("goToResidue", [cid, mol])

    def refine(self, cid, mode="TRIPLE", mol=None):
        return self._post("refine", [cid, mode, mol])

    def auto_fit_rotamer(self, cid, mol=None):
        return self._post("autoFitRotamer", [cid, mol])

    def flip_peptide(self, cid, mol=None):
        return self._post("flipPeptide", [cid, mol])

    def add_terminal_residue(self, cid, mol=None):
        return self._post("addTerminalResidue", [cid, mol])

    def add_waters(self, mol=None):
        return self._post("addWaters", [mol])

    def delete(self, cid, mol=None):
        return self._post("deleteCid", [cid, mol])

    def set_active_map(self, map_mol_no):
        return self._post("setActiveMap", [map_mol_no])

    def undo(self, mol=None):
        return self._post("undo", [mol])

    def redo(self, mol=None):
        return self._post("redo", [mol])

    # ---- scripting --------------------------------------------------------
    def pymol(self, script):
        """Run a PyMOL-style command string through PyKeko's translator."""
        return self._post("runPymol", [script])

    def js(self, script):
        return self._post("runJs", [script])

    def coot(self, command, args=None, mol=None):
        """Call a raw libcootapi command (advanced)."""
        return self._post("coot", [command, args or [], mol])

    # ---- imaging ----------------------------------------------------------
    def screenshot(self, path=None):
        """Capture the viewport. Returns PNG bytes, or writes to `path` and returns it."""
        res = self._post("screenshot")
        png = base64.b64decode(res["png"])
        if path:
            with open(path, "wb") as fh:
                fh.write(png)
            return path
        return png


def instances():
    """Return [(info, PyKeko), ...] for every *live* PyKeko control server."""
    found = []
    for f in sorted(glob.glob(os.path.join(CONTROL_DIR, "control-*.json"))):
        try:
            cfg = json.load(open(f))
            inst = PyKeko(cfg["port"], cfg["token"], info=cfg)
            inst.ping()  # raises if the server is gone (stale control file)
            found.append((cfg, inst))
        except Exception:
            continue
    return found


def connect(vite_port=None):
    """Connect to a running PyKeko.

    With no argument, auto-selects the single live instance (raises if there are
    zero or more than one). Pass ``vite_port`` (e.g. 5174 for PyKekoDev) to target
    a specific one when several are open."""
    live = instances()
    if vite_port is not None:
        live = [(c, i) for c, i in live if c.get("vitePort") == vite_port]
    if not live:
        raise RuntimeError("no running PyKeko found — is the app open? (looked in %s)" % CONTROL_DIR)
    if len(live) > 1:
        ports = ", ".join("vitePort=%s (%s)" % (c.get("vitePort"), c.get("title")) for c, _ in live)
        raise RuntimeError("multiple PyKeko instances open; pass connect(vite_port=...): %s" % ports)
    return live[0][1]


# ---- command-line interface ----------------------------------------------
# `pykeko-remote load 1crn`, `pykeko-remote refine //A/15`, `pykeko-remote pymol "..."`,
# `pykeko-remote screenshot out.png`, or `pykeko-remote verb <name> '<json-args>'`.
def _cli(argv=None):
    import argparse
    p = argparse.ArgumentParser(prog="pykeko-remote",
                                description="Drive a running PyKeko app from the shell (a la PyMOL -R).")
    p.add_argument("--port", type=int, default=None,
                   help="vitePort of a specific instance (e.g. 5174 for PyKekoDev) when several are open")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("state", help="print loaded molecules/maps")
    s = sub.add_parser("load", help="load file(s) and/or fetch PDB id(s)"); s.add_argument("targets", nargs="+")
    s = sub.add_parser("goto", help="centre on a residue CID"); s.add_argument("cid")
    s = sub.add_parser("refine", help="refine around a CID"); s.add_argument("cid"); s.add_argument("mode", nargs="?", default="TRIPLE")
    s = sub.add_parser("pymol", help="run a PyMOL-style command string"); s.add_argument("script")
    s = sub.add_parser("js", help="run a JS script"); s.add_argument("script")
    s = sub.add_parser("screenshot", help="save the viewport to a PNG"); s.add_argument("path")
    s = sub.add_parser("verb", help="call any control verb with JSON args"); s.add_argument("name"); s.add_argument("json_args", nargs="?", default="[]")
    a = p.parse_args(argv)

    app = connect(vite_port=a.port)
    if a.cmd == "state":
        r = app.state()
    elif a.cmd == "load":
        ids = [t for t in a.targets if not os.path.isfile(t) and len(t) == 4 and t[0].isdigit()]
        files = [t for t in a.targets if os.path.isfile(t)]
        unknown = [t for t in a.targets if t not in ids and t not in files]
        r = {"fetched": [app._post("loadCoordsFromURL", ["https://files.rcsb.org/download/%s.pdb" % i.upper(), i]) for i in ids]}
        if files:
            r["files"] = app.load_files(*files)   # batched so a dict attaches to coords
        if unknown:
            r["unknown"] = unknown
    elif a.cmd == "goto":
        r = app.go_to(a.cid)
    elif a.cmd == "refine":
        r = app.refine(a.cid, a.mode)
    elif a.cmd == "pymol":
        r = app.pymol(a.script)
    elif a.cmd == "js":
        r = app.js(a.script)
    elif a.cmd == "screenshot":
        r = app.screenshot(a.path)
    elif a.cmd == "verb":
        r = app._post(a.name, json.loads(a.json_args))
    print(r if isinstance(r, str) else json.dumps(r, indent=2))


if __name__ == "__main__":
    _cli()
