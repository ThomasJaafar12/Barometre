"""Moteurs de rendu sans effet de bord sur les fichiers de sortie."""
from .brief import render_brief
from .details import render_details
from .landing import render_landing

RENDERERS = {
    "index.html": render_landing,
    "barometre_bref.html": render_brief,
    "barometre_details.html": render_details,
}