from html import escape
import re

from ..config import PAGE_TEMPLATES_DIR
from ..security import local_asset_url


def render_template(template: str, values: dict[str, str]) -> str:
    # Une seule passe : les données ne deviennent jamais de nouveaux emplacements.
    return re.sub(r"__[A-Z][A-Z0-9_]*__", lambda match: values[match[0]], template)


def shared_values(context) -> dict[str, str]:
    meta = context.boot["meta"]
    return {
        "__SHARED_CSS__": (PAGE_TEMPLATES_DIR / "shared.css").read_text(encoding="utf-8"),
        "__HEADER_ART__": (PAGE_TEMPLATES_DIR / "header-art.html").read_text(encoding="utf-8"),
        "__LOGO_PATH__": escape(local_asset_url(context.boot["assets"]["logo"]), quote=True),
        "__PUBLICATION__": escape(f'{meta["publicationDateLabel"]} · N°{meta["publicationIssueNumber"]}'),
    }


def read_template(name: str) -> str:
    try:
        return (PAGE_TEMPLATES_DIR / name).read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError(f"Le template {name} ne peut pas être lu.") from error
