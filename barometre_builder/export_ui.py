from __future__ import annotations

from pathlib import Path


FRAGMENTS_DIR = Path(__file__).resolve().parent / "template_fragments"


def _fragment(name: str) -> str:
    return (FRAGMENTS_DIR / name).read_text(encoding="utf-8")


def build_export_ui_fragments() -> dict[str, str]:
    return {
        "style": _fragment("dev_palette.css"),
        "html": _fragment("dev_palette.html"),
        "script": _fragment("dev_palette.js"),
    }
