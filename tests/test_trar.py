from datetime import date
from pathlib import Path
import tempfile
import unittest

from openpyxl import Workbook

from barometre_builder.trar import TRAR_ALL_SECTORS, build_trar_module


class TrarModuleTests(unittest.TestCase):
    def setUp(self) -> None:
        folder = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.paths = {level: folder / f"{level}.xlsx" for level in ("national", "regional", "departmental")}
        self.cache = folder / "trar.json"
        self.regions = {"04": {"name": "La Réunion"}, "06": {"name": "Mayotte"}}
        self.departments = {"974": "La Réunion", "976": "Mayotte", "2A": "Corse-du-Sud"}

        self.january = date(2026, 1, 31)
        self.february = date(2026, 2, 1)
        self.march = date(2026, 3, 1)
        self._save("national", ("nace88",), [
            (self.march, "tous secteurs", 0.017, None, None),
            (self.january, "tous secteurs", 0.015, 0.012, 0.009),
            (self.march, "05", None, None, None),
            (self.january, 1, -0.00001, 0.0000001, 1.35),
        ])
        self._save("regional", ("nv_region", "nace28"), [
            (self.january, "Réunion", "tous secteurs", 0.025, 0.018, 0.01),
            (self.february, "Mayotte", "tous secteurs", 0.25, 0.21, None),
            (self.february, "France entière", "tous secteurs", 0.04, 0.04, 0.04),
            (self.march, "Mayotte", "Industries extractives", None, None, 0.0),
        ])
        self._save("departmental", ("dept", "nace5"), [
            (self.march, "Réunion", "tous secteurs", 0.031, None, None),
            (self.february, "Réunion", "tous secteurs", 0.035, 0.033, None),
            (self.january, "Réunion", "tous secteurs", 0.033, 0.028, 0.021),
            (self.january, "Corse-du-Sud", "tous secteurs", 0.027, 0.014, 0.011),
            (self.february, "Corse-du-Sud", "BTP", 0.012, 0.005, 0.002),
            (self.march, "Métropole", "tous secteurs", 0.2, 0.2, 0.2),
        ])

    def _save(self, level, dimensions, rows) -> None:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["DATE", *dimensions, "TRAR_CVS", "TRAR30J_CVS", "TRAR90J_CVS"])
        for row in rows:
            sheet.append(row)
        workbook.save(self.paths[level])
        workbook.close()

    def _build(self) -> dict:
        return build_trar_module(self.regions, self.departments, self.paths, cache_path=self.cache)

    def test_three_distinct_breakdowns_share_dates_and_keep_published_values(self) -> None:
        data = self._build()
        self.assertEqual(data, self._build())  # Même contrat après lecture du cache.
        self.assertEqual(data["dates"], ["2026-01-01", "2026-02-01", "2026-03-01"])
        self.assertEqual([len(options) for options in data["sectors"].values()], [3, 2, 2])
        self.assertEqual(data["sectors"]["national"][1]["key"], "01")
        self.assertIn("Culture et production animale", data["sectors"]["national"][1]["label"])
        self.assertEqual(data["national"][TRAR_ALL_SECTORS], [[1.5, 1.2, 0.9], [None, None, None], [1.7, None, None]])
        self.assertEqual(data["national"]["01"][0], [-0.001, 0.00001, 135])
        self.assertEqual(data["national"]["05"], [[None, None, None]] * 3)
        self.assertEqual(set(data["regions"]), {"04", "06"})
        self.assertEqual(set(data["departments"]), {"974", "2A"})
        self.assertEqual(data["regions"]["04"][TRAR_ALL_SECTORS][0], [2.5, 1.8, 1])
        self.assertEqual(data["regions"]["06"]["industries-extractives"][2], [None, None, 0])

    def test_department_snapshots_use_a_single_month_per_sector_and_horizon(self) -> None:
        data = self._build()
        self.assertEqual(data["departmentSnapshots"], {TRAR_ALL_SECTORS: [2, 1, 0], "btp": [1, 1, 1]})
        self.assertEqual(data["departments"]["2A"][TRAR_ALL_SECTORS][2], [None, None, None])
        self.assertEqual(data["departments"]["974"][TRAR_ALL_SECTORS][2], [3.1, None, None])

    def test_dashboard_uses_source_precision_and_common_ranking_months_since_2014(self) -> None:
        december_2013 = date(2013, 12, 1)
        january_2014 = date(2014, 1, 1)
        december_2014 = date(2014, 12, 1)
        january_2015 = date(2015, 1, 1)
        february_2015 = date(2015, 2, 1)
        self._save("national", ("nace88",), [
            (december_2013, "07", 0.9, 0.9, 0.9),
            (january_2014, "02", 0.040162, None, None),
            (january_2014, "tous secteurs", 0.1, 0.01, 0.009261),
            (december_2014, "tous secteurs", 0.12, 0.015, None),
            (january_2015, "tous secteurs", 0.2, None, 0.009113),
            (february_2015, "tous secteurs", 0.25, None, None),
            (january_2015, "01", 0.040013, None, None),
            (january_2015, "02", 0.040014, 0.031, None),
            (january_2015, "04", 0.032, None, None),
            (january_2015, "03", 0.032, 0.02, None),
            (january_2015, "05", 0.01, None, None),
            (january_2015, "06", 0.0, None, None),
        ])

        data = self._build()
        self.assertEqual(data["displayStartDate"], "2014-01-01")
        self.assertEqual(data["dates"][0], "2013-12-01")
        current = data["dates"].index("2015-01-01")
        self.assertEqual(data["national"][TRAR_ALL_SECTORS][current][2], 0.911)
        national = data["dashboards"]["national"]
        self.assertEqual(national["changes"][TRAR_ALL_SECTORS], [[None, 5], [None, None], [-0.01, None]])
        self.assertEqual(national["changes"]["07"], [[None, None]] * 3)
        self.assertEqual(national["rankings"], [
            {"date": "2015-01-01", "rows": [
                ["02", 4.001, -0.01], ["01", 4.001, None], ["03", 3.2, None], ["04", 3.2, None], ["05", 1, None],
            ]},
            {"date": "2015-01-01", "rows": [["02", 3.1, None], ["03", 2, None]]},
            {"date": None, "rows": []},
        ])
        self.assertEqual(data["dashboards"]["regions"]["06"]["rankings"][2], {
            "date": "2026-03-01", "rows": [["industries-extractives", 0, None]],
        })

    def test_source_change_invalidates_cache_and_duplicate_months_are_rejected(self) -> None:
        self._build()
        self._save("national", ("nace88",), [
            (date(2026, 1, 1), "01", 0.03, None, None),
            (self.january, "01", 0.04, None, None),
        ])
        with self.assertRaisesRegex(ValueError, r"national\.xlsx, ligne 3.*doublon"):
            self._build()
