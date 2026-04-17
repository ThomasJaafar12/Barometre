from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "Assets"
DATA_DIR = ASSETS_DIR / "Data_source"
GEO_DIR = ASSETS_DIR / "Geo"
MP4_DIR = ASSETS_DIR / "Mp4"
LOGO_PATH = ASSETS_DIR / "logo" / "logo.png"
REGION_GEOJSON_PATH = GEO_DIR / "france_regions_source.geojson"
GEO_METADATA_PATH = GEO_DIR / "contours_administratifs_dataset.json"
DEPARTMENT_GEOJSON_CACHE = GEO_DIR / "departements-50m.geojson"
OUTPUT_HTML_PATH = ROOT / "barometre.html"
TEMPLATE_PATH = ROOT / "barometre.template.html"

MAP_LAYOUT = {
    "width": 1200,
    "height": 860,
    "mainlandExtent": [72, 92, 770, 760],
    "domInsets": {
        "01": {"x": 840, "y": 96, "width": 276, "height": 118},
        "02": {"x": 840, "y": 228, "width": 276, "height": 118},
        "03": {"x": 840, "y": 360, "width": 276, "height": 118},
        "04": {"x": 840, "y": 492, "width": 276, "height": 118},
        "06": {"x": 840, "y": 624, "width": 276, "height": 118},
    },
}

EXPERIENCE_REGION_CODES = [
    "11",
    "24",
    "27",
    "28",
    "32",
    "44",
    "52",
    "53",
    "75",
    "76",
    "84",
    "93",
    "94",
    "01",
    "02",
    "03",
    "04",
    "06",
]
DOM_REGION_CODES = {"01", "02", "03", "04", "06"}

REGION_THEMES = [
    {"accent": "#75f0c6", "accentDeep": "#0f8d74", "secondary": "#8ac3ff", "glow": "#89e5e5"},
    {"accent": "#7bd7ff", "accentDeep": "#1969a6", "secondary": "#75f0c6", "glow": "#9ac8ff"},
    {"accent": "#8db0ff", "accentDeep": "#2455bd", "secondary": "#8ef7d0", "glow": "#8aa8ff"},
    {"accent": "#7af1cb", "accentDeep": "#1b8c76", "secondary": "#ffd38a", "glow": "#9fffe7"},
    {"accent": "#b89dff", "accentDeep": "#6346d9", "secondary": "#7bd7ff", "glow": "#b6b7ff"},
    {"accent": "#ffd28f", "accentDeep": "#bc6b1e", "secondary": "#75f0c6", "glow": "#ffcf80"},
    {"accent": "#9be6ff", "accentDeep": "#1c6f9d", "secondary": "#ffb6b6", "glow": "#9edcff"},
    {"accent": "#ffbe96", "accentDeep": "#c9652a", "secondary": "#8db0ff", "glow": "#ffc6a9"},
    {"accent": "#83f4d8", "accentDeep": "#198a7b", "secondary": "#d1b2ff", "glow": "#87f6ec"},
    {"accent": "#f6b6ff", "accentDeep": "#9d4ea8", "secondary": "#7bd7ff", "glow": "#f2c0ff"},
    {"accent": "#9ec1ff", "accentDeep": "#315ec5", "secondary": "#ffd59f", "glow": "#9cc5ff"},
    {"accent": "#ffe289", "accentDeep": "#bc8b1e", "secondary": "#8cd2ff", "glow": "#ffeaa8"},
    {"accent": "#98f0b6", "accentDeep": "#1d8a55", "secondary": "#8db0ff", "glow": "#a5fccd"},
    {"accent": "#ffb3cc", "accentDeep": "#be567f", "secondary": "#8db0ff", "glow": "#ffbfd0"},
    {"accent": "#83dbff", "accentDeep": "#1b6ea1", "secondary": "#ffe289", "glow": "#9fe4ff"},
    {"accent": "#9effb0", "accentDeep": "#29924d", "secondary": "#ffb9ad", "glow": "#b2ffc0"},
    {"accent": "#ffcf87", "accentDeep": "#bf7227", "secondary": "#8bf7f3", "glow": "#ffd497"},
    {"accent": "#d9d9d9", "accentDeep": "#838383", "secondary": "#b7c8dd", "glow": "#f0f0f0"},
]


@dataclass(frozen=True)
class GeometryOptimization:
    region_tolerance: float = 0.003
    department_tolerance: float = 0.002
    coordinate_precision: int = 4


GEOMETRY_OPTIMIZATION = GeometryOptimization()
