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

from barometre_builder.context import build_context
from barometre_builder.page import build_page, render_html
from barometre_builder.publication import (
    APP_SCRIPTS, LEGACY_PAGES, LEGACY_STYLES, MANIFEST_NAME, STYLES,
    assemble_publication, expected_scripts, read_publication, validate_publication,
)
from barometre_builder.publishing import publish_files
from barometre_builder.renderers import RENDERERS
from barometre_builder.topics import TOPICS, project_details_payloads
from tests.test_pages import example_context


def legacy_publication():
    """Ancien agencement à trois pages, avec manifeste et CSP valides."""
    files = dict(assemble_publication(example_context()).files)
    del files["barometre_entreprises.html"]
    del files["assets/js/entreprises.js"]
    files["barometre_details.html"] = files.pop("barometre_emploi.html")
    files["assets/js/details.js"] = files.pop("assets/js/emploi.js")
    for name in LEGACY_PAGES:
        files[name] = files[name].replace(b"barometre_emploi.html", b"barometre_details.html").replace(
            b"barometre_entreprises.html", b"barometre_details.html").replace(b"assets/js/emploi.js", b"assets/js/details.js")
    manifest = json.loads(files[MANIFEST_NAME])
    manifest.update(pages=list(LEGACY_PAGES), styles=LEGACY_STYLES,
                    scripts={name: list(expected_scripts(name, legacy=True)) for name in LEGACY_PAGES})
    manifest["files"] = {name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                         for name, data in files.items() if name != MANIFEST_NAME}
    files[MANIFEST_NAME] = json.dumps(manifest).encode("utf-8")
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
                if topic == "emploi":
                    points = scope(modules["sector"]["regional"]).get("series", {}).get("population-entiere", {}).get("points", [])
                    last = points[-1] if points else {}
                    for key, metric in (("headcount", "effectifs_cvs"), ("payroll", "masse_cvs")):
                        self.assertEqual(hero[key], {"value": last.get(metric), "date": last.get("date")})
                    original_hero = self.context.boot["nationalHero"] if code == "national" else next(r["hero"] for r in self.context.boot["regions"] if r["code"] == code)
                    self.assertEqual(hero["auto"]["value"], original_hero["auto"]["value"])
                else:
                    pcol = scope(modules["pcol"]).get("modes", {}).get("all", {}).get("population-entiere", [])
                    last = pcol[-1] if pcol else [None, None, None]
                    self.assertEqual(hero["pcol"], {"date": last[0], "value": last[1]})
                    self.assertEqual(hero["jobs"], {"date": last[0], "value": last[2]})
                    dpae = scope(modules["dpae"]).get("points", [])
                    last = dpae[-1] if dpae else {}
                    self.assertEqual(hero["dpae"], {"date": last.get("date"), "value": last.get("value")})
                    delai = scope(modules["delai"]).get("modes", {}).get("all", {}).get("ensemble", [])
                    last = delai[-1] if delai else [None, None]
                    self.assertEqual(hero["delai"], {"date": last[0], "value": last[1]})

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
        boot, _ = project_details_payloads(context.boot, context.deferred, topic="entreprises")
        region = boot["regions"][0]
        self.assertEqual(region["hero"]["pcol"]["value"], 0)
        self.assertIsNone(region["hero"]["dpae"]["value"])
        self.assertEqual(region["hero"]["dpae"]["date"], "2026-05-01")
        self.assertEqual(region["hero"]["pcol"]["date"], "2025-04-01")
        self.assertTrue(region["hasData"])

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
            self.assertIn(f'key: "{config.chapter_key}"', html)
            other = "payroll" if topic == "emploi" else "sector"
            self.assertNotIn(f'id="module-{other}"', html)
            self.assertNotIn('function renderPayrollModule' if topic == "emploi" else 'function renderSectorModule', html)
            self.assertNotIn('function renderPcolModule' if topic == "emploi" else 'function renderAutoModule', html)
            self.assertLessEqual(len(html.encode("utf-8")), 4_000_000)
            self.assertLessEqual(len(encoded), 3_000_000)

    def test_navigation_routes_to_the_intended_maps(self):
        html = RENDERERS["index.html"](self.context)
        for label, page in (("Santé des entreprises", "entreprises"), ("Conjoncture de l’emploi", "emploi"), ("Les chiffres du mois", "emploi")):
            self.assertIn(f'href="barometre_{page}.html" aria-label="{label} — En détail"', html)
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
        cls.old = legacy_publication()
        cls.new = assemble_publication(example_context()).files

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
