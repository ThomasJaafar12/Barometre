"""Vérifier les octets qui doivent rester identiques pendant la migration DOM."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from barometre_builder.publication import MANIFEST_NAME, read_publication


def compare_assets(before: Path, after: Path) -> None:
    reference = read_publication(before)
    actual = read_publication(after)
    if reference.keys() != actual.keys():
        raise ValueError("Le périmètre des fichiers publiés a changé.")
    allowed = {MANIFEST_NAME, "assets/js/details.js"}
    for name in reference.keys() - allowed:
        if reference[name] != actual[name]:
            raise ValueError(f"Le fichier {name} a changé pendant la migration DOM.")
    print("HTML, données, CSS, médias, bibliothèques et synthèse identiques octet pour octet.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-dir", type=Path, required=True)
    parser.add_argument("--site-dir", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    compare_assets(args.reference_dir, args.site_dir)


if __name__ == "__main__":
    main()
