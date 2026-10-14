"""Comparer une publication à ses rendus historiques, sans normaliser le contenu."""
from __future__ import annotations

import argparse
import base64
import gzip
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from barometre_builder.config import OUTPUT_DIR, OUTPUT_PAGES
from barometre_builder.context import build_context
from barometre_builder.dependencies import PAGE_DEPENDENCIES, script_tags
from barometre_builder.publication import APP_SCRIPTS, STYLES, read_publication, strip_security_metadata, vendor_path
from barometre_builder.renderers import RENDERERS


def inline_publication(page_name: str, files: dict[str, bytes]) -> str:
    html = strip_security_metadata(files[page_name].decode("utf-8"))
    style = STYLES[page_name]
    html = html.replace(f'<link rel="stylesheet" href="{style}">',
                        "<style>" + files[style].decode("utf-8") + "</style>")
    app = APP_SCRIPTS[page_name]
    if app:
        html = html.replace(f'<script src="{app}"></script>',
                            "<script>" + files[app].decode("utf-8") + "</script>")
    for name in PAGE_DEPENDENCIES[page_name]:
        html = html.replace(f'<script src="{vendor_path(name)}"></script>', script_tags((name,)))
    media = json.loads(files["site_manifest.json"])["media"]
    # Réécriture inverse limitée aux correspondances explicites du manifeste.
    for source, destination in sorted(media.items(), key=lambda item: len(item[1]), reverse=True):
        html = html.replace(destination, source)
    return html


def compare_publication(reference: dict[str, str], files: dict[str, bytes]) -> None:
    for name in OUTPUT_PAGES:
        actual = inline_publication(name, files)
        expected = strip_security_metadata(reference[name])
        if actual != expected:
            offset = next((i for i, (a, b) in enumerate(zip(actual, expected)) if a != b),
                          min(len(actual), len(expected)))
            raise ValueError(f"Le contenu de {name} a changé à la position {offset}.")
    before = re.search(r'window\.BAROMETRE_DEFERRED_GZIP = "([^"]+)"', reference["barometre_details.html"])[1]
    after = re.search(r'window\.BAROMETRE_DEFERRED_GZIP = "([^"]+)"', files["barometre_details.html"].decode("utf-8"))[1]
    if before != after or gzip.decompress(base64.b64decode(before)) != gzip.decompress(base64.b64decode(after)):
        raise ValueError("Les données différées ont changé.")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Vérifier l’équivalence du site publié.")
    parser.add_argument("--reference-dir", type=Path, help="HTML sauvegardés avant la migration.")
    parser.add_argument("--site-dir", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()
    if args.reference_dir:
        reference = {name: (args.reference_dir / name).read_text(encoding="utf-8") for name in OUTPUT_PAGES}
    else:
        context = build_context()
        reference = {name: RENDERERS[name](context) for name in OUTPUT_PAGES}
    compare_publication(reference, read_publication(args.site_dir))
    print("Les trois pages, leurs styles, scripts et données sont équivalents aux rendus historiques.")


if __name__ == "__main__":
    main()
