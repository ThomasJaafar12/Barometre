from __future__ import annotations

import json
import urllib.request
from typing import Any

from .config import DEPARTMENT_GEOJSON_CACHE, GEO_METADATA_PATH
from .utils import load_json


def fetch_json(url: str, path) -> Any:
    with urllib.request.urlopen(url, timeout=60) as response:
        payload = response.read()
    path.write_bytes(payload)
    return json.loads(payload.decode("utf-8"))


def read_department_geojson_url() -> str:
    metadata = load_json(GEO_METADATA_PATH)
    candidates: list[tuple[int, str]] = []
    for resource in metadata.get("resources", []):
        title = str(resource.get("title") or resource.get("name") or "").lower()
        url = str(resource.get("url") or "")
        if not url:
            continue
        score = 0
        if "departements" in title or "departements" in url.lower():
            score += 1
        if "50m" in title or "50m" in url.lower():
            score += 1
        if url.lower().endswith("departements-50m.geojson"):
            score += 2
        if "geojson" in title or url.lower().endswith(".geojson"):
            score += 1
        if score:
            candidates.append((score, url))
    if not candidates:
        raise RuntimeError("Unable to locate departements GeoJSON URL in contours metadata.")
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def ensure_department_geojson() -> dict[str, Any]:
    if DEPARTMENT_GEOJSON_CACHE.exists():
        return load_json(DEPARTMENT_GEOJSON_CACHE)
    url = read_department_geojson_url()
    print(f"Fetching department GeoJSON from {url}")
    return fetch_json(url, DEPARTMENT_GEOJSON_CACHE)
