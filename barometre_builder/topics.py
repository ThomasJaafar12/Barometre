"""Configuration des lectures détaillées et projection de leurs indicateurs."""
from __future__ import annotations

from dataclasses import dataclass
import math

from .brief import build_bref_payload


@dataclass(frozen=True)
class DetailTopic:
    key: str
    label: str
    chapter_key: str
    modules: tuple[str, ...]
    scripts: tuple[str, ...]
    indicators: tuple[tuple[str, str, str, str, str], ...]
    primary_indicator: str

    @property
    def page_name(self) -> str:
        return f"barometre_{self.key}.html"


TOPICS = {
    "chiffres": DetailTopic(
        "chiffres", "Les chiffres du mois", "chiffres", ("chiffres",), (),
        (("payroll", "Masse salariale privée", "currency", "quarter", "Masse salariale"),
         ("headcount", "Effectifs salariés privés", "count", "quarter", "Effectifs"),
         ("dpae", "DPAE · Tous contrats", "count", "month", "DPAE"),
         ("pcol", "Procédures collectives", "count", "quarter", "Procédures")),
        primary_indicator="headcount",
    ),
    "emploi": DetailTopic(
        "emploi", "Conjoncture de l’emploi", "sector", ("sector", "auto"), ("auto.js",),
        (("headcount", "Effectifs privés CVS", "count", "quarter", "Effectifs"),
         ("payroll", "Masse salariale trimestrielle CVS", "currency", "quarter", "Masse"),
         ("auto", "Auto-entrepreneurs économiquement actifs", "count", "quarter", "Auto")),
        primary_indicator="headcount",
    ),
    "entreprises": DetailTopic(
        "entreprises", "Santé des entreprises", "payroll", ("pcol", "dpae", "delai", "trar"),
        ("quarterly.js", "delai.js", "pcol.js", "dpae.js", "trar.js"),
        (("pcol", "Procédures collectives", "count", "quarter", "Procédures"),
         ("jobs", "Emplois menacés ou détruits", "count", "quarter", "Emplois menacés"),
         ("dpae", "DPAE · Tous contrats", "count", "month", "DPAE"),
         ("delai", "Accords de délais de paiement des indépendants", "count", "quarter", "Délais")),
        primary_indicator="pcol",
    ),
}


def get_topic(topic: str) -> DetailTopic:
    try:
        return TOPICS[topic]
    except KeyError as error:
        raise ValueError("Le thème doit être « chiffres », « emploi » ou « entreprises ».") from error


def project_details_payloads(boot: dict, deferred: dict, *, topic: str = "emploi") -> tuple[dict, dict]:
    """Partager les séries immuables et remplacer uniquement les données de présentation."""
    config = get_topic(topic)
    modules = deferred["modules"]
    topic_modules = {key: modules[key] for key in config.modules if key in modules}
    monthly_scopes = {}
    if topic == "chiffres":
        monthly = build_bref_payload(boot, deferred, modules.get("dpae", {}), history_years=None)
        monthly_scopes = monthly["scopes"]
        topic_modules["chiffres"] = {"indicators": monthly["indicators"], "scopes": monthly_scopes}

    def scope(module: dict, code: str) -> dict:
        return module.get("national", {}) if code == "national" else module.get("regions", {}).get(code, {})

    def observation(value=None, date=None) -> dict:
        valid = isinstance(value, (int, float)) and math.isfinite(value)
        return {"value": value if valid else None, "date": date}

    def hero(code: str) -> dict:
        if topic == "chiffres":
            latest = {}
            for key, series in monthly_scopes[code].items():
                points = series["points"]
                point = points[-1] if points else {}
                latest[key] = observation(point.get("value"), point.get("date"))
            return latest
        if topic == "emploi":
            regional = modules.get("sector", {}).get("regional", {})
            points = scope(regional, code).get("series", {}).get("population-entiere", {}).get("points", [])
            latest = points[-1] if points else {}
            auto = modules.get("auto", {})
            departments = [department for department in auto.get("departments", [])
                           if code == "national" or department.get("regionCode") == code]
            values = [department.get("values", {}).get("population-entiere", {}).get("economically_active")
                      for department in departments]
            total = sum(values) if values and all(isinstance(value, (int, float)) and math.isfinite(value) for value in values) else None
            return {
                "headcount": observation(latest.get("effectifs_cvs"), latest.get("date")),
                "payroll": observation(latest.get("masse_cvs"), latest.get("date")),
                "auto": observation(total, auto.get("latestDate") if departments else None),
            }
        pcol = scope(modules.get("pcol", {}), code).get("modes", {}).get("all", {}).get("population-entiere", [])
        dpae = scope(modules.get("dpae", {}), code).get("points", [])
        delai = scope(modules.get("delai", {}), code).get("modes", {}).get("all", {}).get("ensemble", [])
        latest_pcol = pcol[-1] if pcol else [None, None, None]
        latest_dpae = dpae[-1] if dpae else {}
        latest_delai = delai[-1] if delai else [None, None]
        return {
            "pcol": observation(latest_pcol[1], latest_pcol[0]),
            "jobs": observation(latest_pcol[2], latest_pcol[0]),
            "dpae": observation(latest_dpae.get("value"), latest_dpae.get("date")),
            "delai": observation(latest_delai[1], latest_delai[0]),
        }

    regions = []
    for region in boot["regions"]:
        indicators = hero(region["code"])
        available = sum(point["value"] is not None for point in indicators.values())
        regions.append({**region, "hero": indicators, "hasData": available > 0,
                        "hasPartialData": 0 < available < len(indicators)})
    presentation = {
        **boot, "regions": regions, "nationalHero": hero("national"),
        "detail": {
            "topic": topic, "label": config.label, "primaryIndicator": config.primary_indicator,
            "indicators": [dict(zip(("key", "label", "format", "frequency", "dateLabel"), item)) for item in config.indicators],
        },
    }
    return presentation, {**deferred, "modules": topic_modules}
