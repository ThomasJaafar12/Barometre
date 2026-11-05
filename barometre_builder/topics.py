"""Configuration des lectures détaillées et projection de leurs indicateurs."""
from __future__ import annotations

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class DetailTopic:
    key: str
    label: str
    chapter_key: str
    modules: tuple[str, ...]
    scripts: tuple[str, ...]
    indicators: tuple[tuple[str, str, str, str, str], ...]

    @property
    def page_name(self) -> str:
        return f"barometre_{self.key}.html"


TOPICS = {
    "emploi": DetailTopic(
        "emploi", "Conjoncture de l’emploi", "sector", ("sector", "auto"), ("auto.js",),
        (("headcount", "Effectifs privés CVS", "count", "quarter", "Effectifs"),
         ("payroll", "Masse salariale trimestrielle CVS", "currency", "quarter", "Masse"),
         ("auto", "Auto-entrepreneurs économiquement actifs", "count", "quarter", "Auto")),
    ),
    "entreprises": DetailTopic(
        "entreprises", "Santé des entreprises", "payroll", ("pcol", "dpae", "delai"),
        ("quarterly.js", "delai.js", "pcol.js", "dpae.js"),
        (("pcol", "Procédures collectives", "count", "quarter", "Procédures"),
         ("jobs", "Emplois menacés ou détruits", "count", "quarter", "Emplois menacés"),
         ("dpae", "DPAE · Tous contrats", "count", "month", "DPAE"),
         ("delai", "Accords de délais de paiement des indépendants", "count", "quarter", "Délais")),
    ),
}


def get_topic(topic: str) -> DetailTopic:
    try:
        return TOPICS[topic]
    except KeyError as error:
        raise ValueError("Le thème doit être « emploi » ou « entreprises ».") from error


def project_details_payloads(boot: dict, deferred: dict, *, topic: str = "emploi") -> tuple[dict, dict]:
    """Partager les séries immuables et remplacer uniquement les données de présentation."""
    config = get_topic(topic)
    modules = deferred["modules"]

    def scope(module: dict, code: str) -> dict:
        return module.get("national", {}) if code == "national" else module.get("regions", {}).get(code, {})

    def observation(value=None, date=None) -> dict:
        valid = isinstance(value, (int, float)) and math.isfinite(value)
        return {"value": value if valid else None, "date": date}

    def hero(code: str) -> dict:
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
            "topic": topic, "label": config.label, "primaryIndicator": config.indicators[0][0],
            "indicators": [dict(zip(("key", "label", "format", "frequency", "dateLabel"), item)) for item in config.indicators],
        },
    }
    return presentation, {**deferred, "modules": {key: modules[key] for key in config.modules if key in modules}}
