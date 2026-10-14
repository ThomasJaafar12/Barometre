"""Orchestration et écriture atomique des trois pages du baromètre."""
from __future__ import annotations

import sys

from .config import OUTPUT_DIR
from .context import build_context
from .payloads import build_payloads
from .renderers.details import render_details_payloads
from .publication import assemble_publication
from .publishing import publish_files


def render_html(boot_payload: dict, deferred_payload: dict) -> str:
    """Interface historique : retourner le rendu détaillé."""
    return render_details_payloads(boot_payload, deferred_payload)


def build_pages() -> dict[str, str]:
    context = build_context()
    publication = assemble_publication(context)
    publish_files(publication.files, OUTPUT_DIR)
    return publication.pages


def build_page() -> str:
    """Interface historique : générer les pages et retourner la version détaillée."""
    return build_pages()["barometre_details.html"]


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
