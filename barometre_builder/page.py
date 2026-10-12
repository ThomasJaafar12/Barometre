"""Orchestration et écriture atomique des trois pages du baromètre."""
from __future__ import annotations

import os
import sys
from pathlib import Path
import tempfile

from .config import ROOT, OUTPUT_PAGES
from .context import build_context
from .payloads import build_payloads
from .renderers import RENDERERS
from .renderers.details import render_details_payloads
from .security import validate_html


def render_html(boot_payload: dict, deferred_payload: dict) -> str:
    """Interface historique : retourner le rendu détaillé."""
    return render_details_payloads(boot_payload, deferred_payload)


def write_pages(pages: dict[str, str], output_dir: Path) -> None:
    staged: list[tuple[Path, Path]] = []
    try:
        for name, html in pages.items():
            if name not in OUTPUT_PAGES:
                raise ValueError("Le nom d’un fichier de sortie n’est pas autorisé.")
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=output_dir,
                                             prefix=".barometre-", suffix=".tmp", delete=False) as handle:
                temporary = Path(handle.name)
                staged.append((temporary, output_dir / name))
                handle.write(html)
        for temporary, destination in staged:
            os.replace(temporary, destination)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)


def build_pages() -> dict[str, str]:
    context = build_context()
    pages = {name: RENDERERS[name](context) for name in OUTPUT_PAGES}
    for name, html in pages.items():
        validate_html(html, name)
    write_pages(pages, ROOT)
    return pages


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
        print(f"Fichier généré : {name}")
