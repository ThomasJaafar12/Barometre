from pathlib import Path
import tempfile
import unittest
from unittest import mock

from barometre_builder import io


URL = "https://object.data.gouv.fr/contours-administratifs/2025/geojson/departements-50m.geojson"


class GeographyDownloadSecurityTests(unittest.TestCase):
    def test_only_expected_https_source_is_allowed(self):
        self.assertEqual(io.validate_geojson_url(URL), URL)
        for value in [URL.replace("https:", "http:"), URL.replace("object.data.gouv.fr", "example.org"), URL.replace("https://", "https://user:password@"), URL + "?redirect=1", URL.replace("departements-50m", "communes-5m"), "file:///C:/secret.json", "https://127.0.0.1/contours-administratifs/2025/geojson/departements-50m.geojson"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                io.validate_geojson_url(value)

    def test_untrusted_redirect_is_rejected_before_request(self):
        with self.assertRaises(ValueError):
            io.SafeGeoRedirect().redirect_request(None, None, 302, "", {}, "https://example.org/file.json")

    def test_valid_download_is_written_after_validation(self):
        payload = b'{"type":"FeatureCollection","features":[]}'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "departements.geojson"
            response = mock.MagicMock()
            response.__enter__.return_value = response
            response.geturl.return_value = URL
            response.read.return_value = payload
            opener = mock.Mock()
            opener.open.return_value = response
            with mock.patch.object(io, "DEPARTMENT_GEOJSON_CACHE", path), mock.patch("urllib.request.build_opener", return_value=opener):
                result = io.fetch_json(URL, path)
            self.assertEqual(result["features"], [])
            self.assertEqual(path.read_bytes(), payload)
            response.read.assert_called_once_with(io.MAX_GEOJSON_BYTES + 1)
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_invalid_or_oversized_download_preserves_previous_cache(self):
        for payload, limit in [(b"invalide", 100), (b"{\"features\":[]}", 100), (b"123456789", 4)]:
            with self.subTest(payload=payload), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "departements.geojson"
                path.write_bytes(b"ancien cache")
                response = mock.MagicMock()
                response.__enter__.return_value = response
                response.geturl.return_value = URL
                response.read.return_value = payload
                opener = mock.Mock()
                opener.open.return_value = response
                with mock.patch.object(io, "DEPARTMENT_GEOJSON_CACHE", path), mock.patch.object(io, "MAX_GEOJSON_BYTES", limit), mock.patch("urllib.request.build_opener", return_value=opener), self.assertRaises(ValueError):
                    io.fetch_json(URL, path)
                self.assertEqual(path.read_bytes(), b"ancien cache")


if __name__ == "__main__":
    unittest.main()
