#!/usr/bin/env python3
"""Build Thunderbird XPI and optional self-hosted update manifest."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
ADDON = ROOT / "addon"
DIST = ROOT / "dist"
ADDON_FILES = [
    "manifest.json",
    "background.js",
    "rule-model.js",
    "folder-predictor.js",
    "sogo-client.js",
    "popup.html",
    "popup.js",
    "options.html",
    "options.js",
    "styles.css",
]


def read_manifest() -> dict:
    return json.loads((ADDON / "manifest.json").read_text(encoding="utf-8"))


def addon_id(manifest: dict) -> str:
    return manifest["applications"]["gecko"]["id"]


def build_xpi() -> Path:
    manifest = read_manifest()
    version = manifest["version"]
    out = DIST / f"sogo-rules-assistant-{version}.xpi"
    DIST.mkdir(exist_ok=True)
    with ZipFile(out, "w", ZIP_DEFLATED) as zf:
        for name in ADDON_FILES:
            zf.write(ADDON / name, name)
    return out


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_updates_json(base_url: str, xpi: Path) -> Path:
    manifest = read_manifest()
    base = base_url.rstrip("/")
    data = {
        "addons": {
            addon_id(manifest): {
                "updates": [
                    {
                        "version": manifest["version"],
                        "update_link": f"{base}/{xpi.name}",
                        "update_hash": f"sha256:{sha256(xpi)}",
                    }
                ]
            }
        }
    }
    out = DIST / "updates.json"
    out.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        help="Public HTTPS directory containing the XPI, e.g. https://OWNER.github.io/REPO/releases",
    )
    args = parser.parse_args()
    xpi = build_xpi()
    print(xpi)
    print(f"sha256:{sha256(xpi)}")
    if args.base_url:
        print(write_updates_json(args.base_url, xpi))


if __name__ == "__main__":
    main()
