from __future__ import annotations

from typing import Any

from .config import EXPERIENCE_REGION_CODES, PCOL_DISPLAY_START_DATE, PCOL_EXCEL_PATH
from .utils import slugify


PCOL_TYPES = (
    {"id": "sj", "label": "Sauvegardes", "column": "SJ"},
    {"id": "rj", "label": "Redressements", "column": "RJ"},
    {"id": "lj", "label": "Liquidations", "column": "LJ"},
)
PCOL_SECTORS = {
    "AZ": "Agriculture, sylviculture et pêche",
    "C1": "Industries agro-alimentaires",
    "C2": "Cokéfaction et raffinage",
    "C3": "Équipements électriques, électroniques et informatiques",
    "C4": "Fabrication de matériels de transport",
    "C5": "Autres produits industriels",
    "DE": "Industries extractives, énergie et eau",
    "FZ": "Construction",
    "GZ": "Commerce",
    "HZ": "Transports",
    "IZ": "Hébergement et restauration",
    "JZ": "Information et communication",
    "KZ": "Activités financières et d'assurance",
    "LZ": "Activités immobilières",
    "MN": "Activités scientifiques et techniques ; soutien et services administratifs",
    "OQ": "Administrations publiques, enseignement, santé et action sociale",
    "RU": "Autres activités de services",
    "Inconnu": "Secteur non renseigné",
}


def pcol_region_index(region_meta: dict[str, dict[str, Any]]) -> dict[str, str]:
    """Match the workbook's damaged accents against the known region names."""
    result = {}
    for code, region in region_meta.items():
        name = region["name"]
        damaged = "".join(char if char.isascii() else "\ufffd" for char in name)
        for label in (name, damaged):
            result[slugify(label)] = code
    return result


def pcol_change(value: float, previous: float | None) -> float | None:
    return round((value / previous - 1) * 100, 1) if previous else None


def build_pcol_module(region_meta: dict[str, dict[str, Any]]) -> dict[str, Any]:
    import pandas as pd

    count_columns = [f"Nb_{item['column']}" for item in PCOL_TYPES]
    jobs_columns = [f"Emploi_menace_detruit_{item['column']}" for item in PCOL_TYPES]
    value_columns = count_columns + jobs_columns
    frame = pd.read_excel(
        PCOL_EXCEL_PATH,
        usecols=["Date_traitement", "Grdreggeo_sirenbaro", "Secteur_nace_17_baro", *value_columns],
    )
    frame["date"] = pd.to_datetime(frame["Date_traitement"]).dt.strftime("%Y-%m-%d")
    region_index = pcol_region_index(region_meta)
    region_codes = {name: region_index.get(slugify(str(name))) for name in frame["Grdreggeo_sirenbaro"].unique()}
    frame["region"] = frame["Grdreggeo_sirenbaro"].map(region_codes)
    frame["sector"] = frame["Secteur_nace_17_baro"].fillna("Inconnu").str.split().str[0]
    frame[value_columns] = frame[value_columns].apply(pd.to_numeric, errors="coerce").fillna(0)

    dates = sorted(frame["date"].unique())
    history_start = f"{int(PCOL_DISPLAY_START_DATE[:4]) - 1}{PCOL_DISPLAY_START_DATE[4:]}"
    sectors = [{"key": "population-entiere", "label": "Ensemble des secteurs"}] + [
        {"key": code, "label": f"{code} {PCOL_SECTORS.get(code, code)}" if code != "Inconnu" else "Inconnu — Secteur non renseigné"}
        for code in sorted(frame["sector"].unique())
    ]
    modes = [{"id": "all", "label": "Toutes les procédures"}] + [
        {"id": item["id"], "label": item["label"]} for item in PCOL_TYPES
    ]

    # Aggregate once; national totals include records without a domestic region.
    grouped = frame.groupby(["region", "sector", "date"])[value_columns].sum()
    national = frame.groupby(["sector", "date"])[value_columns].sum()

    def build_scope(values) -> dict[str, Any]:
        if values.empty:
            return {"latestDate": None, "modes": {}, "topSectors": {}}
        by_sector = {key: group.droplevel("sector") for key, group in values.groupby(level="sector")}
        by_sector["population-entiere"] = values.groupby(level="date").sum()
        scope: dict[str, Any] = {"latestDate": values.index.get_level_values("date").max(), "modes": {}, "topSectors": {}}
        for mode in modes:
            mode_id = mode["id"]
            mode_types = PCOL_TYPES if mode_id == "all" else [item for item in PCOL_TYPES if item["id"] == mode_id]
            nb_columns = [f"Nb_{item['column']}" for item in mode_types]
            employment_columns = [f"Emploi_menace_detruit_{item['column']}" for item in mode_types]
            scope["modes"][mode_id] = {}
            ranking = []
            for sector in sectors:
                raw = by_sector.get(sector["key"])
                if raw is None:
                    raw = pd.DataFrame(0, index=dates, columns=value_columns)
                else:
                    raw = raw.reindex(dates, fill_value=0)
                counts = raw[nb_columns].sum(axis=1).to_dict()
                jobs = raw[employment_columns].sum(axis=1).to_dict()
                points = []
                for date in dates:
                    if date > scope["latestDate"] or date < history_start:
                        continue
                    nb = int(counts[date])
                    employment = round(float(jobs[date]), 3)
                    points.append([date, nb, employment])
                scope["modes"][mode_id][sector["key"]] = points
                if points and sector["key"] != "population-entiere" and points[-1][1] > 0:
                    previous_year = f"{int(points[-1][0][:4]) - 1}{points[-1][0][4:]}"
                    ranking.append({"key": sector["key"], "label": sector["label"], "nb": points[-1][1], "nb_yoy": pcol_change(points[-1][1], counts.get(previous_year))})
            scope["topSectors"][mode_id] = sorted(ranking, key=lambda row: (-row["nb"], row["key"]))[:5]
        return scope

    regional = {code: values.droplevel("region") for code, values in grouped.groupby(level="region")}
    return {
        "latestDate": dates[-1] if dates else None,
        "displayStartDate": PCOL_DISPLAY_START_DATE,
        "sectors": sectors,
        "modes": modes,
        "national": build_scope(national),
        "regions": {code: build_scope(regional[code]) if code in regional else {"latestDate": None, "modes": {}, "topSectors": {}} for code in EXPERIENCE_REGION_CODES},
    }
