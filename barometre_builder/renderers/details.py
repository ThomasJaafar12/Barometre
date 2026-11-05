from html import escape

from ..chapters import build_chapter_fragments
from ..config import TEMPLATE_PATH, PAGE_TEMPLATES_DIR
from ..dependencies import PAGE_DEPENDENCIES, script_tags
from ..security import ERROR_NOTICE, dependency_guard, local_asset_url, script_json, secure_html
from ..utils import gzip_base64_json
from ..topics import get_topic, project_details_payloads
from .common import render_template


def render_details_payloads(boot: dict, deferred: dict, *, topic: str = "emploi") -> str:
    config = get_topic(topic)
    boot, deferred = project_details_payloads(boot, deferred, topic=topic)
    try:
        template = TEMPLATE_PATH.read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError("Le template de la version détaillée ne peut pas être lu.") from error
    for video in [boot["assets"]["videos"]["placeholder"], *boot["assets"]["videos"]["byRegion"].values()]:
        local_asset_url(video)
    chapters = build_chapter_fragments(topic=topic)
    names = PAGE_DEPENDENCIES[config.page_name]
    values = {
        "__DETAILS_TOPIC__": escape(topic),
        "__DETAILS_TOPIC_LABEL__": escape(config.label),
        "__BOOT_JSON__": script_json(boot),
        "__DEFERRED_B64__": gzip_base64_json(deferred),
        "__LOGO_PATH__": escape(local_asset_url(boot["assets"]["logo"]), quote=True),
        "__CHAPTER_SECTIONS_HTML__": chapters["sections_html"],
        "__CHAPTER_REGISTRY_SCRIPT__": chapters["registry_script"],
        "__CHAPTER_MODULES_SCRIPT__": chapters["chapter_scripts"],
        "__EXTERNAL_SCRIPTS__": script_tags(names),
        "__DEPENDENCY_GUARD__": dependency_guard(names),
        "__ERROR_NOTICE__": ERROR_NOTICE,
        "__DETAILS_DOM_SCRIPT__": (PAGE_TEMPLATES_DIR / "details-dom.js").read_text(encoding="utf-8"),
        "__DETAILS_PUBLICATION__": escape(f'{boot["meta"]["publicationDateLabel"]} – N°{boot["meta"]["publicationIssueNumber"]}'),
    }
    values["__DETAILS_CSS__"] = (PAGE_TEMPLATES_DIR / "details.css").read_text(encoding="utf-8")
    values["__DETAILS_SCRIPT__"] = render_template(
        (PAGE_TEMPLATES_DIR / "details.js").read_text(encoding="utf-8"), values
    )
    return secure_html(render_template(template, values), config.page_name)


def render_details(context, *, topic: str = "emploi") -> str:
    return render_details_payloads(context.boot, context.deferred, topic=topic)
