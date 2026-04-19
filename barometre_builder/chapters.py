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
    rail_kicker: str
    label: str
    rail_meta: str
    section_kicker: str
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
        rail_kicker="lecture",
        label="Effectifs et masse salariale",
        rail_meta="ouverture large, dual axis premium",
        section_kicker="01 / Effectifs et masse salariale",
        section_title="Effectifs et masse salariale.",
        section_meta="Glissement annuel a gauche, niveau a droite, lecture trimestrielle 2014-2025.",
        tone=1,
        html_fragment="sector.html",
        script_fragment="sector.js",
        render_function="renderSectorModule",
    ),
    ChapterFragment(
        key="payroll",
        section_id="module-payroll",
        number="02",
        rail_kicker="rythme",
        label="Flux mensuel",
        rail_meta="cadence, saisonnalite, tension",
        section_kicker="02 / Masse salariale & chomage partiel",
        section_title="Le flux mensuel.",
        section_meta="Serie recente, masse salariale et tension sur la periode.",
        tone=2,
        html_fragment="payroll.html",
        script_fragment="payroll.js",
        render_function="renderPayrollModule",
    ),
    ChapterFragment(
        key="auto",
        section_id="module-auto",
        number="03",
        rail_kicker="focus",
        label="Auto-entrepreneurs",
        rail_meta="profil a part, lecture specifique",
        section_kicker="03 / Auto-entrepreneurs",
        section_title="Departements sous tension douce.",
        section_meta="Focus departemental, secteur a part, lecture specifique.",
        tone=3,
        html_fragment="auto.html",
        script_fragment="auto.js",
        render_function="renderAutoModule",
    ),
    ChapterFragment(
        key="rar",
        section_id="module-rar",
        number="04",
        rail_kicker="tension",
        label="RAR / HORSTO",
        rail_meta="lecture experte, module dense",
        section_kicker="04 / RAR / HORSTO",
        section_title="Le relief du risque.",
        section_meta="Courbes mensuelles, lecture complementaire, signal expert.",
        tone=4,
        html_fragment="rar.html",
        script_fragment="rar.js",
        render_function="renderRarModule",
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
            "railKicker": chapter.rail_kicker,
            "label": chapter.label,
            "railMeta": chapter.rail_meta,
            "sectionKicker": chapter.section_kicker,
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
        "chapter_scripts": "\n\n".join(_fragment(chapter.script_fragment) for chapter in CHAPTERS),
    }
