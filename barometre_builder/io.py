from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
import urllib.request
from urllib.parse import urlsplit
from typing import Any

from .config import DEPARTMENT_GEOJSON_CACHE, GEO_METADATA_PATH
from .utils import load_json


MAX_GEOJSON_BYTES = 25_000_000


def validate_geojson_url(url: str) -> str:
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname != "object.data.gouv.fr"
            or parsed.username or parsed.password or parsed.port not in (None, 443)
            or not parsed.path.startswith("/contours-administratifs/")
            or not parsed.path.endswith("/departements-50m.geojson") or parsed.query or parsed.fragment):
        raise ValueError("L’URL de la géographie départementale n’est pas autorisée.")
    return url


class SafeGeoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_geojson_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_json(url: str, path: Path) -> Any:
    validate_geojson_url(url)
    path = path.resolve()
    if path != DEPARTMENT_GEOJSON_CACHE.resolve():
        raise ValueError("Le fichier de cache géographique n’est pas autorisé.")
    opener = urllib.request.build_opener(SafeGeoRedirect())
    with opener.open(url, timeout=30) as response:
        validate_geojson_url(response.geturl())
        payload = response.read(MAX_GEOJSON_BYTES + 1)
    if len(payload) > MAX_GEOJSON_BYTES:
        raise ValueError("La géographie téléchargée dépasse la taille autorisée.")
    try:
        data = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("La géographie téléchargée n’est pas un fichier JSON valide.") from error
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise ValueError("La géographie téléchargée n’est pas une collection GeoJSON valide.")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(payload)
        os.replace(temporary, path)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
    return data


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
        raise RuntimeError("L’URL de la géographie départementale est absente des métadonnées.")
    candidates.sort(key=lambda item: item[0], reverse=True)
    return validate_geojson_url(candidates[0][1])


def ensure_department_geojson() -> dict[str, Any]:
    if DEPARTMENT_GEOJSON_CACHE.exists():
        return load_json(DEPARTMENT_GEOJSON_CACHE)
    url = read_department_geojson_url()
    print("Téléchargement de la géographie départementale depuis la source officielle.")
    return fetch_json(url, DEPARTMENT_GEOJSON_CACHE)
