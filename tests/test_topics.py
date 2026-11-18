from copy import deepcopy
import base64
import gzip
import hashlib
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest import mock

from barometre_builder.config import OUTPUT_PAGES
from barometre_builder.context import build_context
from barometre_builder.page import build_page, render_html
from barometre_builder.publication import (
    APP_SCRIPTS, DEFERRED_DATA_SCRIPTS, LEGACY_PAGES, LEGACY_STYLES, MANIFEST_NAME, PREVIOUS_PAGES, STYLES,
    assemble_publication, expected_scripts, read_publication, strip_security_metadata, validate_publication,
)
from barometre_builder.publishing import publish_files
from barometre_builder.renderers import RENDERERS
from barometre_builder.security import secure_html
from barometre_builder.topics import TOPICS, project_details_payloads
from scripts.verify_publication import restore_inline_map, restore_inline_payload
from tests.test_pages import example_context


def adjust_layout_manifest(files, pages, styles, *, legacy=False, version=1):
    manifest = json.loads(files[MANIFEST_NAME])
    manifest.pop("region_map", None)
    manifest.update(version=version, pages=list(pages), styles=styles,
                    scripts={name: list(expected_scripts(name, legacy=legacy)) for name in pages})
    manifest["files"] = {name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                         for name, data in files.items() if name != MANIFEST_NAME}
    files[MANIFEST_NAME] = json.dumps(manifest).encode("utf-8")


def inline_map_publication(current):
    """Publication avec une carte intégrée et des fichiers de données différés."""
    files = dict(current)
    manifest = json.loads(files[MANIFEST_NAME])
    for page in OUTPUT_PAGES:
        html = strip_security_metadata(files[page].decode("utf-8"))
        html = restore_inline_map(page, html, files, manifest)
        files[page] = secure_html(html, page, local_scripts=True).encode("utf-8")
    del files[manifest["region_map"]]
    adjust_layout_manifest(files, OUTPUT_PAGES, STYLES, version=2)
    return files


def inline_data_publication(current):
    """Publication à cinq pages avant le chargement différé des fichiers de données."""
    files = inline_map_publication(current)
    for page, path in DEFERRED_DATA_SCRIPTS.items():
        html = strip_security_metadata(files[page].decode("utf-8"))
        html = restore_inline_payload(page, html, files)
        files[page] = secure_html(html, page, local_scripts=True).encode("utf-8")
        del files[path]
    adjust_layout_manifest(files, OUTPUT_PAGES, STYLES)
    return files


def previous_publication(current):
    """Publication à quatre pages, avant le détail des chiffres du mois."""
    files = inline_data_publication(current)
    name = "barometre_chiffres.html"
    for path in (name, APP_SCRIPTS[name], STYLES[name]):
        del files[path]
    for page in PREVIOUS_PAGES:
        files[page] = files[page].replace(b"barometre_chiffres.html", b"barometre_emploi.html")
    adjust_layout_manifest(files, PREVIOUS_PAGES, {page: STYLES[page] for page in PREVIOUS_PAGES})
    return files


def legacy_publication(current):
    """Ancien agencement à trois pages, avec manifeste et CSP valides."""
    files = previous_publication(current)
    del files["barometre_entreprises.html"]
    del files["assets/js/entreprises.js"]
    files["barometre_details.html"] = files.pop("barometre_emploi.html")
    files["assets/js/details.js"] = files.pop("assets/js/emploi.js")
    for name in LEGACY_PAGES:
        files[name] = files[name].replace(b"barometre_emploi.html", b"barometre_details.html").replace(
            b"barometre_entreprises.html", b"barometre_details.html").replace(b"assets/js/emploi.js", b"assets/js/details.js")
    adjust_layout_manifest(files, LEGACY_PAGES, LEGACY_STYLES, legacy=True)
    validate_publication(files, allow_legacy=True)
    return files


class TopicProjectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = build_context()

    def test_heroes_match_the_actual_chart_series_and_periods(self):
        modules = self.context.deferred["modules"]
        for topic in TOPICS:
            boot, deferred = project_details_payloads(self.context.boot, self.context.deferred, topic=topic)
            self.assertEqual(set(deferred["modules"]), set(TOPICS[topic].modules))
            heroes = {"national": boot["nationalHero"], **{r["code"]: r["hero"] for r in boot["regions"]}}
            for code in ("national", "75", "04", "06"):
                def scope(module):
                    return module.get("national", {}) if code == "national" else module.get("regions", {}).get(code, {})
                hero = heroes[code]
                if topic == "chiffres":
                    detailed_scopes = deferred["modules"]["chiffres"]["scopes"]
                    for key, series in detailed_scopes[code].items():
                        latest = series["points"][-1] if series["points"] else {}
                        self.assertEqual(hero[key], {field: latest.get(field) for field in ("date", "value", "yearlyChange")})
                        brief_series = self.context.brief["scopes"][code][key]
                        brief_points = brief_series["points"]
                        self.assertEqual(series["points"][-len(brief_points):], brief_points)
                        self.assertEqual(series.get("coverageNote"), brief_series.get("coverageNote"))
                elif topic == "emploi":
                    points = scope(modules["sector"]["regional"]).get("series", {}).get("population-entiere", {}).get("points", [])
                    last = points[-1] if points else {}
                    for key, metric, variation in (("headcount", "effectifs_cvs", "effectifs_yoy"), ("payroll", "masse_cvs", "masse_yoy")):
                        self.assertEqual(hero[key], {"value": last.get(metric), "date": last.get("date"), "yearlyChange": last.get(variation)})
                    original_hero = self.context.boot["nationalHero"] if code == "national" else next(r["hero"] for r in self.context.boot["regions"] if r["code"] == code)
                    self.assertEqual(hero["auto"]["value"], original_hero["auto"]["value"])
                else:
                    pcol = scope(modules["pcol"]).get("modes", {}).get("all", {}).get("population-entiere", [])
                    dpae = scope(modules["dpae"]).get("points", [])
                    delai = scope(modules["delai"]).get("modes", {}).get("all", {}).get("ensemble", [])
                    for key, series in (
                        ("pcol", {p[0]: p[1] for p in pcol}), ("jobs", {p[0]: p[2] for p in pcol}),
                        ("dpae", {p["date"]: p["value"] for p in dpae}), ("delai", {p[0]: p[1] for p in delai}),
                    ):
                        date = max(series, default=None)
                        value = series.get(date)
                        prior = series.get(f"{int(date[:4]) - 1}{date[4:]}") if date else None
                        change = (value / prior - 1) * 100 if value is not None and prior else None
                        self.assertEqual(hero[key], {"date": date, "value": value, "yearlyChange": change})

    def test_partial_data_in_mayotte_is_available_for_health(self):
        boot, _ = project_details_payloads(self.context.boot, self.context.deferred, topic="entreprises")
        mayotte = next(r for r in boot["regions"] if r["code"] == "06")
        self.assertTrue(mayotte["hasData"])
        self.assertTrue(mayotte["hasPartialData"])
        self.assertIsNone(mayotte["hero"]["pcol"]["value"])
        self.assertGreater(mayotte["hero"]["delai"]["value"], 0)

    def test_zero_missing_nonfinite_and_different_periods(self):
        context = example_context()
        context.deferred["modules"]["pcol"]["regions"]["11"]["modes"]["all"]["population-entiere"][-1][1] = 0
        context.deferred["modules"]["dpae"]["regions"]["11"] = {"points": [{"date": "2026-05-01", "value": float("nan")}]}
        for topic in ("chiffres", "entreprises"):
            boot, _ = project_details_payloads(context.boot, context.deferred, topic=topic)
            region = boot["regions"][0]
            self.assertEqual(region["hero"]["pcol"]["value"], 0)
            self.assertIsNone(region["hero"]["dpae"]["value"])
            self.assertEqual(region["hero"]["dpae"]["date"], "2026-05-01")
            self.assertEqual(region["hero"]["pcol"]["date"], "2025-04-01")
            self.assertTrue(region["hasData"])

    def test_monthly_detail_preserves_full_history_when_other_modules_are_missing(self):
        context = example_context()
        points = [
            {"date": f"{year}-{month:02d}-01", "effectifs_cvs": year, "masse_cvs": 0}
            for year in range(2013, 2026) for month in (1, 4, 7, 10)
        ]
        sector = {"series": {"population-entiere": {"points": points}}}
        deferred = {"modules": {"sector": {"regional": {"national": sector}}}}
        boot, projection = project_details_payloads(context.boot, deferred, topic="chiffres")
        national = projection["modules"]["chiffres"]["scopes"]["national"]
        self.assertEqual(len(national["headcount"]["points"]), len(points))
        self.assertEqual(national["headcount"]["points"][0]["date"], "2013-01-01")
        self.assertEqual(national["dpae"]["points"], [])
        self.assertEqual(boot["nationalHero"]["payroll"], {"value": 0, "date": "2025-10-01", "yearlyChange": None})
        self.assertTrue(all(not region["hasData"] for region in boot["regions"]))

    def test_projection_does_not_mutate_shared_context(self):
        before = deepcopy(self.context)
        for topic in TOPICS:
            project_details_payloads(self.context.boot, self.context.deferred, topic=topic)
        self.assertEqual(before, self.context)

    def test_each_page_contains_only_its_chapter_scripts_and_payload(self):
        for topic, config in TOPICS.items():
            html = render_html(self.context.boot, self.context.deferred, topic=topic)
            encoded = re.search(r'BAROMETRE_DEFERRED_GZIP = "([^"]+)"', html)[1]
            deferred = json.loads(gzip.decompress(base64.b64decode(encoded)))
            self.assertEqual(set(deferred["modules"]), set(config.modules))
            self.assertIn(f'<body data-topic="{topic}">', html)
            self.assertIn(f'id="module-{config.chapter_key}"', html)
            self.assertNotIn('class="section-head"', html)
            for other in TOPICS.values():
                if other.key != topic:
                    self.assertNotIn(f'id="module-{other.chapter_key}"', html)
            for script_topic, signature in (
                ("chiffres", "function renderChiffresModule"),
                ("emploi", "function renderSectorModule"),
                ("emploi", "function renderAutoModule"),
                ("entreprises", "function renderPayrollModule"),
                ("entreprises", "function renderPcolModule"),
            ):
                self.assertEqual(signature in html, script_topic == topic)
            self.assertLessEqual(len(html.encode("utf-8")), 4_000_000)
            self.assertLessEqual(len(encoded), 3_000_000)

    def test_navigation_routes_to_the_intended_maps(self):
        html = RENDERERS["index.html"](self.context)
        for label, page in (("Santé des entreprises", "entreprises"), ("Conjoncture de l’emploi", "emploi"), ("Les chiffres du mois", "chiffres")):
            self.assertIn(f'href="barometre_{page}.html" aria-label="{label} — En détail"', html)
            brief_route = "barometre_bref.html" if page == "chiffres" else f"barometre_bref.html?rubrique={page}"
            self.assertIn(f'href="{brief_route}" aria-label="{label} — En bref"', html)
        for renderer in RENDERERS.values():
            self.assertNotIn('href="barometre_details.html"', renderer(self.context))

    def test_topic_argument_and_default_return(self):
        with mock.patch("barometre_builder.page.build_pages", return_value={"barometre_emploi.html": "emploi", "barometre_entreprises.html": "santé"}) as build:
            self.assertEqual(build_page(), "emploi")
            self.assertEqual(build_page(topic="entreprises"), "santé")
            self.assertEqual(build.call_count, 2)
            with self.assertRaises(ValueError):
                build_page(topic="inconnu")
            self.assertEqual(build.call_count, 2)
        with self.assertRaises(ValueError):
            render_html(self.context.boot, self.context.deferred, topic="inconnu")


class LegacyMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.new = assemble_publication(example_context()).files
        cls.old = legacy_publication(cls.new)

    def test_five_page_publication_with_inline_data_remains_valid(self):
        previous = inline_data_publication(self.new)
        self.assertEqual(validate_publication(previous)["version"], 1)

    def test_five_page_publication_with_inline_map_remains_valid(self):
        previous = inline_map_publication(self.new)
        self.assertEqual(validate_publication(previous)["version"], 2)

    def test_four_page_publication_can_be_replaced(self):
        previous = previous_publication(self.new)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name, data in previous.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            self.assertEqual(read_publication(root, allow_legacy=True), previous)
            publish_files(self.new, root)
            self.assertEqual(read_publication(root), self.new)

    def test_legacy_layout_is_only_accepted_explicitly(self):
        with self.assertRaises(ValueError):
            validate_publication(self.old)
        validate_publication(self.old, allow_legacy=True)
        files = dict(self.old)
        files["assets/js/details.js"] += b"tampered"
        with self.assertRaises(ValueError):
            validate_publication(files, allow_legacy=True)

    def test_migration_removes_owned_old_files_and_preserves_unrelated_content(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name, data in self.old.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            (root / "conserver.txt").write_text("préservé", encoding="utf-8")
            publish_files(self.new, root)
            self.assertEqual(read_publication(root), self.new)
            self.assertFalse((root / "barometre_details.html").exists())
            self.assertFalse((root / "assets/js/details.js").exists())
            self.assertEqual((root / "conserver.txt").read_text(encoding="utf-8"), "préservé")

    def test_failed_migration_restores_legacy_publication(self):
        import os
        replace = os.replace

        def fail(source, target):
            if ".barometre-stage-" in str(source) and "backup" not in str(source) and Path(target).name == "barometre_emploi.html":
                raise OSError("Échec simulé")
            return replace(source, target)

        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name, data in self.old.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            with mock.patch("barometre_builder.publishing.os.replace", side_effect=fail), self.assertRaises(OSError):
                publish_files(self.new, root)
            self.assertEqual(read_publication(root, allow_legacy=True), self.old)
            self.assertFalse((root / "barometre_emploi.html").exists())
