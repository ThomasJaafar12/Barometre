from html import escape
from textwrap import indent

from ..dependencies import PAGE_DEPENDENCIES, script_tags
from ..security import ERROR_NOTICE, dependency_guard, local_asset_url, script_json, secure_html
from .common import read_template, render_template
from .topic_header import render_topic_header


BRIEF_TOPICS = (
    ("chiffres", "", "Les indicateurs essentiels pour comprendre l’économie de la France et de ses régions."),
    ("entreprises", "dpae pcol", "Suivez les embauches déclarées et les difficultés des entreprises."),
    ("emploi", "payroll headcount", "Suivez les effectifs et les rémunérations du secteur privé."),
)

HOME_LINK = '<a class="topic-header-home" href="index.html"><span aria-hidden="true">←</span> Retour à l’accueil</a>'


def render_brief(context) -> str:
    names = PAGE_DEPENDENCIES["barometre_bref.html"]
    options = '<option value="national">France entière</option>' + "".join(
        f'<option value="{escape(region["code"], quote=True)}">{escape(region["name"])}</option>'
        for region in context.brief["regions"]
    )
    headers = []
    for topic, indicator_keys, description in BRIEF_TOPICS:
        header = render_topic_header(
            topic,
            logo_path="Assets/logo/Urssaf.svg",
            meta=context.boot["meta"],
            action_html=HOME_LINK,
            description=description,
        )
        hidden = "" if topic == "chiffres" else " hidden"
        headers.append(f'<div data-brief-topic="{topic}" data-indicator-keys="{indicator_keys}"{hidden}>{header}</div>')
    chart_script = indent(read_template("indicator-charts.js").rstrip(), "  ")
    values = {
        "__SHARED_CSS__": "\n".join(read_template(name) for name in ("shared.css", "topic-header.css", "indicator-charts.css")),
        "__TOPIC_HEADERS__": "\n".join(headers),
        "__REGION_OPTIONS__": options,
        "__LOGO_PATH__": escape(local_asset_url(context.boot["assets"]["logo"]), quote=True),
        "__BRIEF_JSON__": script_json(context.brief),
        "__EXTERNAL_SCRIPTS__": script_tags(names),
        "__DEPENDENCY_GUARD__": dependency_guard(names),
        "__ERROR_NOTICE__": ERROR_NOTICE,
        "__BRIEF_SCRIPT__": render_template(read_template("brief.js"), {"__INDICATOR_CHARTS__": chart_script}),
    }
    return secure_html(render_template(read_template("brief.html"), values), "barometre_bref.html")
