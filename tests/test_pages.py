from __future__ import annotations

import base64
import gzip
import hashlib
from contextlib import redirect_stderr, redirect_stdout
from html import unescape
from io import StringIO
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest import mock

import pandas as pd

from barometre_builder.brief import build_bref_payload, indicator_series
from barometre_builder.context import BuildContext, build_context
from barometre_builder.dpae import build_dpae_module, compact_dpae_payload
from barometre_builder.dependencies import PAGE_DEPENDENCIES, SCRIPTS
from barometre_builder import page
from barometre_builder.renderers import RENDERERS
from barometre_builder.renderers.common import render_template
from barometre_builder.security import local_asset_url, script_json, validate_html
from barometre_builder.utils import gzip_base64_json, relative_asset
from scripts import build_mail_pack


class FrenchCommandTests(unittest.TestCase):
    def test_help_and_argument_errors_are_french(self):
        cases = [(["--help"], 0, "Afficher cette aide"), (["--inconnu"], 2, "Arguments inconnus"),
                 (["--html"], 2, "nécessite une valeur"), (["--zip=oui"], 2, "n’accepte pas de valeur")]
        for arguments, code, expected in cases:
            with self.subTest(arguments=arguments):
                output = StringIO()
                with mock.patch("sys.argv", ["build_mail_pack.py", *arguments]), redirect_stdout(output), redirect_stderr(output), self.assertRaises(SystemExit) as result:
                    build_mail_pack.parse_args()
                self.assertEqual(result.exception.code, code)
                self.assertIn(expected, output.getvalue())
                self.assertIn("Utilisation :", output.getvalue())
                self.assertNotIn("error:", output.getvalue())


def example_context() -> BuildContext:
    boot = {
        "meta": {"publicationDateLabel": "24 juin 2026", "publicationIssueNumber": "189"},
        "assets": {"logo": "Assets/logo/Urssaf_blanc.png", "videos": {"placeholder": "Assets/Mp4/placeholder.mp4", "byRegion": {}}},
        "regions": [{"code": "11", "name": "Île-de-France"}, {"code": "06", "name": "Mayotte"}],
    }
    points = [{"date": "2024-12-31", "masse_cvs": 100, "effectifs_cvs": 20}, {"date": "2025-12-31", "masse_cvs": 110, "effectifs_cvs": 22}]
    sector = {"series": {"population-entiere": {"points": points}}}
    pcol = {"modes": {"all": {"population-entiere": [["2024-04-01", 10, 20], ["2025-04-01", 8, 12]]}}}
    deferred = {"modules": {"sector": {"regional": {"national": sector, "regions": {"11": sector}}}, "pcol": {"national": pcol, "regions": {"11": pcol}}}}
    dpae = {"national": {"points": [{"date": "2025-05-01", "value": 30}, {"date": "2026-05-01", "value": 33}]}, "regions": {}, "coveredRegions": ["11"]}
    deferred["modules"]["dpae"] = dpae
    return BuildContext(boot, deferred, build_bref_payload(boot, deferred, dpae))


class DpaeTests(unittest.TestCase):
    regions = {"84": {"name": "Auvergne-Rhône-Alpes"}, "04": {"name": "La Réunion"}, "06": {"name": "Mayotte"}}

    def frame(self):
        return pd.DataFrame([
            {"nouvelle_region": "Auvergne-Rh�ne-Alpes", "date_embauche": "2025-05-01", "due_cdi": 10, "due_cddlong": 20, "due_cddcourt": 30, "due_long": 30},
            {"nouvelle_region": "Auvergne-Rh�ne-Alpes", "date_embauche": "2026-05-01", "due_cdi": 20, "due_cddlong": 30, "due_cddcourt": 40, "due_long": 50},
            {"nouvelle_region": "Auvergne-Rhône-Alpes", "date_embauche": "2026-05-01", "due_cdi": 1, "due_cddlong": 2, "due_cddcourt": 3, "due_long": 3},
            {"nouvelle_region": "R�union", "date_embauche": "2026-05-01", "due_cdi": 0, "due_cddlong": 0, "due_cddcourt": 0, "due_long": 0},
        ])

    def build(self, frame=None):
        with mock.patch("pandas.read_excel", return_value=self.frame() if frame is None else frame):
            return build_dpae_module(self.regions)

    def test_all_contracts_and_former_regions_are_aggregated_once(self):
        module = self.build()
        self.assertEqual(module["regions"]["84"]["points"][-1]["value"], 96)
        self.assertEqual(module["national"]["points"][-1]["value"], 96)
        self.assertEqual(module["coveredRegions"], ["04", "84"])

    def test_contract_breakdown_and_long_contracts_reconcile_with_total(self):
        module = self.build()
        regional = module["regions"]["84"]["points"][-1]
        self.assertEqual([regional[key] for key in ("cdi", "cddlong", "cddcourt")], [21, 32, 43])
        self.assertEqual(regional["long"], 53)
        self.assertEqual(regional["value"], regional["long"] + regional["cddcourt"])
        self.assertEqual(module["national"]["points"][-1]["long"], regional["long"])

    def test_missing_short_contracts_preserve_available_long_contracts(self):
        frame = self.frame()
        frame.loc[1, "due_cddcourt"] = float("nan")
        point = self.build(frame)["regions"]["84"]["points"][-1]
        self.assertIsNone(point["value"])
        self.assertIsNone(point["cddcourt"])
        self.assertEqual(point["long"], 53)
        self.assertEqual(point["cdi"], 21)

    def test_embedded_history_keeps_prior_year_without_mutating_source(self):
        module = self.build()
        source = module["regions"]["84"]["points"]
        source[:0] = [{"date": "2012-01-01", "value": 60, "long": 30},
                      {"date": "2013-01-01", "value": 60, "long": 30}]
        compact = compact_dpae_payload(module)
        self.assertEqual(compact["regions"]["84"]["points"][0]["date"], "2013-01-01")
        self.assertNotIn("long", compact["regions"]["84"]["points"][-1])
        self.assertEqual(source[0]["date"], "2012-01-01")
        self.assertEqual(source[-1]["long"], 53)

    def test_zero_and_missing_territory_are_distinct(self):
        module = self.build()
        self.assertEqual(module["regions"]["04"]["points"][-1]["value"], 0)
        self.assertNotIn("06", module["regions"])

    def test_missing_contract_value_does_not_produce_partial_total(self):
        frame = self.frame()
        frame.loc[1, "due_cdi"] = float("nan")
        module = self.build(frame)
        self.assertIsNone(module["regions"]["84"]["points"][-1]["value"])
        self.assertIsNone(module["national"]["points"][-1]["value"])

    def test_invalid_region_date_or_number_is_rejected(self):
        for field, value in [("nouvelle_region", "Région inconnue"), ("date_embauche", "invalide"), ("due_cdi", -1), ("due_cdi", float("inf"))]:
            frame = self.frame().astype(object)
            frame.loc[0, field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.build(frame)

    def test_unreadable_or_empty_workbook_is_rejected(self):
        with mock.patch("pandas.read_excel", side_effect=FileNotFoundError()), self.assertRaisesRegex(ValueError, "fichier DPAE"):
            build_dpae_module(self.regions)
        with self.assertRaises(ValueError):
            self.build(self.frame().iloc[:0])


class BriefProjectionTests(unittest.TestCase):
    def test_shared_indicators_retain_detailed_values_and_periods(self):
        context = example_context()
        scopes = context.brief["scopes"]
        self.assertEqual(scopes["national"]["payroll"]["points"][-1]["value"], 110)
        self.assertEqual(scopes["national"]["headcount"]["points"][-1]["value"], 22)
        self.assertEqual(scopes["national"]["pcol"]["points"][-1]["value"], 8)
        self.assertIn("Mayotte", scopes["national"]["dpae"]["coverageNote"])
        self.assertTrue(all(not series["points"] for series in scopes["06"].values()))

    def test_annual_comparison_uses_calendar_period_and_not_previous_observation(self):
        result = indicator_series([{"date": "2024-05-01", "value": 100}, {"date": "2025-04-01", "value": 500}, {"date": "2025-05-01", "value": 110}], "month")
        self.assertAlmostEqual(result["points"][-1]["yearlyChange"], 10)
        self.assertIsNone(result["points"][-2]["yearlyChange"])

    def test_comparisons_are_computed_before_windowing(self):
        points = [{"date": f"{year}-{month:02d}-01", "value": year} for year in range(2010, 2026) for month in range(1, 13)]
        monthly = indicator_series(points, "month")["points"]
        self.assertEqual(len(monthly), 121)
        self.assertEqual((monthly[0]["date"], monthly[-1]["date"]), ("2015-12-01", "2025-12-01"))
        self.assertAlmostEqual(monthly[0]["yearlyChange"], (2015 / 2014 - 1) * 100)
        quarters = [point for point in points if point["date"][5:7] in ("03", "06", "09", "12")]
        quarterly = indicator_series(quarters, "quarter")["points"]
        self.assertEqual(len(quarterly), 41)
        self.assertEqual((quarterly[0]["date"], quarterly[-1]["date"]), ("2015-12-01", "2025-12-01"))
        self.assertAlmostEqual(quarterly[0]["yearlyChange"], (2015 / 2014 - 1) * 100)

    def test_missing_and_zero_denominators_are_unavailable(self):
        for previous in (0, None):
            result = indicator_series([{"date": "2024-05-01", "value": previous}, {"date": "2025-05-01", "value": 1}], "month")
            self.assertIsNone(result["points"][-1]["yearlyChange"])


class PageSecurityTests(unittest.TestCase):
    def test_three_renderers_have_expected_dependencies_and_french_metadata(self):
        context = example_context()
        for name, renderer in RENDERERS.items():
            html = renderer(context)
            validate_html(html, name)
            self.assertIn('lang="fr"', html)
            self.assertIn("24 juin 2026", html)
            self.assertEqual(html.count('crossorigin="anonymous"'), len(PAGE_DEPENDENCIES[name]))

    def test_policy_hashes_match_every_inline_script(self):
        html = RENDERERS["barometre_bref.html"](example_context())
        policy = unescape(re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', html)[1])
        for attrs, body in re.findall(r"<script\b([^>]*)>(.*?)</script>", html, re.S):
            if "src=" not in attrs:
                digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
                self.assertIn(f"'sha256-{digest}'", policy)
        self.assertNotIn("unsafe-eval", policy)
        self.assertNotIn("unsafe-inline", policy.split("script-src ")[1].split(";")[0])

    def test_script_and_attribute_injection_remain_literal_text(self):
        attack = '</script><script>window.injection=true</script><img src=x onerror="alert(1)">\u2028&'
        encoded = script_json({"label": attack})
        self.assertNotIn("<", encoded)
        self.assertEqual(json.loads(encoded)["label"], attack)
        context = example_context()
        context.boot["meta"]["publicationDateLabel"] = attack
        for name, renderer in RENDERERS.items():
            html = renderer(context)
            self.assertNotIn("<script>window.injection", html)
            self.assertNotIn("<img src=x", html)
            validate_html(html, name)

    def test_template_data_is_not_reinterpreted_as_placeholders(self):
        self.assertEqual(render_template("__FIRST__ __SECOND__", {"__FIRST__": "__SECOND__", "__SECOND__": "valeur"}), "__SECOND__ valeur")

    def test_untrusted_scripts_and_handlers_are_rejected(self):
        html = RENDERERS["index.html"](example_context())
        for attack in ['<script src="https://example.org/code.js"></script>', '<img src="x" onerror="alert(1)">', '<a href="javascript:alert(1)">lien</a>']:
            with self.subTest(attack=attack), self.assertRaises(ValueError):
                validate_html(html.replace("</body>", attack + "</body>"), "index.html")

    def test_unsafe_asset_paths_are_rejected(self):
        for value in ["Assets/../secret", "Assets/%2e%2e/secret", "Assets/%252e%252e/secret", "Assets/a\\b", "https://example.org/a", "//example.org/a", "Assets/a?b", "Assets/a\x00", 'Assets/a"b']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                local_asset_url(value)
        self.assertEqual(local_asset_url("Assets/logo/logo.png"), "Assets/logo/logo.png")
        with self.assertRaises(ValueError):
            relative_asset(Path(tempfile.gettempdir()) / "secret.png")

    def test_compression_is_lossless_and_deterministic(self):
        value = {"nom": "Île-de-France", "points": [1, 2.5, None]}
        encoded = gzip_base64_json(value)
        self.assertEqual(json.loads(gzip.decompress(base64.b64decode(encoded))), value)
        self.assertEqual(encoded, gzip_base64_json(value))


class OrchestrationTests(unittest.TestCase):
    def test_shared_payloads_and_dpae_are_built_once(self):
        context = example_context()
        with mock.patch("barometre_builder.context.build_payloads", return_value=(context.boot, context.deferred)) as payloads, mock.patch("barometre_builder.context.build_bref_payload", wraps=build_bref_payload) as brief:
            result = build_context()
        payloads.assert_called_once()
        brief.assert_called_once_with(context.boot, context.deferred, context.deferred["modules"]["dpae"])
        self.assertIs(result.deferred["modules"]["dpae"], context.deferred["modules"]["dpae"])

    def test_dpae_workbook_is_read_once_for_both_readings(self):
        context = example_context()
        module = context.deferred["modules"]["dpae"]
        regions = {region["code"]: region for region in context.boot["regions"]}
        bundle = {"videos": context.boot["assets"]["videos"], "modules": context.deferred["modules"]}
        hero = {"regions": context.boot["regions"], "national": {}}
        with mock.patch("barometre_builder.payloads.build_geographies", return_value=({}, {}, regions)), \
             mock.patch("barometre_builder.payloads.build_modules", return_value=(bundle, hero)), \
             mock.patch("barometre_builder.payloads.build_dpae_module", return_value=module) as prepare:
            result = build_context()
        prepare.assert_called_once()
        self.assertEqual(result.deferred["modules"]["dpae"], compact_dpae_payload(module))
        self.assertEqual(result.brief["scopes"]["national"]["dpae"]["points"][-1]["value"], module["national"]["points"][-1]["value"])

    def test_build_writes_three_validated_outputs(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(page, "ROOT", Path(directory)), mock.patch.object(page, "build_context", return_value=example_context()):
            result = page.build_pages()
            self.assertEqual(set(result), set(RENDERERS))
            for name, html in result.items():
                self.assertEqual((Path(directory) / name).read_text(encoding="utf-8"), html)
            self.assertFalse(list(Path(directory).glob("*.tmp")))

    def test_invalid_render_does_not_replace_existing_outputs(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(page, "ROOT", Path(directory)), mock.patch.object(page, "build_context", return_value=example_context()):
            index = Path(directory) / "index.html"
            index.write_text("version précédente", encoding="utf-8")
            with mock.patch.object(page, "validate_html", side_effect=ValueError("Rendu invalide")), self.assertRaises(ValueError):
                page.build_pages()
            self.assertEqual(index.read_text(encoding="utf-8"), "version précédente")

    def test_compatibility_function_returns_detailed_html(self):
        with mock.patch.object(page, "build_pages", return_value={"barometre_details.html": "détails"}):
            self.assertEqual(page.build_page(), "détails")


class MailPackSecurityTests(unittest.TestCase):
    def test_pack_includes_linked_pages_and_assets(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(build_mail_pack, "ROOT", Path(directory)):
            root = Path(directory)
            (root / "Assets/logo").mkdir(parents=True)
            (root / "Assets/logo/logo.png").write_bytes(b"logo")
            (root / "index.html").write_text('<a href="barometre_bref.html">Bref</a><a href="barometre_details.html">Détails</a>', encoding="utf-8")
            (root / "barometre_bref.html").write_text('<img src="Assets/logo/logo.png">')
            (root / "barometre_details.html").write_text('<a href="index.html">Accueil</a>')
            output = root / "dist/mail_pack"
            copied, missing = build_mail_pack.copy_pack(root / "index.html", output, None)
            self.assertFalse(missing)
            self.assertTrue(all((output / name).is_file() for name in RENDERERS))
            self.assertIn(Path("Assets/logo/logo.png"), copied)
            self.assertTrue(build_mail_pack.create_zip(output).is_file())

    def test_output_must_be_below_dist(self):
        for value in [build_mail_pack.ROOT, build_mail_pack.ROOT / "dist", build_mail_pack.ROOT / "dist/../../outside", Path(tempfile.gettempdir()) / "mail_pack"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                build_mail_pack.checked_output_dir(value)

    def test_asset_traversal_is_rejected(self):
        with self.assertRaises(ValueError):
            build_mail_pack.extract_local_assets('<img src="Assets/../../secret">')

    def test_missing_assets_do_not_delete_existing_pack(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(build_mail_pack, "ROOT", Path(directory)):
            root = Path(directory)
            (root / "index.html").write_text('<img src="Assets/missing.png">')
            output = root / "dist/mail_pack"
            output.mkdir(parents=True)
            (output / "previous.txt").write_text("préservé", encoding="utf-8")
            with self.assertRaises(ValueError):
                build_mail_pack.copy_pack(root / "index.html", output, None)
            self.assertTrue((output / "previous.txt").exists())


if __name__ == "__main__":
    unittest.main()
