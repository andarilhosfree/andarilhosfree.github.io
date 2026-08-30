#!/usr/bin/env python3
"""Build map-data/tibia-map/creature-spawns.json from a tibia-map-spawn checkout.

Matches the tibia-map-spawn viewer: world X/Y use center + monster offset,
floor Z uses centerz only (monster.z offset is ignored). Only creatures with a
matching GIF under images/monster_images/ and at least one point inside
bounds.json are included.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def build_index(spawn_data: dict, bounds: dict, gif_names: set[str]) -> dict:
    display_name: dict[str, str] = {}
    points: dict[str, set[tuple[int, int, int]]] = defaultdict(set)

    x_min = int(bounds["xMin"])
    x_max = int(bounds["xMax"])
    y_min = int(bounds["yMin"])
    y_max = int(bounds["yMax"])
    z_min = int(bounds["zMin"])
    z_max = int(bounds["zMax"])

    for spawn in spawn_data.get("spawns", []):
        cx = int(spawn["centerx"])
        cy = int(spawn["centery"])
        cz = int(spawn["centerz"])

        for monster in spawn.get("monsters", []):
            name = str(monster.get("name", "")).strip()
            if not name:
                continue

            key = name.lower()
            if f"{key}.gif" not in gif_names:
                continue

            world_x = cx + int(monster.get("x", 0))
            world_y = cy + int(monster.get("y", 0))
            world_z = cz

            if not (x_min <= world_x < x_max):
                continue
            if not (y_min <= world_y < y_max):
                continue
            if not (z_min <= world_z <= z_max):
                continue

            display_name.setdefault(key, name)
            points[key].add((world_x, world_y, world_z))

    keys = sorted(k for k in display_name if points[k])
    return {
        "creatures": [display_name[k] for k in keys],
        "spawns": {k: [list(p) for p in sorted(points[k])] for k in keys},
    }


def main() -> int:
    root = Path(__file__).resolve().parent.parent

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--spawn-repo",
        type=Path,
        default=root.parent / "tibia-map-spawn",
        help="Path to a local tibia-map-spawn checkout (default: ../tibia-map-spawn)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=root / "map-data" / "tibia-map" / "creature-spawns.json",
        help="Output JSON path",
    )
    args = parser.parse_args()

    spawn_json = args.spawn_repo / "data" / "map-spawn-v2.json"
    bounds_json = root / "map-data" / "tibia-map" / "bounds.json"
    gif_dir = root / "images" / "monster_images"

    if not spawn_json.is_file():
        print(f"Missing spawn data: {spawn_json}", file=sys.stderr)
        return 1
    if not bounds_json.is_file():
        print(f"Missing bounds: {bounds_json}", file=sys.stderr)
        return 1
    if not gif_dir.is_dir():
        print(f"Missing GIF directory: {gif_dir}", file=sys.stderr)
        return 1

    index = build_index(
        load_json(spawn_json),
        load_json(bounds_json),
        {p.name for p in gif_dir.iterdir() if p.suffix.lower() == ".gif"},
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"), ensure_ascii=False)
        f.write("\n")

    print(
        f"Wrote {args.output} "
        f"({len(index['creatures'])} creatures, "
        f"{sum(len(v) for v in index['spawns'].values())} points)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
