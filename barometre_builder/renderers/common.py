import re

from ..config import PAGE_TEMPLATES_DIR


def render_template(template: str, values: dict[str, str]) -> str:
    # Une seule passe : les données ne deviennent jamais de nouveaux emplacements.
    return re.sub(r"__[A-Z][A-Z0-9_]*__", lambda match: values[match[0]], template)


def read_template(name: str) -> str:
    try:
        return (PAGE_TEMPLATES_DIR / name).read_text(encoding="utf-8")
    except OSError as error:
        raise RuntimeError(f"Le template {name} ne peut pas être lu.") from error
