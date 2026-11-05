"""Orchestration et écriture atomique des pages du baromètre."""
from __future__ import annotations

import sys

from .config import OUTPUT_DIR
from .context import build_context
from .payloads import build_payloads
from .renderers.details import render_details_payloads
from .publication import assemble_publication
from .publishing import publish_files
from .topics import get_topic


def render_html(boot_payload: dict, deferred_payload: dict, *, topic: str = "emploi") -> str:
    """Retourner le rendu détaillé du thème, sans écriture."""
    return render_details_payloads(boot_payload, deferred_payload, topic=topic)


def build_pages() -> dict[str, str]:
    context = build_context()
    publication = assemble_publication(context)
    publish_files(publication.files, OUTPUT_DIR)
    return publication.pages


def build_page(*, topic: str = "emploi") -> str:
    """Générer toutes les pages et retourner le détail du thème demandé."""
    name = get_topic(topic).page_name
    return build_pages()[name]


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    try:
        pages = build_pages()
    except (OSError, ValueError, RuntimeError) as error:
        raise SystemExit(f"La génération a échoué : {error}") from error
    for name in pages:
        print(f"Fichier généré : {OUTPUT_DIR / name}")
