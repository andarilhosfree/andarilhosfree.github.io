#!/usr/bin/env python3
"""Generate js/imgbb-config.js from environment variables or a local .env file."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
OUTPUT = ROOT / "js" / "imgbb-config.js"


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def main() -> int:
    load_dotenv(ENV_FILE)
    api_key = os.environ.get("IMGBB_API_KEY", "").strip()

    lines = [
        "window.ANDARILHOS_IMGBB_API_KEY = " + json.dumps(api_key) + ";",
        "",
    ]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    if api_key:
        print(f"Wrote {OUTPUT.relative_to(ROOT)}")
    else:
        print(f"Wrote {OUTPUT.relative_to(ROOT)} (empty — uploads disabled)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
