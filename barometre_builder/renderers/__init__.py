"""Moteurs de rendu sans effet de bord sur les fichiers de sortie."""
from functools import partial

from .brief import render_brief
from .details import render_details
from .landing import render_landing

RENDERERS = {
    "index.html": render_landing,
    "barometre_bref.html": render_brief,
    "barometre_emploi.html": partial(render_details, topic="emploi"),
    "barometre_entreprises.html": partial(render_details, topic="entreprises"),
}