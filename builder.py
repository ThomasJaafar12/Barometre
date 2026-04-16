from __future__ import annotations

import csv
import json
import math
import re
import textwrap
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
ASSETS_DIR = ROOT / "Assets"
DATA_DIR = ASSETS_DIR / "Data_source"
GEO_DIR = ASSETS_DIR / "Geo"
MP4_DIR = ASSETS_DIR / "Mp4"
LOGO_PATH = ASSETS_DIR / "logo" / "logo.png"
REGION_GEOJSON_PATH = GEO_DIR / "france_regions_source.geojson"
GEO_METADATA_PATH = GEO_DIR / "contours_administratifs_dataset.json"
DEPARTMENT_GEOJSON_CACHE = GEO_DIR / "departements-50m.geojson"
OUTPUT_HTML_PATH = ROOT / "barometre.html"
TEMPLATE_PATH = ROOT / "barometre.template.html"

MAP_LAYOUT = {
    "width": 1200,
    "height": 860,
    "mainlandExtent": [72, 92, 770, 760],
    "domInsets": {
        "01": {"x": 840, "y": 96, "width": 276, "height": 118},
        "02": {"x": 840, "y": 228, "width": 276, "height": 118},
        "03": {"x": 840, "y": 360, "width": 276, "height": 118},
        "04": {"x": 840, "y": 492, "width": 276, "height": 118},
        "06": {"x": 840, "y": 624, "width": 276, "height": 118},
    },
}

EXPERIENCE_REGION_CODES = [
    "11",
    "24",
    "27",
    "28",
    "32",
    "44",
    "52",
    "53",
    "75",
    "76",
    "84",
    "93",
    "94",
    "01",
    "02",
    "03",
    "04",
    "06",
]
DOM_REGION_CODES = {"01", "02", "03", "04", "06"}

REGION_THEMES = [
    {"accent": "#75f0c6", "accentDeep": "#0f8d74", "secondary": "#8ac3ff", "glow": "#89e5e5"},
    {"accent": "#7bd7ff", "accentDeep": "#1969a6", "secondary": "#75f0c6", "glow": "#9ac8ff"},
    {"accent": "#8db0ff", "accentDeep": "#2455bd", "secondary": "#8ef7d0", "glow": "#8aa8ff"},
    {"accent": "#7af1cb", "accentDeep": "#1b8c76", "secondary": "#ffd38a", "glow": "#9fffe7"},
    {"accent": "#b89dff", "accentDeep": "#6346d9", "secondary": "#7bd7ff", "glow": "#b6b7ff"},
    {"accent": "#ffd28f", "accentDeep": "#bc6b1e", "secondary": "#75f0c6", "glow": "#ffcf80"},
    {"accent": "#9be6ff", "accentDeep": "#1c6f9d", "secondary": "#ffb6b6", "glow": "#9edcff"},
    {"accent": "#ffbe96", "accentDeep": "#c9652a", "secondary": "#8db0ff", "glow": "#ffc6a9"},
    {"accent": "#83f4d8", "accentDeep": "#198a7b", "secondary": "#d1b2ff", "glow": "#87f6ec"},
    {"accent": "#f6b6ff", "accentDeep": "#9d4ea8", "secondary": "#7bd7ff", "glow": "#f2c0ff"},
    {"accent": "#9ec1ff", "accentDeep": "#315ec5", "secondary": "#ffd59f", "glow": "#9cc5ff"},
    {"accent": "#ffe289", "accentDeep": "#bc8b1e", "secondary": "#8cd2ff", "glow": "#ffeaa8"},
    {"accent": "#98f0b6", "accentDeep": "#1d8a55", "secondary": "#8db0ff", "glow": "#a5fccd"},
    {"accent": "#ffb3cc", "accentDeep": "#be567f", "secondary": "#8db0ff", "glow": "#ffbfd0"},
    {"accent": "#83dbff", "accentDeep": "#1b6ea1", "secondary": "#ffe289", "glow": "#9fe4ff"},
    {"accent": "#9effb0", "accentDeep": "#29924d", "secondary": "#ffb9ad", "glow": "#b2ffc0"},
    {"accent": "#ffcf87", "accentDeep": "#bf7227", "secondary": "#8bf7f3", "glow": "#ffd497"},
    {"accent": "#d9d9d9", "accentDeep": "#838383", "secondary": "#b7c8dd", "glow": "#f0f0f0"},
]


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
        if len(cleaned) == 1:
            return cleaned.zfill(2)
        return cleaned
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


def fetch_json(url: str, path: Path) -> Any:
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


def trim_region_geojson() -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    source = load_json(REGION_GEOJSON_PATH)
    features = []
    region_meta: dict[str, dict[str, Any]] = {}
    ordered = sorted(
        [feature for feature in source["features"] if feature["properties"]["code"] in EXPERIENCE_REGION_CODES],
        key=lambda feature: EXPERIENCE_REGION_CODES.index(feature["properties"]["code"]),
    )
    for index, feature in enumerate(ordered):
        code = feature["properties"]["code"]
        name = feature["properties"]["nom"]
        features.append(
            {
                "type": feature["type"],
                "geometry": feature["geometry"],
                "properties": {
                    "code": code,
                    "nom": name,
                    "slug": slugify(name),
                    "group": "dom" if code in DOM_REGION_CODES else "mainland",
                },
            }
        )
        region_meta[code] = {
            "code": code,
            "name": name,
            "slug": slugify(name),
            "group": "dom" if code in DOM_REGION_CODES else "mainland",
            "theme": REGION_THEMES[index],
        }
    return {"type": "FeatureCollection", "features": features}, region_meta


def trim_department_geojson(raw_geojson: dict[str, Any]) -> dict[str, Any]:
    features = []
    for feature in raw_geojson["features"]:
        properties = feature.get("properties", {})
        region_code = normalize_code(properties.get("region"))
        if region_code not in EXPERIENCE_REGION_CODES:
            continue
        features.append(
            {
                "type": feature["type"],
                "geometry": feature["geometry"],
                "properties": {
                    "code": normalize_department_code(properties.get("code")),
                    "nom": properties.get("nom"),
                    "region": region_code,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def build_video_manifest(region_meta: dict[str, dict[str, Any]]) -> dict[str, Any]:
    available_videos = {slugify(path.stem): relative_asset(path) for path in MP4_DIR.glob("*.mp4")}
    placeholder = MP4_DIR / "placeholder.mp4"
    if not placeholder.exists():
        raise RuntimeError("Assets/Mp4/placeholder.mp4 is required.")
    placeholder_rel = relative_asset(placeholder)
    by_region = {}
    for code, region in region_meta.items():
        by_region[code] = available_videos.get(region["slug"], placeholder_rel)
    return {"placeholder": placeholder_rel, "byRegion": by_region}


def build_sector_module(rows: list[dict[str, str]], region_meta: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    filtered_rows = [row for row in rows if normalize_code(row["Code région"]) in region_meta]
    latest_date = max(row["Dernier jour du trimestre"] for row in filtered_rows)
    sector_labels = sorted({row["Secteur NA28i"] for row in filtered_rows})
    sector_ids = build_slug_index(sector_labels)

    region_series_map: dict[str, dict[str, dict[str, Any]]] = defaultdict(lambda: defaultdict(lambda: {"label": "", "points": []}))
    national_accumulator: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: {"effectifs_cvs": 0.0, "masse_cvs": 0.0})
    )
    region_latest: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: {"effectifs_cvs": 0.0, "masse_cvs": 0.0})
    )

    for row in filtered_rows:
        code = normalize_code(row["Code région"])
        date = row["Dernier jour du trimestre"]
        sector_label = row["Secteur NA28i"]
        sector_id = sector_ids[sector_label]
        effectifs = float(parse_number(row["Effectifs salariés (CVS)"]) or 0)
        masse = float(parse_number(row["Masse salariale (CVS)"]) or 0)
        region_series_map[code][sector_id]["label"] = sector_label
        region_series_map[code][sector_id]["points"].append(
            {"date": date, "effectifs_cvs": compact_number(effectifs), "masse_cvs": compact_number(masse)}
        )
        national_accumulator[sector_id][date]["effectifs_cvs"] += effectifs
        national_accumulator[sector_id][date]["masse_cvs"] += masse
        if date == latest_date:
            region_latest[code][sector_id]["effectifs_cvs"] += effectifs
            region_latest[code][sector_id]["masse_cvs"] += masse

    region_payload: dict[str, Any] = {}
    hero_regions: dict[str, Any] = {}
    for code in EXPERIENCE_REGION_CODES:
        series = region_series_map.get(code, {})
        latest_rows = [
            {
                "key": sector_id,
                "label": series.get(sector_id, {}).get("label") or sector_id,
                "effectifs_cvs": compact_number(values["effectifs_cvs"]),
                "masse_cvs": compact_number(values["masse_cvs"]),
            }
            for sector_id, values in region_latest.get(code, {}).items()
        ]
        latest_rows.sort(key=lambda item: item["effectifs_cvs"] or 0, reverse=True)
        region_payload[code] = {
            "latestDate": latest_date,
            "defaultSector": latest_rows[0]["key"] if latest_rows else None,
            "latest": latest_rows,
            "series": {
                sector_id: {"label": data["label"], "points": sorted(data["points"], key=lambda point: point["date"])}
                for sector_id, data in series.items()
            },
        }
        hero_regions[code] = {
            "date": latest_date if latest_rows else None,
            "value": compact_number(sum(float(item["effectifs_cvs"] or 0) for item in latest_rows)) if latest_rows else None,
        }

    national_series: dict[str, Any] = {}
    national_latest_rows = []
    for sector_id, points_by_date in national_accumulator.items():
        label = next(label for label, slug in sector_ids.items() if slug == sector_id)
        points = []
        latest_effectifs = 0.0
        latest_masse = 0.0
        for date, values in sorted(points_by_date.items()):
            points.append(
                {"date": date, "effectifs_cvs": compact_number(values["effectifs_cvs"]), "masse_cvs": compact_number(values["masse_cvs"])}
            )
            if date == latest_date:
                latest_effectifs += values["effectifs_cvs"]
                latest_masse += values["masse_cvs"]
        national_series[sector_id] = {"label": label, "points": points}
        national_latest_rows.append(
            {
                "key": sector_id,
                "label": label,
                "effectifs_cvs": compact_number(latest_effectifs),
                "masse_cvs": compact_number(latest_masse),
            }
        )
    national_latest_rows.sort(key=lambda item: item["effectifs_cvs"] or 0, reverse=True)

    return (
        {
            "metrics": [
                {"key": "effectifs_cvs", "label": "Effectifs CVS", "format": "count"},
                {"key": "masse_cvs", "label": "Masse salariale CVS", "format": "currency"},
            ],
            "regions": region_payload,
            "national": {
                "latestDate": latest_date,
                "defaultSector": national_latest_rows[0]["key"] if national_latest_rows else None,
                "latest": national_latest_rows,
                "series": national_series,
            },
        },
        {
            "regions": hero_regions,
            "national": {
                "date": latest_date,
                "value": compact_number(sum(float(item["effectifs_cvs"] or 0) for item in national_latest_rows)),
            },
        },
    )


def build_payroll_module(rows: list[dict[str, str]], region_meta: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    filtered_rows = [row for row in rows if normalize_code(row["Code région"]) in region_meta]
    latest_date = max(row["Dernier jour du mois"] for row in filtered_rows)
    region_series: dict[str, list[dict[str, Any]]] = defaultdict(list)
    national_accumulator: dict[str, dict[str, float]] = defaultdict(lambda: {"payroll": 0.0, "assiette": 0.0})
    latest_regions: dict[str, Any] = {}

    for row in filtered_rows:
        code = normalize_code(row["Code région"])
        date = row["Dernier jour du mois"]
        payroll = float(parse_number(row["Masse salariale (brute)"]) or 0)
        assiette = float(parse_number(row["Assiette chômage partiel"]) or 0)
        point = {
            "date": date,
            "payroll": compact_number(payroll),
            "assiette": compact_number(assiette),
            "share": compact_number(parse_number(row["Part de l'assiette chômage partiel"])),
            "yearlyChange": compact_number(parse_number(row["Glissement annuel - Masse salariale"])),
        }
        region_series[code].append(point)
        national_accumulator[date]["payroll"] += payroll
        national_accumulator[date]["assiette"] += assiette
        if date == latest_date:
            latest_regions[code] = point

    national_points = []
    for date in sorted(national_accumulator):
        current = national_accumulator[date]
        previous = national_accumulator.get(f"{int(date[:4]) - 1}{date[4:]}")
        yearly_change = None
        if previous and previous["payroll"]:
            yearly_change = ((current["payroll"] / previous["payroll"]) - 1) * 100
        national_points.append(
            {
                "date": date,
                "payroll": compact_number(current["payroll"]),
                "assiette": compact_number(current["assiette"]),
                "share": compact_number((current["assiette"] / current["payroll"]) * 100 if current["payroll"] else None),
                "yearlyChange": compact_number(yearly_change),
            }
        )

    national_latest = next(point for point in national_points if point["date"] == latest_date)
    return (
        {
            "regions": {code: {"latestDate": latest_date, "points": sorted(points, key=lambda point: point["date"])} for code, points in region_series.items()},
            "national": {"latestDate": latest_date, "points": national_points},
        },
        {
            "regions": {code: {"date": point["date"], "value": point["payroll"], "yearlyChange": point["yearlyChange"]} for code, point in latest_regions.items()},
            "national": {"date": latest_date, "value": national_latest["payroll"], "yearlyChange": national_latest["yearlyChange"]},
        },
    )


def build_auto_module(rows: list[dict[str, str]], region_meta: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    filtered_rows = [
        row
        for row in rows
        if row["Région"] != "_non classé ailleurs_" and normalize_code(row["Code région"]) in region_meta
    ]
    latest_date = max(row["Dernier jour du trimestre"] for row in filtered_rows)
    latest_rows = [row for row in filtered_rows if row["Dernier jour du trimestre"] == latest_date]
    sector_labels = sorted({row["Secteur d'activité"] for row in latest_rows})
    sector_ids = build_slug_index(sector_labels)
    sector_totals: dict[str, float] = defaultdict(float)
    departments: dict[str, dict[str, Any]] = {}
    region_departments: dict[str, set[str]] = defaultdict(set)
    hero_regions: dict[str, float] = defaultdict(float)
    hero_national = 0.0

    for row in latest_rows:
        region_code = normalize_code(row["Code région"])
        department_code = normalize_department_code(row["Code Département"])
        sector_id = sector_ids[row["Secteur d'activité"]]
        turnover = float(parse_number(row["Chiffres d'affaires"]) or 0)
        economic = float(parse_number(row["Economiquement actifs"]) or 0)
        admin = float(parse_number(row["Administrativement actifs"]) or 0)
        entry = departments.setdefault(
            department_code,
            {"code": department_code, "name": row["Département"], "regionCode": region_code, "values": {}},
        )
        entry["values"][sector_id] = {
            "turnover": compact_number(turnover),
            "economically_active": compact_number(economic),
            "administratively_active": compact_number(admin),
        }
        region_departments[region_code].add(department_code)
        sector_totals[sector_id] += economic
        hero_regions[region_code] += economic
        hero_national += economic

    ordered_sectors = [
        {"key": sector_id, "label": label}
        for label, sector_id in sorted(sector_ids.items(), key=lambda item: sector_totals[item[1]], reverse=True)
    ]
    return (
        {
            "latestDate": latest_date,
            "metrics": [
                {"key": "economically_active", "label": "Éco actifs", "format": "count"},
                {"key": "administratively_active", "label": "Administratifs", "format": "count"},
                {"key": "turnover", "label": "Chiffres d'affaires", "format": "currency"},
            ],
            "sectors": ordered_sectors,
            "defaultSector": ordered_sectors[0]["key"] if ordered_sectors else None,
            "departments": [departments[key] for key in sorted(departments)],
            "regions": {code: {"departmentCodes": sorted(values)} for code, values in region_departments.items()},
        },
        {
            "regions": {
                code: {"date": latest_date, "value": compact_number(hero_regions.get(code)) if hero_regions.get(code) is not None else None}
                for code in EXPERIENCE_REGION_CODES
            },
            "national": {"date": latest_date, "value": compact_number(hero_national)},
        },
    )


def build_rar_module(rows: list[dict[str, str]], region_meta: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    filtered_rows = [row for row in rows if normalize_code(row["Code région"]) in region_meta]
    latest_date = max(row["Dernier jour du mois"] for row in filtered_rows)
    column_map = {
        "rar_fin_mois": "Taux d'impayés fin de mois (%)",
        "rar_mois_suivant": "Taux d'impayés fin de mois suivant (%)",
        "rar_90": "Taux d'impayés à échéance + 90 jours (%)",
        "quarterly_fin_mois": "Glissement trimestriel - Tx imp. fin de mois",
        "quarterly_mois_suivant": "Glissement trimestriel - Tx imp. fin de mois suivant",
        "quarterly_90": "Glissement trimestriel - Tx imp. à 90 jours",
        "yearly_fin_mois": "Glissement annuel - Tx imp. fin de mois",
        "yearly_mois_suivant": "Glissement annuel - Tx imp. fin de mois suivant",
        "yearly_90": "Glissement annuel - Tx imp. à 90 jours",
    }
    series: dict[str, list[dict[str, Any]]] = defaultdict(list)
    latest_valid_by_region: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for row in filtered_rows:
        code = normalize_code(row["Code région"])
        point = {"date": row["Dernier jour du mois"]}
        for key, column in column_map.items():
            point[key] = compact_number(parse_number(row[column]))
        series[code].append(point)

    for points in series.values():
        points.sort(key=lambda point: point["date"])

    metric_to_yearly = {
        "rar_fin_mois": "yearly_fin_mois",
        "rar_mois_suivant": "yearly_mois_suivant",
        "rar_90": "yearly_90",
    }
    for code, points in series.items():
        for metric in ["rar_fin_mois", "rar_mois_suivant", "rar_90"]:
            latest_valid = next((point for point in reversed(points) if point[metric] is not None), None)
            if latest_valid:
                latest_valid_by_region[code][metric] = {
                    "date": latest_valid["date"],
                    "value": latest_valid[metric],
                    "yearlyChange": latest_valid[metric_to_yearly[metric]],
                }

    latest_by_metric = {}
    for metric in ["rar_fin_mois", "rar_mois_suivant", "rar_90"]:
        entries = []
        for code, data in latest_valid_by_region.items():
            latest_valid = data.get(metric)
            if not latest_valid:
                continue
            entries.append(
                {
                    "code": code,
                    "name": region_meta[code]["name"],
                    "value": latest_valid["value"],
                    "yearlyChange": latest_valid["yearlyChange"],
                    "date": latest_valid["date"],
                }
            )
        entries.sort(key=lambda entry: entry["value"] if entry["value"] is not None else -1, reverse=True)
        latest_by_metric[metric] = entries

    highest_risk = latest_by_metric["rar_90"][0] if latest_by_metric["rar_90"] else None
    return (
        {
            "latestDate": latest_date,
            "metrics": [
                {"key": "rar_fin_mois", "label": "Fin de mois", "format": "percent"},
                {"key": "rar_mois_suivant", "label": "Mois suivant", "format": "percent"},
                {"key": "rar_90", "label": "+90 jours", "format": "percent"},
            ],
            "regions": {code: {"points": points} for code, points in series.items()},
            "national": {"latestByMetric": latest_by_metric},
        },
        {
            "regions": {
                code: {
                    "date": data["rar_90"]["date"] if data.get("rar_90") else None,
                    "value": data["rar_90"]["value"] if data.get("rar_90") else None,
                }
                for code, data in latest_valid_by_region.items()
            },
            "national": {
                "date": highest_risk["date"] if highest_risk else latest_date,
                "regionCode": highest_risk["code"] if highest_risk else None,
                "region": highest_risk["name"] if highest_risk else None,
                "value": highest_risk["value"] if highest_risk else None,
            },
        },
    )


def build_region_records(
    region_meta: dict[str, dict[str, Any]],
    video_manifest: dict[str, Any],
    hero_payroll: dict[str, Any],
    hero_headcount: dict[str, Any],
    hero_auto: dict[str, Any],
    hero_rar: dict[str, Any],
) -> list[dict[str, Any]]:
    records = []
    for code in EXPERIENCE_REGION_CODES:
        region = region_meta[code]
        records.append(
            {
                "code": code,
                "name": region["name"],
                "slug": region["slug"],
                "group": region["group"],
                "hasData": code != "06",
                "hasVideo": video_manifest["byRegion"][code] != video_manifest["placeholder"],
                "theme": region["theme"],
                "video": video_manifest["byRegion"][code],
                "hero": {
                    "payroll": hero_payroll["regions"].get(code),
                    "headcount": hero_headcount["regions"].get(code),
                    "auto": hero_auto["regions"].get(code),
                    "rar90": hero_rar["regions"].get(code),
                },
            }
        )
    return records


def build_payload() -> dict[str, Any]:
    regions_geojson, region_meta = trim_region_geojson()
    departments_geojson = trim_department_geojson(ensure_department_geojson())
    video_manifest = build_video_manifest(region_meta)
    sector_module, hero_headcount = build_sector_module(
        load_csv(DATA_DIR / "effectifs-salaries-et-masse-salariale-du-secteur-prive-par-region-x-na38.csv"),
        region_meta,
    )
    payroll_module, hero_payroll = build_payroll_module(
        load_csv(DATA_DIR / "masse-salariale-et-assiette-chomage-partiel-mensuelles-secteur-prive-par-region.csv"),
        region_meta,
    )
    auto_module, hero_auto = build_auto_module(
        load_csv(DATA_DIR / "auto-entrepreneurs-par-departement-secteur.csv"),
        region_meta,
    )
    rar_module, hero_rar = build_rar_module(
        load_csv(DATA_DIR / "taux-rar-horsto-mensuels-entreprises-de-10-salaries-ou-plus-par-region.csv"),
        region_meta,
    )

    return {
        "meta": {
            "generatedAt": datetime.now(UTC).isoformat(),
            "mapLayout": MAP_LAYOUT,
            "experienceRegionCodes": EXPERIENCE_REGION_CODES,
            "domRegionCodes": sorted(DOM_REGION_CODES),
        },
        "assets": {"logo": relative_asset(LOGO_PATH), "videos": video_manifest},
        "regions": build_region_records(region_meta, video_manifest, hero_payroll, hero_headcount, hero_auto, hero_rar),
        "nationalHero": {
            "payroll": hero_payroll["national"],
            "headcount": hero_headcount["national"],
            "auto": hero_auto["national"],
            "risk": hero_rar["national"],
        },
        "geography": {"regions": regions_geojson, "departments": departments_geojson},
        "modules": {"sector": sector_module, "payroll": payroll_module, "auto": auto_module, "rar": rar_module},
    }


def render_html(payload: dict[str, Any]) -> str:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    data_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    html = template.replace("__DATA_JSON__", data_json)
    html = html.replace("__LOGO_PATH__", payload["assets"]["logo"])
    return textwrap.dedent(html)


def main() -> None:
    if not TEMPLATE_PATH.exists():
        raise RuntimeError("barometre.template.html is missing.")
    payload = build_payload()
    OUTPUT_HTML_PATH.write_text(render_html(payload), encoding="utf-8")
    print(f"Wrote {OUTPUT_HTML_PATH.name}")


if __name__ == "__main__":
    main()
