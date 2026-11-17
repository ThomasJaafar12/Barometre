"""Bandeau des rubriques utilisé dans les deux niveaux de lecture."""
from html import escape

from ..security import local_asset_url


HEADINGS = {
    "chiffres": ("01", "Les chiffres du ", "mois"),
    "entreprises": ("02", "Santé des ", "entreprises"),
    "emploi": ("03", "Conjoncture de ", "l’emploi"),
}


def render_topic_header(
    topic: str, *, logo_path: str, meta: dict, action_html: str,
    description: str, description_id: str | None = None,
) -> str:
    number, prefix, highlight = HEADINGS[topic]
    logo = escape(local_asset_url(logo_path), quote=True)
    date = escape(meta["publicationDateLabel"])
    issue = escape(meta["publicationIssueNumber"])
    description_attributes = f' id="{escape(description_id, quote=True)}"' if description_id else ""
    return f"""<header class="topic-header" data-topic="{topic}">
      <div class="topic-header-main">
        <span class="topic-header-number" aria-hidden="true">{number}</span>
        <div class="topic-header-copy">
          <div class="topic-header-meta">
            <img src="{logo}" alt="Urssaf">
            <span class="topic-header-brand">Panorama économique</span>
            <span class="topic-header-edition"><strong>{date}</strong> · N°{issue}</span>
          </div>
          <h1>{prefix}<span class="topic-header-highlight">{highlight}</span></h1>
          <p class="topic-header-description"{description_attributes}>{escape(description)}</p>
        </div>
      </div>
      {action_html}
    </header>"""
