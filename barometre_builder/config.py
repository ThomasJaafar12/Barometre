from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "Assets"
DATA_DIR = ASSETS_DIR / "Data_source"
GEO_DIR = ASSETS_DIR / "Geo"
MAP_SCENE_DIR = ASSETS_DIR / "MapScene"
PREMIUM_MAP_PACK_DIR = ASSETS_DIR / "premium-map-pack"
MP4_DIR = ASSETS_DIR / "Mp4"
LOGO_PATH = ASSETS_DIR / "logo" / "logo.png"
REGION_GEOJSON_PATH = GEO_DIR / "france_regions_source.geojson"
GEO_METADATA_PATH = GEO_DIR / "contours_administratifs_dataset.json"
DEPARTMENT_GEOJSON_CACHE = GEO_DIR / "departements-50m.geojson"
MAP_SCENE_ATTRIBUTION_PATH = MAP_SCENE_DIR / "attribution.json"
MAP_SCENE_RENDER_DIR = MAP_SCENE_DIR / "Renders"
MAP_SCENE_MANIFEST_PATH = MAP_SCENE_DIR / "manifest.json"
MAP_SCENE_REFERENCE_LAYOUT_PATH = MAP_SCENE_DIR / "reference_layout_gemini.json"
PREMIUM_MAP_PACK_MANIFEST_PATH = PREMIUM_MAP_PACK_DIR / "manifest.json"
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

@dataclass(frozen=True)
class GeometryOptimization:
    region_tolerance: float = 0.003
    department_tolerance: float = 0.002
    coordinate_precision: int = 4


GEOMETRY_OPTIMIZATION = GeometryOptimization()

MAP_SCENE_EXPERIMENT = {
    "enabled": True,
    "modeDefault": "premium",
    "storageKey": "barometre.dev.sceneMode",
    "visiblePhases": ["landing", "national"],
    "budget": {
        "maxObjectCount": 24,
        "maxDecodedArea": 7_500_000,
    },
}
