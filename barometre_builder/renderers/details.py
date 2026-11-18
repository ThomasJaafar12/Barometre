from html import escape
import json

from ..chapters import build_chapter_fragments
from ..config import GEO_DIR, TEMPLATE_PATH, PAGE_TEMPLATES_DIR
from ..dependencies import PAGE_DEPENDENCIES, script_tags
from ..security import ERROR_NOTICE, dependency_guard, local_asset_url, script_json, secure_html
from ..utils import gzip_base64_json
from ..topics import get_topic, project_details_payloads
from .common import read_template, render_template
from .topic_header import render_topic_header


TOPIC_DESCRIPTIONS = {
    "chiffres": "Suivez les indicateurs macro-économiques clés",
    "entreprises": "Analysez la vitalité du tissu économique et la situation des entreprises",
    "emploi": "Suivez l’évolution de l’emploi privé",
}


def render_region_map(geography: dict | None = None) -> str:
    europe = json.loads((GEO_DIR / "europe_context.json").read_text(encoding="utf-8"))
    return render_template(read_template("region-map.js"), {
        "__REGION_GEOJSON__": script_json(geography),
        "__COCKPIT_MAP__": render_template(read_template("cockpit-map.js"), {
            "__EUROPE_CONTEXT__": script_json(europe),
        }),
        "__COCKPIT_READOUT__": read_template("cockpit-readout.js"),
    })


def render_details_payloads(boot: dict, deferred: dict, *, topic: str = "emploi") -> str:
    config = get_topic(topic)
    boot, deferred = project_details_payloads(boot, deferred, topic=topic)
    geography = dict(deferred.get("geography") or {})
    departments = geography.pop("departments", {"type": "FeatureCollection", "features": []})
    if "geography" in deferred:
        deferred = {**deferred, "geography": geography}
    try:
        template = TEMPLATE_PATH.read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError("Le template de la version détaillée ne peut pas être lu.") from error
    videos = boot["assets"]["videos"]
    posters = videos.get("posters", {})
    for asset in (
        boot["assets"]["logo"], videos["placeholder"], videos.get("national"), videos.get("credits"),
        *videos["byRegion"].values(), *videos.get("byHistorical", {}).values(),
        *posters, *posters.values(), *(region.get("video") for region in boot["regions"]),
    ):
        if asset is not None:
            local_asset_url(asset)
    chapters = build_chapter_fragments(topic=topic)
    names = PAGE_DEPENDENCIES[config.page_name]
    values = {
        "__DETAILS_TOPIC__": escape(topic),
        "__DETAILS_TOPIC_LABEL__": escape(config.label),
        "__DETAILS_BRIEF_LINK__": "barometre_bref.html" if topic == "chiffres" else f"barometre_bref.html?rubrique={topic}",
        "__DETAILS_HEADER__": render_topic_header(
            topic, logo_path="Assets/logo/Urssaf.svg", meta=boot["meta"],
            action_html=read_template("detail-geography-control.html"),
            description=TOPIC_DESCRIPTIONS[topic], description_id="topicDescription",
        ),
        "__BOOT_JSON__": script_json(boot),
        "__DEPARTMENT_GEOGRAPHY_B64__": script_json(gzip_base64_json(departments)),
        "__DEFERRED_B64__": gzip_base64_json(deferred),
        "__CHAPTER_SECTIONS_HTML__": chapters["sections_html"],
        "__CHAPTER_RENDER_FUNCTION__": chapters["render_function"],
        "__CHAPTER_MODULES_SCRIPT__": chapters["chapter_scripts"],
        "__MAP_DEPENDENCY__": script_tags(names[:1]),
        "__REGION_MAP_SCRIPT__": render_region_map(),
        "__EXTERNAL_SCRIPTS__": script_tags(names[1:]),
        "__DEPENDENCY_GUARD__": dependency_guard(names, check_now=False),
        "__ERROR_NOTICE__": ERROR_NOTICE,
        "__DETAILS_DOM_SCRIPT__": (PAGE_TEMPLATES_DIR / "details-dom.js").read_text(encoding="utf-8"),
    }
    values["__DETAILS_CSS__"] = read_template("details.css") + "\n" + read_template("topic-header.css")
    if topic == "chiffres":
        values["__DETAILS_CSS__"] += "\n" + read_template("indicator-charts.css")
    values["__DETAILS_SCRIPT__"] = render_template(
        (PAGE_TEMPLATES_DIR / "details.js").read_text(encoding="utf-8"), values
    )
    return secure_html(render_template(template, values), config.page_name)


def render_details(context, *, topic: str = "emploi") -> str:
    return render_details_payloads(context.boot, context.deferred, topic=topic)
