from html import escape

from ..security import secure_html
from .common import read_template, render_template


def render_landing(context) -> str:
    meta = context.boot["meta"]
    values = {
        "__LANDING_CSS__": read_template("landing.css"),
        "__PUBLICATION_DATE_LABEL__": escape(meta["publicationDateLabel"]),
        "__PUBLICATION_ISSUE_NUMBER__": escape(meta["publicationIssueNumber"]),
    }
    return secure_html(render_template(read_template("landing.html"), values), "index.html")
