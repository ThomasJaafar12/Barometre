from html import escape

from ..security import script_json, secure_html
from .common import read_template, render_template


def render_landing_prefetch(paths: tuple[str, ...]) -> str:
    script = render_template(read_template("landing-prefetch.js"), {
        "__PREFETCH_PATHS__": script_json(paths),
    })
    return f'  <script id="region-map-prefetch">{script}</script>\n'


def render_landing(context) -> str:
    meta = context.boot["meta"]
    values = {
        "__LANDING_CSS__": read_template("landing.css"),
        "__PUBLICATION_DATE_LABEL__": escape(meta["publicationDateLabel"]),
        "__PUBLICATION_ISSUE_NUMBER__": escape(meta["publicationIssueNumber"]),
    }
    return secure_html(render_template(read_template("landing.html"), values), "index.html")
