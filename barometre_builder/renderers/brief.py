from html import escape

from ..dependencies import PAGE_DEPENDENCIES, script_tags
from ..security import ERROR_NOTICE, dependency_guard, script_json, secure_html
from .common import read_template, render_template, shared_values


def render_brief(context) -> str:
    names = PAGE_DEPENDENCIES["barometre_bref.html"]
    options = '<option value="national">France entière</option>' + "".join(
        f'<option value="{escape(region["code"], quote=True)}">{escape(region["name"])}</option>'
        for region in context.brief["regions"]
    )
    values = shared_values(context) | {
        "__REGION_OPTIONS__": options,
        "__BRIEF_JSON__": script_json(context.brief),
        "__EXTERNAL_SCRIPTS__": script_tags(names),
        "__DEPENDENCY_GUARD__": dependency_guard(names),
        "__ERROR_NOTICE__": ERROR_NOTICE,
        "__BRIEF_SCRIPT__": read_template("brief.js"),
    }
    return secure_html(render_template(read_template("brief.html"), values), "barometre_bref.html")