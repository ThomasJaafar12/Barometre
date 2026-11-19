"""Séries mensuelles CVS de taux de reste à recouvrer."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from math import isfinite
from pathlib import Path
from zipfile import BadZipFile

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from .cache import cached_json, source_fingerprint
from .config import TRAR_EXCEL_PATHS, TRAR_NACE88_LABELS_PATH
from .utils import build_slug_index, compact_number, load_csv, normalize_code, slugify


TRAR_ALL_SECTORS = "tous-secteurs"
TRAR_DISPLAY_START = "2014-01-01"
RATE_COLUMNS = ("TRAR_CVS", "TRAR30J_CVS", "TRAR90J_CVS")
TRAR_90_DAY_INDEX = RATE_COLUMNS.index("TRAR90J_CVS")
AGGREGATE_GEOGRAPHIES = {"france-entiere", "metropole"}
Rates = list[int | float | None]
WorkbookSeries = dict[str, dict[str, dict[str, Rates]]]


def _geography_index(names: dict[str, str]) -> dict[str, str]:
    index = {slugify(name): code for code, name in names.items()}
    if "la-reunion" in index:
        index["reunion"] = index["la-reunion"]
    return index


def _read_series(
    path: Path, sector_column: str, geography_column: str | None, geography_index: dict[str, str],
) -> WorkbookSeries:
    try:
        workbook = load_workbook(path, read_only=True, data_only=True)
    except (BadZipFile, InvalidFileException) as error:
        raise ValueError(f"{path.name} : classeur Excel illisible.") from error
    try:
        sheet = workbook[path.stem] if path.stem in workbook.sheetnames else workbook.active
        rows = sheet.values
        columns = {name: index for index, name in enumerate(next(rows, ()))}
        required = ["DATE", sector_column, *RATE_COLUMNS]
        if geography_column is not None:
            required.append(geography_column)
        missing = [column for column in required if column not in columns]
        if missing:
            raise ValueError(f"{path.name} : colonnes manquantes ({', '.join(missing)}).")
        date_index = columns["DATE"]
        sector_index = columns[sector_column]
        geography_column_index = columns[geography_column] if geography_column is not None else None
        rate_indices = [columns[column] for column in RATE_COLUMNS]
        series: WorkbookSeries = defaultdict(lambda: defaultdict(dict))
        for row_number, row in enumerate(rows, start=2):
            if all(cell is None for cell in row):
                continue
            context = f"{path.name}, ligne {row_number}"
            geography = "national"
            if geography_column_index is not None:
                name = row[geography_column_index]
                key = slugify(str(name))
                if key in AGGREGATE_GEOGRAPHIES:
                    continue
                if key not in geography_index:
                    raise ValueError(f"{context} : territoire inconnu ({name}).")
                geography = geography_index[key]

            month = row[date_index]
            if not isinstance(month, date):
                raise ValueError(f"{context} : date mensuelle invalide ({month}).")
            month_key = f"{month:%Y-%m}-01"
            raw_sector = row[sector_index]
            if raw_sector is None or not str(raw_sector).strip():
                raise ValueError(f"{context} : secteur manquant.")
            sector = str(raw_sector).strip()
            if slugify(sector) == TRAR_ALL_SECTORS:
                sector = TRAR_ALL_SECTORS
            elif sector_column == "nace88":
                sector = normalize_code(sector)
                if len(sector) != 2 or not sector.isascii() or not sector.isdigit():
                    raise ValueError(f"{context} : code NACE88 invalide ({raw_sector}).")

            observations = series[geography][sector]
            if month_key in observations:
                raise ValueError(f"{context} : doublon pour {geography}, {sector}, {month_key}.")
            rates: Rates = []
            for index, column in zip(rate_indices, RATE_COLUMNS):
                value = row[index]
                if value is None:
                    rates.append(None)
                    continue
                if type(value) not in (int, float) or not isfinite(value):
                    raise ValueError(f"{context} : taux invalide dans {column} ({value}).")
                rates.append(value * 100)
            observations[month_key] = rates
        if not series:
            raise ValueError(f"{path.name} : aucune série territoriale.")
        return series
    finally:
        workbook.close()


def _sector_options(series: WorkbookSeries, division_labels: dict[str, str]) -> tuple[dict[str, str], list[dict[str, str]]]:
    labels = sorted({sector for scope in series.values() for sector in scope}, key=lambda label: (slugify(label), label))
    if TRAR_ALL_SECTORS in labels:
        labels.remove(TRAR_ALL_SECTORS)
        labels.insert(0, TRAR_ALL_SECTORS)
    keys = build_slug_index(labels)
    options = []
    for label in labels:
        name = label
        if label == TRAR_ALL_SECTORS:
            name = "Tous secteurs"
        elif label in division_labels:
            name = f"{label} · {division_labels[label]}"
        options.append({"key": keys[label], "label": name})
    return keys, options


def _compact_rate(rate: int | float | None) -> int | float | None:
    # Les petits taux conservent leur signe et restent distincts de zéro.
    return compact_number(rate if rate is None or abs(rate) < 0.01 else round(rate, 3))


def _earlier_month(month: str, count: int) -> str:
    year, calendar_month = map(int, month.split("-")[:2])
    target_year, target_month = divmod(year * 12 + calendar_month - 1 - count, 12)
    return f"{target_year:04}-{target_month + 1:02}-01"


def _change(rate: int | float, observations: dict[str, Rates], month: str, horizon: int) -> float | None:
    earlier = observations.get(month)
    if earlier is None or earlier[horizon] is None:
        return None
    return round(rate - earlier[horizon], 2) or 0


def _dashboard(scope: dict[str, dict[str, Rates]], labels: dict[str, str]) -> dict:
    changes = {key: [] for key in scope}
    rankings = []
    for horizon in range(len(RATE_COLUMNS)):
        latest = {
            key: max((month for month, rates in observations.items()
                      if month >= TRAR_DISPLAY_START and rates[horizon] is not None), default=None)
            for key, observations in scope.items()
        }
        for key, month in latest.items():
            if month is None:
                changes[key].append([None, None])
                continue
            observations = scope[key]
            rate = observations[month][horizon]
            changes[key].append([
                _change(rate, observations, _earlier_month(month, offset), horizon) for offset in (12, 1)
            ])

        date = max((month for key, month in latest.items()
                    if key != TRAR_ALL_SECTORS and month is not None), default=None)
        if date is None:
            rankings.append({"date": None, "rows": []})
            continue
        candidates = []
        for key, observations in scope.items():
            rates = observations.get(date)
            if key != TRAR_ALL_SECTORS and rates is not None and rates[horizon] is not None:
                candidates.append((key, rates[horizon]))
        candidates.sort(key=lambda candidate: (-candidate[1], slugify(labels[candidate[0]]), labels[candidate[0]]))
        previous_year = _earlier_month(date, 12)
        rankings.append({"date": date, "rows": [
            [key, _compact_rate(rate), _change(rate, scope[key], previous_year, horizon)]
            for key, rate in candidates[:5]
        ]})
    return {"changes": changes, "rankings": rankings}


def _prepare_trar(paths: dict[str, Path], regions: dict[str, str], departments: dict[str, str]) -> dict:
    data = {
        "national": _read_series(paths["national"], "nace88", None, {}),
        "regional": _read_series(paths["regional"], "nace28", "nv_region", regions),
        "departmental": _read_series(paths["departmental"], "nace5", "dept", departments),
    }
    # Nomenclature NAF rév. 2, niveau divisions (Insee).
    # https://www.insee.fr/fr/information/2120875
    division_labels = {row["Code"]: row["Libellé"] for row in load_csv(TRAR_NACE88_LABELS_PATH)}
    dates = sorted({month for series in data.values()
                    for scope in series.values() for observations in scope.values()
                    for month in observations})
    sectors: dict[str, list[dict[str, str]]] = {}
    aligned: dict[str, dict[str, dict[str, list[Rates]]]] = {}
    dashboards = {}
    empty_rates = [None] * len(RATE_COLUMNS)
    for level, series in data.items():
        keys, sectors[level] = _sector_options(series, division_labels if level == "national" else {})
        keyed_series = {code: {keys[sector]: observations for sector, observations in scope.items()}
                        for code, scope in series.items()}
        aligned[level] = {
            code: {
                key: [[_compact_rate(rate) for rate in observations.get(month, empty_rates)] for month in dates]
                for key, observations in scope.items()
            }
            for code, scope in keyed_series.items()
        }
        if level != "departmental":
            labels = {option["key"]: option["label"] for option in sectors[level]}
            dashboards[level] = {code: _dashboard(scope, labels) for code, scope in keyed_series.items()}

    department_series = aligned["departmental"]
    department_snapshots = {}
    for option in sectors["departmental"]:
        key = option["key"]
        rows = [scope[key] for scope in department_series.values() if key in scope]
        department_snapshots[key] = [
            next((index for index in range(len(dates) - 1, -1, -1)
                  if any(points[index][horizon] is not None for points in rows)), None)
            for horizon in range(len(RATE_COLUMNS))
        ]
    return {
        "dates": dates,
        "displayStartDate": TRAR_DISPLAY_START,
        "sectors": sectors,
        "national": aligned["national"]["national"],
        "regions": aligned["regional"],
        "departments": department_series,
        "departmentSnapshots": department_snapshots,
        "dashboards": {"national": dashboards["national"]["national"], "regions": dashboards["regional"]},
    }


def build_trar_module(
    region_meta: dict[str, dict], department_names: dict[str, str],
    paths: dict[str, Path] = TRAR_EXCEL_PATHS, *, cache_path: Path | None = None,
) -> dict:
    regions = _geography_index({code: region["name"] for code, region in region_meta.items()})
    departments = _geography_index(department_names)
    if cache_path is None:
        return _prepare_trar(paths, regions, departments)
    code_dir = Path(__file__).resolve().parent
    fingerprint = source_fingerprint(
        [*paths.values(), TRAR_NACE88_LABELS_PATH,
         *(code_dir / name for name in ("trar.py", "utils.py", "config.py", "cache.py"))],
        {"regions": regions, "departments": departments},
    )
    return cached_json(
        cache_path, fingerprint, lambda: _prepare_trar(paths, regions, departments),
        ("dates", "displayStartDate", "sectors", "national", "regions", "departments", "departmentSnapshots", "dashboards"),
    )


def build_trar90_scopes(trar: dict) -> dict:
    def scope(sectors: dict) -> dict:
        rates = sectors.get(TRAR_ALL_SECTORS, ())
        available = [index for index, row in enumerate(rates) if row[TRAR_90_DAY_INDEX] is not None]
        points = [{"date": trar["dates"][index], "value": rates[index][TRAR_90_DAY_INDEX]}
                  for index in range(available[0], available[-1] + 1)] if available else []
        return {"points": points}

    return {"national": scope(trar["national"]),
            "regions": {code: scope(sectors) for code, sectors in trar["regions"].items()}}


def project_trar90(trar: dict) -> dict:
    """Isoler l’échéance à 90 jours pour les ventilations des Chiffres du mois."""
    def scope(sectors: dict) -> dict:
        return {key: [row[TRAR_90_DAY_INDEX] for row in rates] for key, rates in sectors.items()}

    def dashboard(source: dict) -> dict:
        if not source:
            return {}
        return {
            "changes": {key: values[TRAR_90_DAY_INDEX] for key, values in source["changes"].items()},
            "rankings": source["rankings"][TRAR_90_DAY_INDEX],
        }

    dashboards = trar.get("dashboards", {})
    return {
        "horizon": "j90",
        "displayStartDate": trar.get("displayStartDate", TRAR_DISPLAY_START),
        "dates": trar.get("dates", []), "sectors": trar.get("sectors", {}),
        "national": scope(trar.get("national", {})),
        "regions": {code: scope(sectors) for code, sectors in trar.get("regions", {}).items()},
        "departments": {code: scope(sectors) for code, sectors in trar.get("departments", {}).items()},
        "departmentSnapshots": {key: indexes[TRAR_90_DAY_INDEX] for key, indexes in trar.get("departmentSnapshots", {}).items()},
        "dashboards": {
            "national": dashboard(dashboards.get("national", {})),
            "regions": {code: dashboard(values) for code, values in dashboards.get("regions", {}).items()},
        },
    }
