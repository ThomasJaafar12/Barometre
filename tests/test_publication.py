from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
from zipfile import ZipFile

from barometre_builder.config import ROOT, OUTPUT_PAGES
from barometre_builder.context import build_context
from barometre_builder.publication import (
    APP_SCRIPTS, MANIFEST_NAME, STYLES, VENDOR_DIR, assemble_publication,
    expected_scripts, publication_path, read_publication, validate_publication,
)
from barometre_builder.publishing import publish_files
from barometre_builder.renderers import RENDERERS
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

    def test_all_content_styles_scripts_and_embedded_data_are_preserved(self):
        compare_publication(self.reference, self.publication.files)

    def test_ingestion_context_is_not_mutated(self):
        self.assertEqual(self.context, self.before)

    def test_published_media_bytes_equal_the_sources(self):
        manifest = json.loads(self.publication.files[MANIFEST_NAME])
        for source, destination in manifest["media"].items():
            self.assertEqual((ROOT / source).read_bytes(), self.publication.files[destination])
        self.assertFalse(any("Data_source" in name or "Geo/" in name for name in self.publication.files))

    def test_local_loading_keeps_script_order_and_security(self):
        for name, html in self.publication.pages.items():
            self.assertIn("connect-src &#x27;none&#x27;", html)
            self.assertNotIn('crossorigin="anonymous"', html)
            self.assertNotIn("cdn.jsdelivr.net", html)
            self.assertNotIn('<script type="module"', html)
            for path in expected_scripts(name):
                self.assertIn(f'<script src="{path}"></script>', html)
            app = APP_SCRIPTS[name]
            if app:
                self.assertNotIn("fetch(", self.publication.files[app].decode("utf-8"))

    def test_combined_html_and_application_assets_keep_historical_budget(self):
        name = "barometre_details.html"
        total = sum(len(self.publication.files[path]) for path in (name, STYLES[name], APP_SCRIPTS[name]))
        self.assertLessEqual(total, 4_000_000)

    def test_resource_tampering_is_rejected(self):
        for path in ("assets/js/brief.js", "assets/css/details.css", "assets/vendor/d3.min.js"):
            files = dict(self.publication.files)
            files[path] += b"tampered"
            with self.subTest(path=path), self.assertRaises(ValueError):
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
            if ".barometre-stage-" in str(source) and "backup" not in str(source) and Path(target).name == "barometre_details.html":
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
            files["assets/js/details.js"] = b"invalid"
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
