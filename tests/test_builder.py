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
