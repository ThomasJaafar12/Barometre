from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest import mock
from zipfile import ZipFile

from barometre_builder.config import ROOT, OUTPUT_PAGES
from barometre_builder.context import build_context
from barometre_builder.publication import (
    APP_SCRIPTS, DEFERRED_DATA_SCRIPTS, MANIFEST_NAME, STYLES, VENDOR_DIR, assemble_publication,
    expected_scripts, late_detail_scripts, publication_path, read_publication, region_map_preloads,
    strip_security_metadata, validate_publication,
)
from barometre_builder.publishing import publish_files
from barometre_builder.renderers import RENDERERS
from barometre_builder.security import secure_html
from scripts import export_package
from scripts.verify_publication import compare_publication
from tests.test_pages import example_context


class PublicationEquivalenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.context = build_context()
        cls.before = deepcopy(cls.context)
        cls.reference = {name: RENDERERS[name](cls.context) for name in OUTPUT_PAGES}
        cls.publication = assemble_publication(cls.context)

    def test_all_content_styles_scripts_and_data_are_preserved(self):
        compare_publication(self.reference, self.publication.files)

    def test_ingestion_context_is_not_mutated(self):
        self.assertEqual(self.context, self.before)

    def test_published_media_bytes_equal_the_sources(self):
        manifest = json.loads(self.publication.files[MANIFEST_NAME])
        for source, destination in manifest["media"].items():
            self.assertEqual((ROOT / source).read_bytes(), self.publication.files[destination])
        self.assertFalse(any("Data_source" in name or "Geo/" in name for name in self.publication.files))

    def test_local_loading_keeps_script_order_and_security(self):
        region_map = json.loads(self.publication.files[MANIFEST_NAME])["region_map"]
        for name, html in self.publication.pages.items():
            self.assertIn("connect-src &#x27;none&#x27;", html)
            self.assertNotIn('crossorigin="anonymous"', html)
            self.assertNotIn("cdn.jsdelivr.net", html)
            self.assertNotIn('<script type="module"', html)
            expected = expected_scripts(name, region_map=region_map)
            scripts = re.findall(r'<script (?:defer )?src="([^"]+)"></script>', html)
            self.assertEqual(scripts, list(expected))
            if name in DEFERRED_DATA_SCRIPTS:
                for path in late_detail_scripts(name):
                    self.assertIn(f'<script defer src="{path}"></script>', html)
            app = APP_SCRIPTS[name]
            if app:
                self.assertNotIn("fetch(", self.publication.files[app].decode("utf-8"))

    def test_combined_html_and_application_assets_keep_historical_budget(self):
        region_map = json.loads(self.publication.files[MANIFEST_NAME])["region_map"]
        for name, data_path in DEFERRED_DATA_SCRIPTS.items():
            with self.subTest(page=name):
                total = sum(len(self.publication.files[path])
                            for path in (name, STYLES[name], APP_SCRIPTS[name], data_path, region_map))
                self.assertLessEqual(total, 4_000_000)

    def test_regional_geometry_is_published_once_and_used_before_late_scripts(self):
        files = self.publication.files
        manifest = json.loads(files[MANIFEST_NAME])
        self.assertEqual(manifest["version"], 3)
        path = manifest["region_map"]
        digest = hashlib.sha256(files[path]).hexdigest()[:16]
        self.assertEqual(path, f"assets/js/region-map-{digest}.js")
        self.assertEqual([name for name in files if name.startswith("assets/js/region-map-")], [path])
        self.assertIn(path, self.publication.pages["index.html"])
        for page in DEFERRED_DATA_SCRIPTS:
            with self.subTest(page=page):
                html = self.publication.pages[page]
                boot = json.loads(re.search(r"window\.BAROMETRE_BOOT = (.*);$", html, re.M)[1])
                self.assertNotIn("regions", boot.get("geography", {}))
                self.assertIn(region_map_preloads(path), html.split("</head>")[0])
                mount = html.index(f'<script src="{path}"></script>')
                self.assertLess(html.index('id="landingMap"'), mount)
                self.assertLess(mount, html.index('id="story"'))
                self.assertLess(mount, html.index(f'<script defer src="{APP_SCRIPTS[page]}"></script>'))

    def test_detail_pages_reference_their_data_without_loading_it_during_parsing(self):
        for name, data_path in DEFERRED_DATA_SCRIPTS.items():
            with self.subTest(page=name):
                html = self.publication.pages[name]
                self.assertIn(f'window.BAROMETRE_DEFERRED_SRC = "{data_path}";', html)
                self.assertNotIn("window.BAROMETRE_DEFERRED_GZIP =", html)
                self.assertNotIn(f'<script src="{data_path}"', html)

    def test_resource_tampering_is_rejected(self):
        for path in ("assets/js/brief.js", "assets/css/details.css", "assets/vendor/d3.min.js",
                     DEFERRED_DATA_SCRIPTS["barometre_emploi.html"]):
            files = dict(self.publication.files)
            files[path] += b"tampered"
            with self.subTest(path=path), self.assertRaises(ValueError):
                validate_publication(files)

    def test_validation_enforces_the_data_script_contract_after_hash_checks(self):
        page = "barometre_emploi.html"
        data_path = DEFERRED_DATA_SCRIPTS[page]
        other_data_path = DEFERRED_DATA_SCRIPTS["barometre_entreprises.html"]
        html = strip_security_metadata(self.publication.pages[page]).replace(data_path, other_data_path)
        wrong_source = secure_html(html, page, local_scripts=True).encode("utf-8")
        extra_code = self.publication.files[data_path] + b"window.unexpected = true;\n"
        for path, content in ((page, wrong_source), (data_path, extra_code)):
            with self.subTest(path=path):
                files = dict(self.publication.files)
                files[path] = content
                manifest = json.loads(files[MANIFEST_NAME])
                manifest["files"][path] = {"sha256": hashlib.sha256(content).hexdigest(), "size": len(content)}
                files[MANIFEST_NAME] = json.dumps(manifest).encode("utf-8")
                with self.assertRaises(ValueError):
                    validate_publication(files)

    def test_manifest_cannot_authorize_an_additional_script(self):
        files = dict(self.publication.files)
        manifest = json.loads(files[MANIFEST_NAME])
        manifest["scripts"]["index.html"].append("assets/js/untrusted.js")
        files[MANIFEST_NAME] = json.dumps(manifest).encode()
        with self.assertRaises(ValueError):
            validate_publication(files)

    def test_vendor_is_checked_without_network_access(self):
        with tempfile.TemporaryDirectory() as directory:
            vendor = Path(directory)
            for source in VENDOR_DIR.iterdir():
                (vendor / source.name).write_bytes(source.read_bytes())
            (vendor / "d3.min.js").write_bytes(b"incorrect")
            with mock.patch("barometre_builder.publication.VENDOR_DIR", vendor), self.assertRaisesRegex(ValueError, "empreinte"):
                assemble_publication(self.context)

    def test_unsafe_publication_paths_are_rejected(self):
        for path in ("assets/../secret", "assets/%2e%2e/secret", "assets/a\\b", "/outside",
                     "Assets/logo/x.png", "https://example.org/x.js", "assets/x.js?query"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                publication_path(path)


class PublicationTransactionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        context = example_context()
        cls.old = assemble_publication(context).files
        context.boot["meta"]["publicationDateLabel"] = "25 juin 2026"
        cls.new = assemble_publication(context).files

    def test_failed_replacement_restores_every_previous_byte(self):
        import os
        original_replace = os.replace

        def fail_during_commit(source, target):
            if ".barometre-stage-" in str(source) and "backup" not in str(source) and Path(target).name == "barometre_emploi.html":
                raise OSError("Échec simulé de publication")
            return original_replace(source, target)

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "dist"
            publish_files(self.old, output)
            unrelated = output / "Maquette existante"
            unrelated.mkdir()
            (unrelated / "conserver.txt").write_text("préservé", encoding="utf-8")
            with mock.patch("barometre_builder.publishing.os.replace", side_effect=fail_during_commit), self.assertRaises(OSError):
                publish_files(self.new, output)
            self.assertEqual(read_publication(output), self.old)
            self.assertEqual((unrelated / "conserver.txt").read_text(encoding="utf-8"), "préservé")
            self.assertFalse(list(Path(directory).glob(".barometre-stage-*")))

    def test_invalid_stage_preserves_existing_site(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "dist"
            publish_files(self.old, output)
            files = dict(self.new)
            files["assets/js/emploi.js"] = b"invalid"
            with self.assertRaises(ValueError):
                publish_files(files, output)
            self.assertEqual(read_publication(output), self.old)

    def test_exported_zip_can_be_extracted_and_verified_with_spaces(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(export_package, "ROOT", Path(directory)):
            output = Path(directory) / "exports/paquet avec espaces"
            publish_files(self.new, output)
            archive = export_package.create_zip(output)
            extracted = Path(directory) / "lecture avec espaces"
            with ZipFile(archive) as zip_file:
                self.assertIn("index.html", zip_file.namelist())
                zip_file.extractall(extracted)
            self.assertEqual(read_publication(extracted), self.new)

    def test_invalid_source_does_not_replace_existing_zip(self):
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(export_package, "ROOT", Path(directory)):
            output = Path(directory) / "exports/package"
            publish_files(self.old, output)
            archive = export_package.create_zip(output)
            original = archive.read_bytes()
            (output / "assets/css/shared.css").write_bytes(b"changed")
            with self.assertRaises(ValueError):
                export_package.create_zip(output)
            self.assertEqual(archive.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
