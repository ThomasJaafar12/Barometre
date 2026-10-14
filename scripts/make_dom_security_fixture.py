"""Générer une publication de test contenant de vrais libellés hostiles."""
from __future__ import annotations

import argparse
from copy import deepcopy
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from barometre_builder.context import BuildContext, build_context
from barometre_builder.publication import assemble_publication
from barometre_builder.publishing import publish_files


ATTACK = (' <img id="dom-injection-probe" src="x" onerror="window.__domXssExecuted=true">'
          '</script><script>window.__domXssExecuted=true</script>')


def hostile_labels(value: object) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in {"label", "name", "nom"} and isinstance(item, str):
                value[key] = item + ATTACK
            else:
                hostile_labels(item)
    elif isinstance(value, list):
        for item in value:
            hostile_labels(item)


def make_fixture(output: Path) -> None:
    cache = (ROOT / ".cache").resolve()
    if not output.resolve().is_relative_to(cache):
        raise ValueError("Les publications de test doivent rester dans .cache.")
    context = deepcopy(build_context())
    # Tester explicitement zéro et absence, sans dépendre du millésime des sources.
    dpae = context.deferred["modules"]["dpae"]
    for scope in (dpae["national"], dpae["regions"]["11"]):
        scope["points"][-1].update(value=None, cdi=0, cddlong=None, cddcourt=0)
    for data in (context.boot, context.deferred, context.brief):
        hostile_labels(data)
    context.boot["meta"]["publicationDateLabel"] += ATTACK
    publication = assemble_publication(BuildContext(context.boot, context.deferred, context.brief))
    publish_files(publication.files, output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / ".cache/dom-security-fixture")
    args = parser.parse_args()
    make_fixture(args.output_dir)
    print("Publication hostile générée dans", args.output_dir)


if __name__ == "__main__":
    main()
