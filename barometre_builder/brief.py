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


def indicator_series(points: list[dict], frequency: str) -> dict:
    ordered = sorted(points, key=lambda point: point["date"])
    values = {point["date"]: finite_value(point["value"]) for point in ordered}
    enriched = []
    for point in ordered:
        date = point["date"]
        value = values[date]
        previous = values.get(f"{int(date[:4]) - 1}{date[4:]}")
        change = (value / previous - 1) * 100 if value is not None and previous not in (None, 0) else None
        enriched.append({"date": date, "value": value, "yearlyChange": change})
    # Include both endpoints so a complete series spans ten full years.
    return {"points": enriched[-(HISTORY_YEARS * (12 if frequency == "month" else 4) + 1):]}


def build_bref_payload(boot: dict, deferred: dict, dpae: dict) -> dict:
    modules = deferred["modules"]
    regional = modules["sector"]["regional"]

    def build_scope(code: str) -> dict:
        sector_scope = regional["national"] if code == "national" else regional["regions"].get(code, {})
        sector_points = sector_scope.get("series", {}).get("population-entiere", {}).get("points", [])
        pcol_scope = modules["pcol"]["national"] if code == "national" else modules["pcol"]["regions"].get(code, {})
        pcol_points = pcol_scope.get("modes", {}).get("all", {}).get("population-entiere", [])
        dpae_scope = dpae["national"] if code == "national" else dpae["regions"].get(code, {})
        series = {
            "payroll": indicator_series([{"date": p["date"], "value": p["masse_cvs"]} for p in sector_points], "quarter"),
            "headcount": indicator_series([{"date": p["date"], "value": p["effectifs_cvs"]} for p in sector_points], "quarter"),
            "dpae": indicator_series(dpae_scope.get("points", []), "month"),
            "pcol": indicator_series([{"date": p[0], "value": p[1]} for p in pcol_points], "quarter"),
        }
        missing = [region["name"] for region in boot["regions"] if region["code"] not in dpae["coveredRegions"]]
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
