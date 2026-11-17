"""Comparer une publication à ses rendus historiques, sans normaliser le contenu."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from barometre_builder.config import OUTPUT_DIR, OUTPUT_PAGES
from barometre_builder.context import build_context
from barometre_builder.dependencies import PAGE_DEPENDENCIES, script_tags
from barometre_builder.publication import (
    APP_SCRIPTS, DEFERRED_DATA_SCRIPTS, MANIFEST_NAME, STYLES,
    late_detail_scripts, read_publication, region_map_preloads, region_map_resources,
    strip_security_metadata, vendor_path,
)
from barometre_builder.renderers import RENDERERS
from barometre_builder.renderers.landing import render_landing_prefetch
from barometre_builder.security import script_json


SHARED_GEOGRAPHY = re.compile(r"(^[ \t]*const sharedGeography = )(.+);$", re.M)
BOOT_DATA = re.compile(r"(^[ \t]*window\.BAROMETRE_BOOT = )(.+);$", re.M)


def restore_inline_payload(page_name: str, html: str, files: dict[str, bytes]) -> str:
    path = DEFERRED_DATA_SCRIPTS.get(page_name)
    if path not in files:
        return html
    source = f'    window.BAROMETRE_DEFERRED_SRC = "{path}";\n'
    return html.replace(source, "    " + files[path].decode("ascii"), 1)


def restore_inline_map(page_name: str, html: str, files: dict[str, bytes], manifest: dict) -> str:
    map_path = manifest.get("region_map")
    if not map_path:
        return html
    if page_name == "index.html":
        return html.replace(render_landing_prefetch(region_map_resources(map_path)), "", 1)
    if page_name not in DEFERRED_DATA_SCRIPTS:
        return html
    script = files[map_path].decode("utf-8")
    geometry = json.loads(SHARED_GEOGRAPHY.search(script)[2])
    inline_script = SHARED_GEOGRAPHY.sub(r"\g<1>null;", script, count=1)

    def restore_boot(match: re.Match) -> str:
        boot = json.loads(match[2])
        if geometry is not None:
            boot["geography"] = {"regions": geometry, **boot.get("geography", {})}
        return match[1] + script_json(boot) + ";"

    html = BOOT_DATA.sub(restore_boot, html, count=1)
    html = html.replace(region_map_preloads(map_path), "", 1)
    html = html.replace(f'<script src="{map_path}"></script>',
                        '<script id="barometre-region-map">' + inline_script + "</script>", 1)
    for script_path in late_detail_scripts(page_name):
        html = html.replace(f'<script defer src="{script_path}"></script>', f'<script src="{script_path}"></script>', 1)
    return html


def inline_publication(page_name: str, files: dict[str, bytes]) -> str:
    manifest = json.loads(files[MANIFEST_NAME])
    html = strip_security_metadata(files[page_name].decode("utf-8"))
    html = restore_inline_map(page_name, html, files, manifest)
    html = restore_inline_payload(page_name, html, files)
    style = STYLES[page_name]
    html = html.replace(f'<link rel="stylesheet" href="{style}">',
                        "<style>" + files[style].decode("utf-8") + "</style>")
    app = APP_SCRIPTS[page_name]
    if app:
        html = html.replace(f'<script src="{app}"></script>',
                            "<script>" + files[app].decode("utf-8") + "</script>")
    for name in PAGE_DEPENDENCIES[page_name]:
        html = html.replace(f'<script src="{vendor_path(name)}"></script>', script_tags((name,)))
    media = manifest["media"]
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
    print("Les cinq pages publiées correspondent aux rendus du générateur.")


if __name__ == "__main__":
    main()
