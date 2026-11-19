"""Configuration des lectures détaillées et projection de leurs indicateurs."""
from __future__ import annotations

from dataclasses import dataclass
from operator import itemgetter

from .brief import MONTHLY_INDICATORS, TRAR90_LABEL, build_monthly_payload, finite_value, indicator_series, percent_change
from .trar import project_trar90


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


MONTHLY_FORMATS = {"euros": "currency", "percent": "percent", "declarations": "count"}
MONTHLY_DATE_LABELS = {"payrollEarly": "Masse salariale", "trar90": "Taux à 90 jours", "dpae": "DPAE"}

TOPICS = {
    "chiffres": DetailTopic(
        "chiffres", "Les chiffres du mois", "chiffres", ("chiffres",),
        ("employment-chart.js", "quarterly.js", "chiffres-dpae.js", "trar.js"),
        tuple((indicator["key"], indicator["label"], MONTHLY_FORMATS[indicator["unit"]],
               indicator["frequency"], MONTHLY_DATE_LABELS[indicator["key"]]) for indicator in MONTHLY_INDICATORS),
    ),
    "emploi": DetailTopic(
        "emploi", "Conjoncture de l’emploi", "sector", ("sector", "auto"),
        ("employment-chart.js", "employment-department.js", "auto.js"),
        (("headcount", "Effectifs privés CVS", "count", "quarter", "Effectifs"),
         ("payroll", "Masse salariale trimestrielle CVS", "currency", "quarter", "Masse"),
         ("auto", "Auto-entrepreneurs économiquement actifs", "count", "quarter", "Auto")),
    ),
    "entreprises": DetailTopic(
        "entreprises", "Santé des entreprises", "payroll", ("pcol", "dpae", "delai", "trar"),
        ("quarterly.js", "delai.js", "pcol.js", "dpae.js", "trar.js"),
        (("pcol", "Procédures collectives", "count", "quarter", "Procédures"),
         ("jobs", "Emplois menacés ou détruits", "count", "quarter", "Emplois menacés"),
         ("dpae", "DPAE · Tous contrats", "count", "month", "DPAE"),
         ("trar90", TRAR90_LABEL, "percent", "month", "Taux à 90 jours")),
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
        monthly = build_monthly_payload(boot, deferred, history_years=None, detailed=True)
        monthly_scopes = monthly["scopes"]
        topic_modules["chiffres"] = {**monthly, "arrears": project_trar90(modules.get("trar", {}))}

    def scope(module: dict, code: str) -> dict:
        return module.get("national", {}) if code == "national" else module.get("regions", {}).get(code, {})

    def observation(value=None, date=None, yearly_change=None) -> dict:
        return {"value": finite_value(value), "date": date, "yearlyChange": finite_value(yearly_change)}

    def latest_observation(points, date_and_value) -> dict:
        if not points:
            return observation()
        date, value = date_and_value(points[-1])
        prior_date = f"{int(date[:4]) - 1}{date[4:]}"
        previous = next((v for d, v in map(date_and_value, reversed(points)) if d == prior_date), None)
        return observation(value, date, percent_change(value, previous))

    def hero(code: str) -> dict:
        if topic == "chiffres":
            latest = {}
            for key, series in monthly_scopes[code].items():
                points = series["points"]
                point = points[-1] if points else {}
                latest[key] = observation(point.get("value"), point.get("date"), point.get("yearlyChange"))
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
            total = sum(values) if values and all(finite_value(value) is not None for value in values) else None
            prior_active = auto.get("previousYearActive", {}).get(code)
            return {
                "headcount": observation(latest.get("effectifs_cvs"), latest.get("date"), latest.get("effectifs_yoy")),
                "payroll": observation(latest.get("masse_cvs"), latest.get("date"), latest.get("masse_yoy")),
                "auto": observation(total, auto.get("latestDate") if departments else None, percent_change(total, prior_active)),
            }
        pcol = scope(modules.get("pcol", {}), code).get("modes", {}).get("all", {}).get("population-entiere", [])
        dpae = scope(modules.get("dpae", {}), code).get("points", [])
        arrears = scope(modules.get("trar90", {}), code).get("points", [])
        rates = indicator_series(arrears, "month", percentage_points=True, trim_trailing_missing=True)["points"]
        rate = rates[-1] if rates else {}
        return {
            "pcol": latest_observation(pcol, itemgetter(0, 1)),
            "jobs": latest_observation(pcol, itemgetter(0, 2)),
            "dpae": latest_observation(dpae, itemgetter("date", "value")),
            "trar90": observation(rate.get("value"), rate.get("date"), rate.get("yearlyChange")),
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
            "topic": topic, "label": config.label,
            "indicators": [dict(zip(("key", "label", "format", "frequency", "dateLabel"), item)) for item in config.indicators],
        },
    }
    return presentation, {**deferred, "modules": topic_modules}
