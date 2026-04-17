from __future__ import annotations

import base64
import csv
import gzip
import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Any

from .config import ROOT


def normalize_header(value: str) -> str:
    return value.replace("\ufeff", "").strip()


def normalize_code(value: str | None, width: int = 2) -> str:
    if value is None:
        return ""
    cleaned = str(value).strip().upper()
    if cleaned.isdigit():
        return cleaned.zfill(width if len(cleaned) < width else len(cleaned))
    return cleaned


def normalize_department_code(value: str | None) -> str:
    if value is None:
        return ""
    cleaned = str(value).strip().upper()
    if cleaned.isdigit():
        return cleaned.zfill(2) if len(cleaned) == 1 else cleaned
    return cleaned


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower() or "item"


def build_slug_index(labels: list[str]) -> dict[str, str]:
    counts: dict[str, int] = {}
    mapping: dict[str, str] = {}
    for label in labels:
        base = slugify(label)
        count = counts.get(base, 0) + 1
        counts[base] = count
        mapping[label] = base if count == 1 else f"{base}-{count}"
    return mapping


def parse_number(value: str | None) -> int | float | None:
    if value is None:
        return None
    cleaned = str(value).strip().replace("\xa0", "")
    if not cleaned:
        return None
    cleaned = cleaned.replace(",", ".")
    number = float(cleaned)
    if math.isfinite(number) and number.is_integer():
        return int(number)
    return round(number, 6)


def compact_number(value: int | float | None) -> int | float | None:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, float):
        return round(value, 6)
    return value


def relative_asset(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=";")
        reader.fieldnames = [normalize_header(name) for name in reader.fieldnames or []]
        return [
            {normalize_header(key): (value or "").strip() for key, value in row.items()}
            for row in reader
        ]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def gzip_base64_json(value: Any) -> str:
    payload = dump_json(value).encode("utf-8")
    compressed = gzip.compress(payload, compresslevel=9)
    return base64.b64encode(compressed).decode("ascii")
