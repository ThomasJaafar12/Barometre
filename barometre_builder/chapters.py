from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path


FRAGMENTS_DIR = Path(__file__).resolve().parent / "template_fragments" / "chapters"


@dataclass(frozen=True)
class ChapterFragment:
    key: str
    section_id: str
    number: str
    label: str
    nav_label: str
    rail_meta: str
    section_title: str
    section_meta: str
    tone: int
    html_fragment: str
    script_fragment: str
    render_function: str


CHAPTERS: tuple[ChapterFragment, ...] = (
    ChapterFragment(
        key="sector",
        section_id="module-sector",
        number="01",
        label="Conjoncture de l'emploi",
        nav_label="Conjoncture",
        rail_meta="emploi, masse salariale, lecture territoriale",
        section_title="Conjoncture de l'emploi.",
        section_meta="",
        tone=1,
        html_fragment="sector.html",
        script_fragment="sector.js",
        render_function="renderSectorModule",
    ),
    ChapterFragment(
        key="payroll",
        section_id="module-payroll",
        number="02",
        label="Santé des entreprises",
        nav_label="Santé",
        rail_meta="masse salariale, assiette, signaux d'activité",
        section_title="Santé des entreprises.",
        section_meta="Lecture mensuelle de l'activité déclarée, de la masse salariale et des tensions conjoncturelles.",
        tone=2,
        html_fragment="payroll.html",
        script_fragment="payroll.js",
        render_function="renderPayrollModule",
    ),
    ChapterFragment(
        key="auto",
        section_id="module-auto",
        number="03",
        label="Travailleurs indépendants",
        nav_label="Indépendants",
        rail_meta="auto-entrepreneurs, lecture territoriale",
        section_title="Travailleurs indépendants.",
        section_meta="Focus départemental sur les indépendants, avec lecture sectorielle et hiérarchie territoriale.",
        tone=3,
        html_fragment="auto.html",
        script_fragment="auto.js",
        render_function="renderAutoModule",
    ),
)


def _fragment(name: str) -> str:
    return (FRAGMENTS_DIR / name).read_text(encoding="utf-8").rstrip()


def build_chapter_fragments() -> dict[str, str]:
    registry_lines = ["      const chapterRegistry = ["]
    for chapter in CHAPTERS:
        payload = {
            "key": chapter.key,
            "id": chapter.section_id,
            "number": chapter.number,
            "label": chapter.label,
            "navLabel": chapter.nav_label,
            "railMeta": chapter.rail_meta,
            "sectionKicker": f"#{chapter.number}",
            "sectionTitle": chapter.section_title,
            "sectionMeta": chapter.section_meta,
            "tone": chapter.tone,
        }
        payload_fields = ", ".join(
            f"{key}: {json.dumps(value, ensure_ascii=True)}" for key, value in payload.items()
        )
        registry_lines.append(
            f"        {{ {payload_fields}, render: {chapter.render_function} }},"
        )
    registry_lines.append("      ];")

    return {
        "sections_html": "\n\n".join(_fragment(chapter.html_fragment) for chapter in CHAPTERS),
        "registry_script": "\n".join(registry_lines),
        "chapter_scripts": "\n\n".join(
            [_fragment(chapter.script_fragment) for chapter in CHAPTERS] + [_fragment("rar.js")]
        ),
    }
