from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .brief import TRAR90_LABEL
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


SHARED_SCRIPTS: tuple[str, ...] = ("shared.js", "ranking.js", "department-view.js", "department-chart.js")


def _fragment(name: str) -> str:
    return (FRAGMENTS_DIR / name).read_text(encoding="utf-8").rstrip()


def _department_card(prefix: str, title: str, *, arrears: bool = False,
                     picker_class: str = "employment-grand-sector-picker") -> str:
    picker_contents = "" if arrears else """
                      <span class="mono employment-select-label">Secteur</span>
                      <button class="employment-sector-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
                        <span class="employment-sector-trigger-value">Population entière</span>
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 7.5 5 5 5-5"></path></svg>
                      </button>
                      <div class="employment-sector-menu" role="listbox" aria-label="Sélection du secteur d’activité"></div>
                    """
    return _fragment("department-card.html").format(
        prefix=prefix, title=title, picker_class=picker_class, picker_contents=picker_contents,
        title_id="trarDepartmentTitle" if arrears else f"{prefix}MapTitle",
        context_id="trarDepartmentContext" if arrears else f"{prefix}MapMeta",
        picker_id="trarDepartmentSectorPicker" if arrears else f"{prefix}SectorPicker",
        switch_id="trarHorizonSwitch" if arrears else f"{prefix}MetricSwitch",
        switch_label="Échéance du taux départemental" if arrears else "Indicateur départemental",
        legend_id="trarSnapshotLegend" if arrears else f"{prefix}Legend",
        chart_label=("Évolution mensuelle du taux du département sélectionné" if arrears
                     else "Évolution trimestrielle dans le département sélectionné"),
    )


def build_chapter_fragments(*, topic: str = "emploi") -> dict[str, str]:
    config = get_topic(topic)
    chapter = CHAPTERS[config.chapter_key]

    sections_html = _fragment(chapter.html_fragment)
    if topic == "chiffres":
        sections_html = sections_html.replace("__CHIFFRES_DPAE_HTML__", _fragment("chiffres-dpae.html"))
    if topic in ("chiffres", "entreprises"):
        trar_title = TRAR90_LABEL if topic == "chiffres" else "Taux de reste à recouvrer"
        trar_html = _fragment("trar.html").replace(
            "__TRAR_TITLE__", trar_title,
        ).replace(
            "__TRAR_DEPARTMENT_HTML__",
            _department_card("trar", "Taux de reste à recouvrer par département", arrears=True),
        )
        sections_html = sections_html.replace("__TRAR_HTML__", trar_html)
    if topic == "emploi":
        sections_html = sections_html.replace(
            "__EMPLOYMENT_DEPARTMENT_HTML__",
            _department_card("employmentDept", "Carte départementale des effectifs privés et de la masse salariale"),
        ).replace(
            "__AUTO_DEPARTMENT_HTML__",
            _department_card("auto", "Carte départementale des travailleurs indépendants", picker_class="auto-sector-picker"),
        )

    return {
        "sections_html": sections_html,
        "render_function": chapter.render_function,
        "chapter_scripts": "\n\n".join(
            _fragment(script) for script in (*SHARED_SCRIPTS, chapter.script_fragment, *config.scripts)
        ),
    }
