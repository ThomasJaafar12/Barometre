from __future__ import annotations

import unittest
from unittest import mock

import pandas as pd

from barometre_builder.pcol import build_pcol_module, pcol_change, pcol_region_index


class PcolAggregationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.regions = {
            "11": {"name": "Île-de-France"},
            "75": {"name": "Nouvelle-Aquitaine"},
            "06": {"name": "Mayotte"},
        }
        frame = pd.DataFrame([
            {"Date_traitement": "2023-04-01", "Grdreggeo_sirenbaro": "\ufffdle-de-France", "Secteur_nace_17_baro": "FZ Construction", "Nb_RJ": 10, "Emploi_menace_detruit_RJ": 30},
            {"Date_traitement": "2024-01-01", "Grdreggeo_sirenbaro": "\ufffdle-de-France", "Secteur_nace_17_baro": "FZ Construction", "Nb_RJ": 6, "Emploi_menace_detruit_RJ": 12},
            {"Date_traitement": "2024-04-01", "Grdreggeo_sirenbaro": "\ufffdle-de-France", "Secteur_nace_17_baro": "FZ Construction", "Nb_RJ": 0, "Emploi_menace_detruit_RJ": 0},
            {"Date_traitement": "2024-04-01", "Grdreggeo_sirenbaro": "Île-de-France", "Secteur_nace_17_baro": "GZ Commerce", "Nb_SJ": 1, "Nb_RJ": 2, "Nb_LJ": 3, "Emploi_menace_detruit_SJ": 12, "Emploi_menace_detruit_RJ": 20, "Emploi_menace_detruit_LJ": 15},
            {"Date_traitement": "2024-04-01", "Grdreggeo_sirenbaro": "Etranger", "Secteur_nace_17_baro": "FZ Construction", "Nb_RJ": 4, "Emploi_menace_detruit_RJ": 8},
            {"Date_traitement": "2024-04-01", "Grdreggeo_sirenbaro": "Nouvelle-Aquitaine", "Secteur_nace_17_baro": "FZ Construction", "Nb_LJ": 5, "Emploi_menace_detruit_LJ": 5},
        ])
        with mock.patch("pandas.read_excel", return_value=frame):
            cls.module = build_pcol_module(cls.regions)

    def test_damaged_accents_and_duplicate_region_labels_share_one_scope(self) -> None:
        index = pcol_region_index(self.regions)
        self.assertEqual(index["le-de-france"], "11")
        self.assertEqual(index["ile-de-france"], "11")
        points = self.module["regions"]["11"]["modes"]["all"]["population-entiere"]
        self.assertEqual(points[-1], ["2024-04-01", 6, 47])
        self.assertEqual(points[0], ["2023-04-01", 10, 30])

    def test_national_includes_foreign_records_without_assigning_them_to_a_region(self) -> None:
        national = self.module["national"]["modes"]["all"]["population-entiere"][-1]
        self.assertEqual(national, ["2024-04-01", 15, 60])
        domestic = sum(scope["modes"].get("all", {}).get("population-entiere", [["", 0]])[-1][1] for scope in self.module["regions"].values())
        self.assertEqual(domestic, 11)

    def test_types_and_sectors_add_up_without_double_counting(self) -> None:
        modes = self.module["regions"]["11"]["modes"]
        total = modes["all"]["population-entiere"][-1]
        for value_index in (1, 2):
            self.assertEqual(total[value_index], sum(modes[kind]["population-entiere"][-1][value_index] for kind in ("sj", "rj", "lj")))
            self.assertEqual(total[value_index], sum(points[-1][value_index] for key, points in modes["all"].items() if key != "population-entiere"))

    def test_zero_activity_and_absent_territories_are_distinct(self) -> None:
        construction = self.module["regions"]["11"]["modes"]["all"]["FZ"][-1]
        self.assertEqual(construction, ["2024-04-01", 0, 0])
        self.assertIsNone(self.module["regions"]["06"]["latestDate"])
        self.assertEqual(self.module["regions"]["06"]["modes"], {})
        self.assertEqual(pcol_change(0, 10), -100)
        self.assertIsNone(pcol_change(10, 0))
        self.assertIsNone(pcol_change(10, None))

    def test_rankings_respect_the_procedure_type(self) -> None:
        self.assertEqual([row["key"] for row in self.module["national"]["topSectors"]["all"]], ["FZ", "GZ"])
        safeguard = self.module["national"]["topSectors"]["sj"]
        self.assertEqual([(row["key"], row["nb"]) for row in safeguard], [("GZ", 1)])


if __name__ == "__main__":
    unittest.main()
