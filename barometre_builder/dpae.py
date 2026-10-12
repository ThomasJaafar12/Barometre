"""Lecture et agrégation mensuelle des déclarations préalables à l’embauche."""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from .cache import cached_json, source_fingerprint
from .config import DPAE_EXCEL_PATH
from .pcol import pcol_region_index
from .utils import compact_number, slugify


def build_dpae_module(region_meta: dict[str, dict[str, Any]], path: Path = DPAE_EXCEL_PATH, *, cache_path: Path | None = None) -> dict:
    if cache_path is None:
        return _prepare_dpae(region_meta, path)
    code_dir = Path(__file__).resolve().parent
    fingerprint = source_fingerprint([path, *(code_dir / name for name in ("dpae.py", "pcol.py", "utils.py", "cache.py"))], region_meta)
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
    frame["value"] = values.sum(axis=1, min_count=len(columns))

    def scope(rows) -> dict:
        # Une observation incomplète rend le total indisponible, jamais égal à zéro.
        grouped = rows.groupby("date")["value"].agg(["sum", "count", "size"])
        points = [
            {"date": date, "value": compact_number(float(row["sum"])) if row["count"] == row["size"] else None}
            for date, row in grouped.iterrows()
        ]
        return {"points": points}

    return {
        "national": scope(frame),
        "regions": {code: scope(rows) for code, rows in frame.groupby("region")},
        "coveredRegions": sorted(frame["region"].unique().tolist()),
    }
