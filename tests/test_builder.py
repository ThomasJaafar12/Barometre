from __future__ import annotations

import tempfile
from pathlib import Path
import unittest
from unittest import mock

from barometre_builder import geometry
from barometre_builder.config import (
    EXPERIENCE_REGION_CODES,
    PAYROLL_WINDOW_MONTHS,
    RAR_WINDOW_MONTHS,
    SECTOR_DISPLAY_START_DATE,
)
from barometre_builder.page import build_payloads, render_html
from barometre_builder.utils import gzip_base64_json, load_csv


class CsvLoadingTests(unittest.TestCase):
    def test_headers_are_normalized_once_and_values_are_cleaned(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.csv"
            path.write_text(
                "\ufeff Code ; Label ;Optional\n 11 ; Île-de-France ;\n24; Centre ; value ; ignored\n",
                encoding="utf-8",
            )

            rows = load_csv(path)

        self.assertEqual(
            rows,
            [
                {"Code": "11", "Label": "Île-de-France", "Optional": ""},
                {"Code": "24", "Label": "Centre", "Optional": "value"},
            ],
        )


class GeographyCacheTests(unittest.TestCase):
    def test_simplification_preserves_polygon_winding(self) -> None:
        # A tiny Morbihan island whose three-point simplification used to reverse
        # from clockwise to counter-clockwise, making D3 render the globe.
        ring = [
            [-2.88802, 47.56318],
            [-2.88641, 47.56413],
            [-2.88586, 47.56530],
            [-2.88403, 47.56508],
            [-2.88638, 47.56335],
            [-2.88802, 47.56318],
        ]

        simplified = geometry.simplify_and_quantize_ring(ring, 0.002, 4)

        self.assertLess(geometry.signed_ring_area(ring), 0)
        self.assertLess(geometry.signed_ring_area(simplified), 0)

    def test_fingerprint_changes_when_a_source_changes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            regions = root / "regions.json"
            departments = root / "departments.json"
            regions.write_text('{"version":1}', encoding="utf-8")
            departments.write_text('{"version":1}', encoding="utf-8")
            with (
                mock.patch.object(geometry, "REGION_GEOJSON_PATH", regions),
                mock.patch.object(geometry, "DEPARTMENT_GEOJSON_CACHE", departments),
            ):
                initial = geometry.geography_fingerprint()
                departments.write_text('{"version":2}', encoding="utf-8")
                changed = geometry.geography_fingerprint()

        self.assertNotEqual(initial, changed)

    def test_cache_round_trip_and_invalid_fingerprint(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            cache_path = Path(directory) / "geographies.json"
            regions = {"type": "FeatureCollection", "features": []}
            departments = {"type": "FeatureCollection", "features": []}
            meta = {"11": {"name": "Île-de-France"}}
            geometry.write_geography_cache(cache_path, "valid", regions, departments, meta)

            cached = geometry.load_geography_cache(cache_path, "valid")
            invalid = geometry.load_geography_cache(cache_path, "stale")
            cache_path.write_text('{"fingerprint":"valid"}', encoding="utf-8")
            incomplete = geometry.load_geography_cache(cache_path, "valid")

        self.assertEqual(cached, (regions, departments, meta))
        self.assertIsNone(invalid)
        self.assertIsNone(incomplete)


class GeneratedPayloadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.boot, cls.deferred = build_payloads()

    def test_payload_contract(self) -> None:
        self.assertEqual(set(self.deferred["modules"]), {"sector", "payroll", "auto", "rar"})
        self.assertEqual(
            [region["code"] for region in self.boot["regions"]],
            EXPERIENCE_REGION_CODES,
        )
        self.assertIn("regions", self.boot["geography"])
        self.assertIn("departments", self.deferred["geography"])

    def test_every_current_region_has_valid_d3_department_rings(self) -> None:
        features_by_region = {code: [] for code in EXPERIENCE_REGION_CODES}
        for feature in self.deferred["geography"]["departments"]["features"]:
            features_by_region[feature["properties"]["region"]].append(feature)

            geometry_type = feature["geometry"]["type"]
            coordinates = feature["geometry"]["coordinates"]
            polygons = coordinates if geometry_type == "MultiPolygon" else [coordinates]
            for polygon in polygons:
                for ring_index, ring in enumerate(polygon):
                    self.assertEqual(ring[0], ring[-1])
                    self.assertGreaterEqual(len(set(map(tuple, ring[:-1]))), 3)
                    area = geometry.signed_ring_area(ring)
                    if ring_index == 0:
                        self.assertLess(area, 0, feature["properties"])
                    else:
                        self.assertGreater(area, 0, feature["properties"])

        for region_code, features in features_by_region.items():
            self.assertTrue(features, f"No department geometry for current region {region_code}")

    def test_histories_match_the_rendered_windows(self) -> None:
        sector = self.deferred["modules"]["sector"]["regional"]
        scopes = [sector["national"], *sector["regions"].values()]
        for scope in scopes:
            for series in scope["series"].values():
                self.assertTrue(
                    all(point["date"] >= SECTOR_DISPLAY_START_DATE for point in series["points"])
                )

        payroll = self.deferred["modules"]["payroll"]
        for scope in [payroll["national"], *payroll["regions"].values()]:
            self.assertLessEqual(len(scope["points"]), PAYROLL_WINDOW_MONTHS)

        rar = self.deferred["modules"]["rar"]
        for scope in rar["regions"].values():
            self.assertLessEqual(len(scope["points"]), RAR_WINDOW_MONTHS)

    def test_auto_sector_selector_has_an_aggregate_and_no_technical_option(self) -> None:
        auto = self.deferred["modules"]["auto"]
        sector_labels = [sector["label"] for sector in auto["sectors"]]

        self.assertEqual(auto["defaultSector"], "population-entiere")
        self.assertEqual(auto["sectors"][0], {"key": "population-entiere", "label": "Population entière"})
        self.assertNotIn("_calage_", sector_labels)
        self.assertEqual(len(auto["sectors"]), 37)

        aggregate_total = sum(
            department["values"]["population-entiere"]["economically_active"]
            for department in auto["departments"]
        )
        self.assertEqual(aggregate_total, self.boot["nationalHero"]["auto"]["value"])

    def test_generated_html_is_complete_and_within_budget(self) -> None:
        html = render_html(self.boot, self.deferred)
        for placeholder in (
            "__BOOT_JSON__",
            "__DEFERRED_B64__",
            "__LOGO_PATH__",
            "__CHAPTER_SECTIONS_HTML__",
            "__CHAPTER_REGISTRY_SCRIPT__",
            "__CHAPTER_MODULES_SCRIPT__",
        ):
            self.assertNotIn(placeholder, html)
        self.assertLessEqual(len(html.encode("utf-8")), 2_500_000)
        self.assertLessEqual(len(gzip_base64_json(self.deferred)), 1_900_000)


if __name__ == "__main__":
    unittest.main()
