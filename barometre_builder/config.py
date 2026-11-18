from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "Assets"
DATA_DIR = ASSETS_DIR / "Data_source"
GEO_DIR = ASSETS_DIR / "Geo"
MP4_DIR = ASSETS_DIR / "Mp4"
LOGO_PATH = ASSETS_DIR / "logo" / "Urssaf_blanc.png"
REGION_GEOJSON_PATH = GEO_DIR / "france_regions_source.geojson"
GEO_METADATA_PATH = GEO_DIR / "contours_administratifs_dataset.json"
DEPARTMENT_GEOJSON_CACHE = GEO_DIR / "departements-50m.geojson"
DERIVED_CACHE_DIR = ROOT / ".cache" / "barometre"
GEOGRAPHY_CACHE_PATH = DERIVED_CACHE_DIR / "geographies.json"
MODULE_DATA_CACHE_PATH = DERIVED_CACHE_DIR / "modules.json"
DPAE_CACHE_PATH = DERIVED_CACHE_DIR / "dpae.json"
TRAR_CACHE_PATH = DERIVED_CACHE_DIR / "trar.json"
OUTPUT_DIR = ROOT / "dist"
OUTPUT_HTML_PATH = OUTPUT_DIR / "index.html"
OUTPUT_PAGES = (
    "index.html", "barometre_bref.html", "barometre_emploi.html", "barometre_entreprises.html",
    "barometre_chiffres.html",
)
TEMPLATE_PATH = ROOT / "barometre.template.html"
PAGE_TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
DPAE_EXCEL_PATH = DATA_DIR / "donnees_dpae_regions.xlsx"
MONTHLY_DATA_DIR = DATA_DIR / "chiffre du mois"
MONTHLY_PAYROLL_PATH = MONTHLY_DATA_DIR / "OPEND_BARO_REG_MS_MENS_06_2026reg60j.xlsx"
MONTHLY_DPAE_PATH = MONTHLY_DATA_DIR / "OPEND_BARO_DPAE_09_2026fr30j.xlsx"
TRAR_EXCEL_PATHS = {
    "national": DATA_DIR / "DATAVIZ_TRAR_NACE88.xlsx",
    "regional": DATA_DIR / "DATAVIZ_TRAR_NV_REGION_NACE28.xlsx",
    "departmental": DATA_DIR / "DATAVIZ_TRAR_DEP_NACE5.xlsx",
}
TRAR_NACE88_LABELS_PATH = DATA_DIR / "nace88-insee-naf-rev2.csv"
DPAE_DISPLAY_START_DATE = "2014-01-01"
PUBLICATION_DATE_LABEL = os.getenv("BAROMETRE_PUBLICATION_DATE", "24 juin 2026")
PUBLICATION_ISSUE_NUMBER = os.getenv("BAROMETRE_ISSUE_NUMBER", "189")

MAP_LAYOUT = {
    "width": 1200,
    "height": 860,
    "mainlandExtent": [42, 52, 840, 820],
    "domInsets": {
        "01": {"x": 880, "y": 62, "width": 292, "height": 122},
        "02": {"x": 880, "y": 194, "width": 292, "height": 122},
        "03": {"x": 880, "y": 326, "width": 292, "height": 122},
        "04": {"x": 880, "y": 458, "width": 292, "height": 122},
        "06": {"x": 880, "y": 590, "width": 292, "height": 122},
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

SECTOR_DISPLAY_START_DATE = "2014-01-01"
DELAI_DISPLAY_START_DATE = "2014-01-01"
PAYROLL_WINDOW_MONTHS = 48
RAR_WINDOW_MONTHS = 36
DELAI_EXCEL_PATH = DATA_DIR / "NB_DELAI_3_TOT19694778149800.xlsx"
PCOL_DISPLAY_START_DATE = "2014-01-01"
PCOL_EXCEL_PATH = DATA_DIR / "NB_PCOLL_1_TOT20764806547000.xlsx"

