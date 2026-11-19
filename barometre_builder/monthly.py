"""Séries des publications mensuelles pour les Chiffres du mois."""
from collections import defaultdict
from datetime import date, datetime
from math import isfinite
from pathlib import Path

from openpyxl import load_workbook

from .config import MONTHLY_DPAE_PATH, MONTHLY_PAYROLL_PATH
from .utils import compact_number, normalize_code


PAYROLL_REGIONS = {
    "01": ("01",), "02": ("02",), "03": ("03",), "04": ("04",),
    "11": ("11",), "24": ("24",), "27": ("26", "43"), "28": ("23", "25"),
    "32": ("22", "31"), "44": ("21", "41", "42"), "52": ("52",), "53": ("53",),
    "75": ("54", "72", "74"), "76": ("73", "91"), "84": ("82", "83"),
    "93": ("93",), "94": ("94",),
}
DPAE_CONTRACTS = ("CDI", "CDD de plus d’un mois")
MONTH_COLUMN = "Dernier jour du mois"


def _workbook_series(path: Path, category_column: str, value_column: str, category_key) -> dict:
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        rows = workbook.active.values
        columns = {name: index for index, name in enumerate(next(rows, ()))}
        required = (MONTH_COLUMN, category_column, value_column)
        missing = [column for column in required if column not in columns]
        if missing:
            raise ValueError(f"{path.name} : colonnes manquantes ({', '.join(missing)}).")
        month_index, category_index, value_index = (columns[name] for name in required)
        series = defaultdict(dict)
        for row_number, row in enumerate(rows, start=2):
            if all(cell is None for cell in row):
                continue
            context = f"{path.name}, ligne {row_number}"
            month = row[month_index]
            if isinstance(month, str):
                try:
                    month = datetime.strptime(month.strip(), "%d/%m/%Y")
                except ValueError as error:
                    raise ValueError(f"{context} : date mensuelle invalide ({month}).") from error
            if not isinstance(month, date):
                raise ValueError(f"{context} : date mensuelle invalide ({month}).")
            month_key = f"{month:%Y-%m}-01"
            category = category_key(row[category_index])
            if not category or category in series[month_key]:
                raise ValueError(f"{context} : catégorie vide ou en doublon ({category}).")
            value = row[value_index]
            if value is not None and (type(value) not in (int, float) or not isfinite(value) or value < 0):
                raise ValueError(f"{context} : valeur invalide dans {value_column} ({value}).")
            series[month_key][category] = value
        if not series:
            raise ValueError(f"{path.name} : aucune observation mensuelle.")
        return series
    finally:
        workbook.close()


def _sum_available(values) -> int | float | None:
    values = tuple(values)
    return compact_number(sum(values)) if all(value is not None for value in values) else None


def _aggregate(series: dict, categories: tuple[str, ...]) -> list[dict]:
    return [
        {"date": month, "value": _sum_available(month_values.get(category) for category in categories)}
        for month, month_values in sorted(series.items())
        if any(category in month_values for category in categories)
    ]


def build_monthly_payroll(path: Path = MONTHLY_PAYROLL_PATH) -> dict:
    series = _workbook_series(path, "Code ancienne region", "Masse salariale (brute)", normalize_code)
    old_regions = tuple(code for codes in PAYROLL_REGIONS.values() for code in codes)
    unknown = {code for observations in series.values() for code in observations} - set(old_regions)
    if unknown:
        raise ValueError(f"{path.name} : codes d’anciennes régions inconnus ({', '.join(sorted(unknown))}).")
    return {
        "national": {"points": _aggregate(series, old_regions)},
        "regions": {code: {"points": _aggregate(series, old_codes)} for code, old_codes in PAYROLL_REGIONS.items()},
    }


def build_monthly_dpae(dpae: dict, path: Path = MONTHLY_DPAE_PATH) -> dict:
    series = _workbook_series(path, "Nature de contrat", "DPAE (cvs)",
                              lambda value: str(value or "").strip().replace("'", "’"))
    missing = set(DPAE_CONTRACTS) - {contract for observations in series.values() for contract in observations}
    if missing:
        raise ValueError(f"{path.name} : contrats manquants ({', '.join(sorted(missing))}).")
    points = _aggregate(series, DPAE_CONTRACTS)
    for point in points:
        contracts = series[point["date"]]
        point.update(cdi=contracts.get(DPAE_CONTRACTS[0]), cddlong=contracts.get(DPAE_CONTRACTS[1]))
    return {
        "national": {
            "points": points,
            "coverageNote": "France entière · Série corrigée des variations saisonnières (CVS).",
        },
        "regions": {
            code: {
                "points": [
                    {"date": point["date"], "value": point["long"], "cdi": point.get("cdi"), "cddlong": point.get("cddlong")}
                    for point in scope["points"]
                ],
                "coverageNote": "Classeur régional Urssaf · Traitement saisonnier non renseigné.",
            }
            for code, scope in dpae["regions"].items()
        },
    }
