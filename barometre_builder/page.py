from __future__ import annotations

from datetime import UTC, datetime

from .config import DOM_REGION_CODES, EXPERIENCE_REGION_CODES, LOGO_PATH, MAP_LAYOUT, OUTPUT_HTML_PATH, TEMPLATE_PATH
from .export_ui import build_export_ui_fragments
from .geometry import build_geographies
from .modules import build_modules
from .palettes import build_color_system
from .utils import dump_json, gzip_base64_json, relative_asset


def build_payloads() -> tuple[dict, dict]:
    regions_geojson, departments_geojson, region_meta = build_geographies()
    bundle, hero = build_modules(region_meta)
    color_system = build_color_system()
    boot_payload = {
        "meta": {
            "generatedAt": datetime.now(UTC).isoformat(),
            "mapLayout": MAP_LAYOUT,
            "experienceRegionCodes": EXPERIENCE_REGION_CODES,
            "domRegionCodes": sorted(DOM_REGION_CODES),
        },
        "assets": {"logo": relative_asset(LOGO_PATH), "videos": bundle["videos"]},
        "colorSystem": color_system,
        "regions": hero["regions"],
        "nationalHero": hero["national"],
        "geography": {"regions": regions_geojson},
    }
    deferred_payload = {
        "geography": {"departments": departments_geojson},
        "modules": bundle["modules"],
    }
    return boot_payload, deferred_payload


def render_html(boot_payload: dict, deferred_payload: dict) -> str:
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    export_ui = build_export_ui_fragments()
    html = template.replace("__BOOT_JSON__", dump_json(boot_payload).replace("</", "<\\/"))
    html = html.replace("__DEFERRED_B64__", gzip_base64_json(deferred_payload))
    html = html.replace("__LOGO_PATH__", boot_payload["assets"]["logo"])
    html = html.replace("__EXPORT_UI_STYLE__", export_ui["style"])
    html = html.replace("__EXPORT_UI_HTML__", export_ui["html"])
    html = html.replace("__EXPORT_UI_SCRIPT__", export_ui["script"])
    return html


def build_page() -> str:
    if not TEMPLATE_PATH.exists():
        raise RuntimeError("barometre.template.html is missing.")
    boot_payload, deferred_payload = build_payloads()
    html = render_html(boot_payload, deferred_payload)
    OUTPUT_HTML_PATH.write_text(html, encoding="utf-8")
    return html


def main() -> None:
    build_page()
    print(f"Wrote {OUTPUT_HTML_PATH.name}")
