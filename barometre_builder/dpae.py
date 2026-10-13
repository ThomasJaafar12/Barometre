"""Lecture et agrégation mensuelle des déclarations préalables à l’embauche."""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from .cache import cached_json, source_fingerprint
from .config import DPAE_DISPLAY_START_DATE, DPAE_EXCEL_PATH
from .pcol import pcol_region_index
from .utils import compact_number, slugify


DPAE_CONTRACTS = (
    {"id": "all", "key": "value", "label": "Tous contrats"},
    {"id": "cdi", "key": "cdi", "label": "CDI"},
    {"id": "cddlong", "key": "cddlong", "label": "CDD longs"},
    {"id": "cddcourt", "key": "cddcourt", "label": "CDD courts"},
)


def compact_dpae_payload(module: dict) -> dict:
    """Limiter les données embarquées en conservant l’année nécessaire aux glissements."""
    start = module.get("displayStartDate", DPAE_DISPLAY_START_DATE)
    history_start = f"{int(start[:4]) - 1}{start[4:]}"

    def scope(source: dict) -> dict:
        # Le total des contrats longs est reconstitué depuis les deux contrats disponibles.
        return {"points": [{key: value for key, value in point.items() if key != "long"}
                           for point in source["points"] if point["date"] >= history_start]}

    return {**module, "national": scope(module["national"]),
            "regions": {code: scope(source) for code, source in module["regions"].items()}}


def build_dpae_module(region_meta: dict[str, dict[str, Any]], path: Path = DPAE_EXCEL_PATH, *, cache_path: Path | None = None) -> dict:
    if cache_path is None:
        return _prepare_dpae(region_meta, path)
    code_dir = Path(__file__).resolve().parent
    fingerprint = source_fingerprint([path, *(code_dir / name for name in ("dpae.py", "pcol.py", "utils.py", "cache.py", "config.py"))], region_meta)
    return cached_json(cache_path, fingerprint, lambda: _prepare_dpae(region_meta, path), ("national", "regions", "coveredRegions"))


def _prepare_dpae(region_meta: dict[str, dict[str, Any]], path: Path) -> dict:
    import pandas as pd

    columns = ["due_cdi", "due_cddlong", "due_cddcourt"]
    try:
        frame = pd.read_excel(path, sheet_name="REGION", usecols=[*columns, "date_embauche", "nouvelle_region"])
    except (OSError, ValueError) as error:
        raise ValueError("Le fichier DPAE ne peut pas être lu ou ses colonnes sont incomplètes.") from error
    if frame.empty:
        raise ValueError("Le fichier DPAE ne contient aucune observation.")
    index = pcol_region_index(region_meta)
    # Le classeur emploie « Réunion » alors que la géographie utilise « La Réunion ».
    index.update({key.removeprefix("la-"): code for key, code in list(index.items()) if key.startswith("la-")})
    region_codes = {name: index.get(slugify(str(name))) for name in frame["nouvelle_region"].unique()}
    frame["region"] = frame["nouvelle_region"].map(region_codes)
    if frame["region"].isna().any():
        raise ValueError("Le fichier DPAE contient une région non reconnue.")
    try:
        dates = pd.to_datetime(frame["date_embauche"], format="ISO8601", errors="raise")
        values = frame[columns].apply(pd.to_numeric, errors="raise")
    except (ValueError, TypeError) as error:
        raise ValueError("Le fichier DPAE contient une date ou une valeur invalide.") from error
    if dates.isna().any() or ((values < 0) | (values.abs() == math.inf)).any().any():
        raise ValueError("Le fichier DPAE contient une date ou une valeur invalide.")
    frame["date"] = dates.dt.strftime("%Y-%m-01")
    frame[columns] = values

    def scope(rows) -> dict:
        # Conserver les contrats disponibles sans transformer les valeurs manquantes en zéro.
        grouped = rows.groupby("date")[columns].agg(["sum", "count", "size"])
        points = []
        for date, row in grouped.iterrows():
            contracts = {
                column.removeprefix("due_"): float(row[(column, "sum")])
                if row[(column, "count")] == row[(column, "size")] else None
                for column in columns
            }
            total = sum(contracts.values()) if all(value is not None for value in contracts.values()) else None
            long = contracts["cdi"] + contracts["cddlong"] if contracts["cdi"] is not None and contracts["cddlong"] is not None else None
            points.append({"date": date, "value": compact_number(total), "long": compact_number(long),
                           **{key: compact_number(value) for key, value in contracts.items()}})
        return {"points": points}

    return {
        "displayStartDate": DPAE_DISPLAY_START_DATE,
        "modes": list(DPAE_CONTRACTS),
        "national": scope(frame),
        "regions": {code: scope(rows) for code, rows in frame.groupby("region")},
        "coveredRegions": sorted(frame["region"].unique().tolist()),
    }
