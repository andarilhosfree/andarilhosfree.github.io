#!/usr/bin/env python3
"""Generate js/firebase-config.js from environment variables or a local .env file."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
OUTPUT = ROOT / "js" / "firebase-config.js"

REQUIRED = (
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_MESSAGING_SENDER_ID",
    "FIREBASE_APP_ID",
)


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


def get_config() -> dict[str, str]:
    load_dotenv(ENV_FILE)
    missing = [k for k in REQUIRED if not os.environ.get(k, "").strip()]
    if missing:
        print("Missing required FIREBASE_* environment variables.", file=sys.stderr)
        sys.exit(1)
    return {k: os.environ[k].strip() for k in REQUIRED}


def main() -> int:
    config = get_config()

    firebase_config = {
        "apiKey": config["FIREBASE_API_KEY"],
        "authDomain": config["FIREBASE_AUTH_DOMAIN"],
        "projectId": config["FIREBASE_PROJECT_ID"],
        "storageBucket": config["FIREBASE_STORAGE_BUCKET"],
        "messagingSenderId": config["FIREBASE_MESSAGING_SENDER_ID"],
        "appId": config["FIREBASE_APP_ID"],
    }
    measurement_id = os.environ.get("FIREBASE_MEASUREMENT_ID", "").strip()
    if measurement_id:
        firebase_config["measurementId"] = measurement_id

    lines = [
        "window.ANDARILHOS_FIREBASE_CONFIG = " + json.dumps(firebase_config, indent="\t") + ";",
        "",
    ]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
