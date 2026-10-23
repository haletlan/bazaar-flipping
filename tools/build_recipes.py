#!/usr/bin/env python3
"""
Regenerates data/recipes.json from the NotEnoughUpdates item repository.

Usage (from the repository root):
    python tools/build_recipes.py

Needs only the Python standard library. Downloads the NEU repo as a zip,
keeps crafting recipes, their collection / slayer requirements and item names,
and converts NEU item IDs to Hypixel bazaar IDs.
"""
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

NEU_ZIP = "https://codeload.github.com/NotEnoughUpdates/NotEnoughUpdates-REPO/zip/refs/heads/master"
OUT = Path(__file__).resolve().parent.parent / "data" / "recipes.json"
SLOTS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"]


def download():
    print("Stahuji NEU repozitář…", file=sys.stderr)
    with urllib.request.urlopen(NEU_ZIP, timeout=120) as r:
        return zipfile.ZipFile(io.BytesIO(r.read()))


def main():
    z = download()
    root = z.namelist()[0].split("/")[0]
    stock = {x["id"]: x["stock"] for x in json.loads(z.read(f"{root}/constants/bazaarstocks.json"))}

    def bazaar_id(neu_id):
        """NEU uses e.g. SHARPNESS;5 and INK_SACK-3, the bazaar ENCHANTMENT_SHARPNESS_5 and INK_SACK:3."""
        i = stock.get(neu_id, neu_id)
        m = re.match(r"^(.*)-(\d+)$", i)
        return f"{m.group(1)}:{m.group(2)}" if m else i

    def strip(s):
        return re.sub(r"§.", "", s or "").strip()

    names, recipes = {}, {}
    for path in z.namelist():
        if not (path.startswith(f"{root}/items/") and path.endswith(".json")):
            continue
        d = json.loads(z.read(path))
        iid = bazaar_id(d["internalname"])
        names[iid] = strip(d.get("displayname"))

        raw = []
        if d.get("recipe"):
            raw.append(d["recipe"])
        raw += [r for r in (d.get("recipes") or []) if r.get("type") == "crafting"]

        out = []
        for r in raw:
            grid = []
            for k in SLOTS:
                v = r.get(k) or ""
                if v and ":" in v:
                    item, _, qty = v.rpartition(":")
                    try:
                        grid.append([bazaar_id(item), round(float(qty))])
                    except ValueError:
                        grid.append([bazaar_id(v), 1])
                elif v:
                    grid.append([bazaar_id(v), 1])
                else:
                    grid.append(0)
            if not any(grid):
                continue
            entry = {"g": grid}
            count = int(r.get("count") or 1)
            if count != 1:
                entry["c"] = count
            if entry not in out:
                out.append(entry)

        if out:
            rec = {"r": out}
            req = (d.get("crafttext") or "").replace("Requires:", "").strip()
            if req:
                rec["q"] = req
            if d.get("slayer_req"):
                rec["s"] = d["slayer_req"]
            recipes[iid] = rec

    used = set(recipes)
    for r in recipes.values():
        for e in r["r"]:
            used |= {c[0] for c in e["g"] if c}
    data = {"names": {k: v for k, v in sorted(names.items()) if k in used}, "recipes": dict(sorted(recipes.items()))}

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Hotovo: {len(recipes)} receptů → {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
