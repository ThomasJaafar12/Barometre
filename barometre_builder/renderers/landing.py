from ..security import secure_html
from .common import read_template, render_template, shared_values


def render_landing(context) -> str:
    return secure_html(render_template(read_template("landing.html"), shared_values(context)), "index.html")