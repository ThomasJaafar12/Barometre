from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import PAGE_TEMPLATES_DIR
from .topics import get_topic


FRAGMENTS_DIR = Path(__file__).resolve().parent / "template_fragments" / "chapters"


@dataclass(frozen=True)
class ChapterFragment:
    html_fragment: str
    script_fragment: str
    render_function: str


CHAPTERS = {
    "chiffres": ChapterFragment("chiffres.html", "chiffres.js", "renderChiffresModule"),
    "sector": ChapterFragment("sector.html", "sector.js", "renderSectorModule"),
    "payroll": ChapterFragment("payroll.html", "payroll.js", "renderPayrollModule"),
}


SHARED_SCRIPTS: tuple[str, ...] = ("shared.js", "ranking.js")


def _fragment(name: str) -> str:
    return (FRAGMENTS_DIR / name).read_text(encoding="utf-8").rstrip()


def build_chapter_fragments(*, topic: str = "emploi") -> dict[str, str]:
    config = get_topic(topic)
    chapter = CHAPTERS[config.chapter_key]

    if topic == "chiffres":
        shared_scripts = [
            _fragment("shared.js"),
            (PAGE_TEMPLATES_DIR / "indicator-charts.js").read_text(encoding="utf-8").rstrip(),
        ]
    else:
        shared_scripts = [_fragment(script) for script in SHARED_SCRIPTS]

    return {
        "sections_html": _fragment(chapter.html_fragment),
        "render_function": chapter.render_function,
        "chapter_scripts": "\n\n".join(
            shared_scripts
            + [_fragment(chapter.script_fragment)]
            + [_fragment(script) for script in config.scripts]
        ),
    }
