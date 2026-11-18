"""Préparation des données historiques de la version détaillée."""
from .config import (
    DOM_REGION_CODES, DPAE_CACHE_PATH, EXPERIENCE_REGION_CODES, LOGO_PATH, MAP_LAYOUT,
    PUBLICATION_DATE_LABEL, PUBLICATION_ISSUE_NUMBER, TRAR_CACHE_PATH,
)
from .dpae import build_dpae_module, compact_dpae_payload
from .geometry import build_geographies
from .modules import build_modules
from .monthly import build_monthly_dpae, build_monthly_payroll
from .palettes import build_color_system
from .trar import build_trar90_scopes, build_trar_module
from .utils import relative_asset


def build_payloads() -> tuple[dict, dict]:
    regions_geojson, departments_geojson, region_meta = build_geographies()
    bundle, hero = build_modules(region_meta)
    dpae = build_dpae_module(region_meta, cache_path=DPAE_CACHE_PATH)
    departments = {props["code"]: props["nom"] for props in (
        feature["properties"] for feature in departments_geojson["features"]
    )}
    trar = build_trar_module(region_meta, departments, cache_path=TRAR_CACHE_PATH)
    modules = {
        **bundle["modules"], "dpae": compact_dpae_payload(dpae), "trar": trar,
        "payrollEarly": build_monthly_payroll(), "dpaeMonthly": build_monthly_dpae(dpae),
        "trar90": build_trar90_scopes(trar),
    }
    boot = {
        "meta": {
            "publicationDateLabel": PUBLICATION_DATE_LABEL,
            "publicationIssueNumber": PUBLICATION_ISSUE_NUMBER,
            "mapLayout": MAP_LAYOUT,
            "experienceRegionCodes": EXPERIENCE_REGION_CODES,
            "domRegionCodes": sorted(DOM_REGION_CODES),
        },
        "assets": {"logo": relative_asset(LOGO_PATH), "videos": bundle["videos"]},
        "colorSystem": build_color_system(),
        "regions": hero["regions"],
        "nationalHero": hero["national"],
        "geography": {"regions": regions_geojson},
    }
    return boot, {"geography": {"departments": departments_geojson}, "modules": modules}
