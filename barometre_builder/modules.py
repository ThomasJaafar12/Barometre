from __future__ import annotations

from collections import defaultdict
from typing import Any

from .config import DATA_DIR, EXPERIENCE_REGION_CODES, MP4_DIR
from .utils import (
    build_slug_index,
    compact_number,
    load_csv,
    normalize_code,
    normalize_department_code,
    parse_number,
    relative_asset,
    slugify,
)


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
    aggregate_key = "population-entiere"
    sector_labels = sorted({row["Secteur NA28i"] for row in filtered_rows})
    sector_ids = build_slug_index(sector_labels)
    labels_by_key = {aggregate_key: "Population entière", **{sector_id: label for label, sector_id in sector_ids.items()}}
    region_accumulator: dict[str, dict[str, dict[str, dict[str, float]]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(lambda: {"effectifs_cvs": 0.0, "masse_cvs": 0.0}))
    )
    national_accumulator: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: {"effectifs_cvs": 0.0, "masse_cvs": 0.0})
    )

    def accumulate(bucket: dict[str, dict[str, dict[str, float]]], series_key: str, date: str, effectifs: float, masse: float) -> None:
        bucket[series_key][date]["effectifs_cvs"] += effectifs
        bucket[series_key][date]["masse_cvs"] += masse

    for row in filtered_rows:
        code = normalize_code(row["Code région"])
        date = row["Dernier jour du trimestre"]
        sector_id = sector_ids[row["Secteur NA28i"]]
        effectifs = float(parse_number(row["Effectifs salariés (CVS)"]) or 0)
        masse = float(parse_number(row["Masse salariale (CVS)"]) or 0)
        accumulate(region_accumulator[code], aggregate_key, date, effectifs, masse)
        accumulate(region_accumulator[code], sector_id, date, effectifs, masse)
        accumulate(national_accumulator, aggregate_key, date, effectifs, masse)
        accumulate(national_accumulator, sector_id, date, effectifs, masse)

    def build_series(points_by_date: dict[str, dict[str, float]]) -> list[dict[str, Any]]:
        ordered_dates = sorted(points_by_date)
        points: list[dict[str, Any]] = []
        previous_quarter: dict[str, float] | None = None

        for date in ordered_dates:
            values = points_by_date[date]
            previous_year = points_by_date.get(f"{int(date[:4]) - 1}{date[4:]}")
            effectifs = values["effectifs_cvs"]
            masse = values["masse_cvs"]
            effectifs_yoy = ((effectifs / previous_year["effectifs_cvs"]) - 1) * 100 if previous_year and previous_year["effectifs_cvs"] else None
            masse_yoy = ((masse / previous_year["masse_cvs"]) - 1) * 100 if previous_year and previous_year["masse_cvs"] else None
            effectifs_qoq = ((effectifs / previous_quarter["effectifs_cvs"]) - 1) * 100 if previous_quarter and previous_quarter["effectifs_cvs"] else None
            masse_qoq = ((masse / previous_quarter["masse_cvs"]) - 1) * 100 if previous_quarter and previous_quarter["masse_cvs"] else None
            points.append(
                {
                    "date": date,
                    "effectifs_cvs": compact_number(effectifs),
                    "masse_cvs": compact_number(masse),
                    "effectifs_yoy": compact_number(effectifs_yoy),
                    "masse_yoy": compact_number(masse_yoy),
                    "effectifs_qoq": compact_number(effectifs_qoq),
                    "masse_qoq": compact_number(masse_qoq),
                }
            )
            previous_quarter = values
        return points

    def build_scope(series_map: dict[str, dict[str, dict[str, float]]]) -> dict[str, Any]:
        series_payload: dict[str, Any] = {}
        option_rows: list[dict[str, Any]] = []
        latest_scope_date = None

        for series_key, points_by_date in series_map.items():
            points = build_series(points_by_date)
            if not points:
                continue
            latest_point = points[-1]
            latest_scope_date = max(latest_scope_date, latest_point["date"]) if latest_scope_date else latest_point["date"]
            series_payload[series_key] = {
                "label": labels_by_key.get(series_key, series_key),
                "points": points,
            }
            option_rows.append(
                {
                    "key": series_key,
                    "label": labels_by_key.get(series_key, series_key),
                    "latestEffectifs": latest_point["effectifs_cvs"] or 0,
                }
            )

        ordered_options = []
        if aggregate_key in series_payload:
            ordered_options.append({"key": aggregate_key, "label": labels_by_key[aggregate_key]})
        ordered_options.extend(
            {"key": item["key"], "label": item["label"]}
            for item in sorted(
                (item for item in option_rows if item["key"] != aggregate_key),
                key=lambda item: (-float(item["latestEffectifs"] or 0), item["label"]),
            )
        )
        default_series_key = ordered_options[0]["key"] if ordered_options else None
        return {
            "latestDate": latest_scope_date,
            "defaultSeriesKey": default_series_key,
            "seriesOptions": ordered_options,
            "series": series_payload,
        }

    region_payload: dict[str, Any] = {}
    hero_regions: dict[str, Any] = {}
    for code in EXPERIENCE_REGION_CODES:
        scope = build_scope(region_accumulator.get(code, {}))
        aggregate_series = scope["series"].get(aggregate_key, {})
        latest_point = (aggregate_series.get("points") or [None])[-1]
        region_payload[code] = scope
        hero_regions[code] = {
            "date": latest_point["date"] if latest_point else None,
            "value": latest_point["effectifs_cvs"] if latest_point else None,
        }

    national_scope = build_scope(national_accumulator)
    national_latest = (national_scope["series"].get(aggregate_key, {}).get("points") or [None])[-1]

    return (
        {
            "displayStartDate": "2014-01-01",
            "metrics": [
                {"key": "effectifs_cvs", "label": "Effectifs", "format": "count"},
                {"key": "masse_cvs", "label": "Masse salariale", "format": "currency"},
            ],
            "regions": region_payload,
            "national": national_scope,
        },
        {
            "regions": hero_regions,
            "national": {
                "date": national_latest["date"] if national_latest else latest_date,
                "value": national_latest["effectifs_cvs"] if national_latest else None,
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


def build_modules(region_meta: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
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
    modules = {"sector": sector_module, "payroll": payroll_module, "auto": auto_module, "rar": rar_module}
    hero = {
        "regions": build_region_records(region_meta, video_manifest, hero_payroll, hero_headcount, hero_auto, hero_rar),
        "national": {
            "payroll": hero_payroll["national"],
            "headcount": hero_headcount["national"],
            "auto": hero_auto["national"],
            "risk": hero_rar["national"],
        },
    }
    return {"videos": video_manifest, "modules": modules}, hero
