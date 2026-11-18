"""Projection légère des données existantes pour un public non spécialiste."""
from __future__ import annotations

import math


HISTORY_YEARS = 10


INDICATORS = (
    {"key": "payroll", "label": "Masse salariale", "unit": "euros", "frequency": "quarter",
     "definition": "La somme des rémunérations brutes versées par les employeurs du secteur privé au cours du trimestre.",
     "explanation": "Elle évolue avec le nombre de salariés, les salaires et le temps de travail. Une hausse ne signifie donc pas forcément que les salaires de chacun augmentent.",
     "source": "Urssaf · Masse salariale du secteur privé, corrigée des variations saisonnières."},
    {"key": "headcount", "label": "Effectifs salariés", "unit": "salaries", "frequency": "quarter",
     "definition": "Le nombre de salariés du secteur privé à la fin du trimestre.",
     "explanation": "Cet indicateur permet de suivre l’emploi salarié. Il ne décrit pas l’ensemble des emplois publics ou des travailleurs indépendants.",
     "source": "Urssaf · Effectifs salariés du secteur privé, corrigés des variations saisonnières."},
    {"key": "dpae", "label": "Déclarations préalables à l’embauche", "unit": "declarations", "frequency": "month",
     "definition": "Les déclarations envoyées par les employeurs avant une embauche, pour les CDI et les CDD, courts ou longs.",
     "explanation": "Une personne peut faire l’objet de plusieurs déclarations. Les DPAE signalent des intentions d’embauche, pas le nombre de créations nettes d’emplois.",
     "source": "Urssaf · Fichier mensuel DPAE fourni, tous contrats confondus."},
    {"key": "pcol", "label": "Procédures collectives", "unit": "procedures", "frequency": "quarter",
     "definition": "Les procédures ouvertes pour des entreprises en difficulté : sauvegarde, redressement ou liquidation judiciaire.",
     "explanation": "Toutes ces procédures n’entraînent pas une fermeture : la sauvegarde et le redressement visent aussi à permettre la poursuite de l’activité.",
     "source": "Urssaf · Ensemble des procédures collectives, tous secteurs confondus."},
)


def finite_value(value):
    return value if isinstance(value, (int, float)) and math.isfinite(value) else None


def percent_change(value, previous):
    if finite_value(value) is None or finite_value(previous) in (None, 0):
        return None
    return (value / previous - 1) * 100


def indicator_series(points: list[dict], frequency: str, *, history_years: int | None = HISTORY_YEARS) -> dict:
    ordered = sorted(points, key=lambda point: point["date"])
    values = {point["date"]: finite_value(point["value"]) for point in ordered}
    enriched = []
    for point in ordered:
        date = point["date"]
        value = values[date]
        previous = values.get(f"{int(date[:4]) - 1}{date[4:]}")
        enriched.append({"date": date, "value": value, "yearlyChange": percent_change(value, previous)})
    # Conserver les deux bornes pour couvrir des années entières dans la synthèse.
    if history_years is not None:
        enriched = enriched[-(history_years * (12 if frequency == "month" else 4) + 1):]
    return {"points": enriched}


def build_bref_payload(boot: dict, deferred: dict, dpae: dict, *, history_years: int | None = HISTORY_YEARS) -> dict:
    modules = deferred["modules"]
    regional = modules.get("sector", {}).get("regional", {})
    pcol = modules.get("pcol", {})
    covered_regions = set(dpae.get("coveredRegions", ()))
    missing = [region["name"] for region in boot["regions"] if region["code"] not in covered_regions]

    def scope(module: dict, code: str) -> dict:
        return module.get("national", {}) if code == "national" else module.get("regions", {}).get(code, {})

    def build_scope(code: str) -> dict:
        sector_scope = scope(regional, code)
        sector_points = sector_scope.get("series", {}).get("population-entiere", {}).get("points", [])
        pcol_scope = scope(pcol, code)
        pcol_points = pcol_scope.get("modes", {}).get("all", {}).get("population-entiere", [])
        dpae_scope = scope(dpae, code)
        points_by_indicator = {
            "payroll": [{"date": p["date"], "value": p.get("masse_cvs")} for p in sector_points],
            "headcount": [{"date": p["date"], "value": p.get("effectifs_cvs")} for p in sector_points],
            "dpae": dpae_scope.get("points", []),
            "pcol": [{"date": p[0], "value": p[1]} for p in pcol_points],
        }
        series = {
            indicator["key"]: indicator_series(
                points_by_indicator[indicator["key"]], indicator["frequency"], history_years=history_years,
            )
            for indicator in INDICATORS
        }
        series["dpae"]["coverageNote"] = (
            "Périmètre national : régions disponibles dans le fichier, hors " + ", ".join(missing) + "."
            if code == "national" and missing else ""
        )
        if code == "national":
            series["pcol"]["coverageNote"] = "Le total national reprend l’ensemble du fichier, y compris les dossiers sans région française attribuée."
        return series

    return {
        "meta": boot["meta"],
        "indicators": list(INDICATORS),
        "regions": [{"code": r["code"], "name": r["name"]} for r in boot["regions"]],
        "scopes": {code: build_scope(code) for code in ["national", *(r["code"] for r in boot["regions"])]},
    }
