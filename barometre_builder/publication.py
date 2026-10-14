"""Assemblage du site publié, sans modifier la préparation des données."""
from __future__ import annotations

import base64
from copy import deepcopy
from dataclasses import dataclass
import hashlib
from html import unescape
import json
from pathlib import Path
import re

from .config import ROOT, OUTPUT_PAGES
from .context import BuildContext
from .dependencies import PAGE_DEPENDENCIES, SCRIPTS
from .renderers import RENDERERS
from .security import local_asset_url, secure_html, validate_html, validate_application_script


MANIFEST_NAME = "site_manifest.json"
VENDOR_DIR = Path(__file__).resolve().parent / "vendor"
APP_SCRIPTS = {"index.html": None, "barometre_bref.html": "assets/js/brief.js",
               "barometre_details.html": "assets/js/details.js"}
STYLES = {"index.html": "assets/css/landing.css", "barometre_bref.html": "assets/css/shared.css",
          "barometre_details.html": "assets/css/details.css"}
SECURITY_METADATA = re.compile(
    r'\n  <meta http-equiv="Content-Security-Policy" content="[^"]+">\n  <meta name="referrer" content="no-referrer">'
)
SCRIPT_PATTERN = re.compile(r"<script\b([^>]*)>(.*?)</script\s*>", re.S | re.I)
RESOURCE_PATTERN = re.compile(r'\b(?:src|href)="((?:Assets|assets)/[^"<>]+)"')


def vendor_path(name: str) -> str:
    return "assets/vendor/" + SCRIPTS[name].url.rsplit("/", 1)[-1]


def expected_scripts(page_name: str) -> tuple[str, ...]:
    app = APP_SCRIPTS[page_name]
    return tuple(vendor_path(name) for name in PAGE_DEPENDENCIES[page_name]) + ((app,) if app else ())


def asset_destination(source: str) -> str:
    source = local_asset_url(source)
    for prefix, destination in (("Assets/logo/", "assets/images/logo/"),
                                ("Assets/Images/", "assets/images/"),
                                ("Assets/Mp4/", "assets/videos/")):
        if source.startswith(prefix):
            return destination + source.removeprefix(prefix)
    raise ValueError(f"La ressource {source} n’est pas un média publiable.")


def strip_security_metadata(html: str) -> str:
    html, count = SECURITY_METADATA.subn("", html)
    if count != 1:
        raise ValueError("Les métadonnées de sécurité sont absentes ou répétées.")
    return html


@dataclass
class Publication:
    pages: dict[str, str]
    files: dict[str, bytes]


def assemble_publication(context: BuildContext, source_root: Path = ROOT) -> Publication:
    files: dict[str, bytes] = {}
    media: dict[str, str] = {}

    def publish_media(source: str) -> str:
        if source in media:
            return media[source]
        destination = asset_destination(source)
        path = source_root / source
        if not path.resolve().is_relative_to((source_root / "Assets").resolve()) or not path.is_file():
            raise ValueError(f"La ressource {source} est absente ou sort du dossier Assets.")
        data = path.read_bytes()
        if destination in files and files[destination] != data:
            raise ValueError("Deux médias possèdent le même chemin de publication.")
        files[destination] = data
        media[source] = destination
        return destination

    # Seule cette copie de présentation reçoit les nouvelles URLs.
    boot = deepcopy(context.boot)
    boot["assets"]["logo"] = publish_media(boot["assets"]["logo"])
    videos = boot["assets"]["videos"]
    videos["placeholder"] = publish_media(videos["placeholder"])
    videos["byRegion"] = {code: publish_media(path) for code, path in videos["byRegion"].items()}
    for region in boot["regions"]:
        if region.get("video"):
            region["video"] = publish_media(region["video"])
    presentation = BuildContext(boot, context.deferred, context.brief)

    for name, dependency in SCRIPTS.items():
        data = (VENDOR_DIR / dependency.url.rsplit("/", 1)[-1]).read_bytes()
        integrity = "sha384-" + base64.b64encode(hashlib.sha384(data).digest()).decode("ascii")
        if integrity != dependency.integrity:
            raise ValueError(f"L’empreinte de la bibliothèque {name} est incorrecte.")
        files[vendor_path(name)] = data
    for name in ("D3-LICENSE", "GSAP-NOTICE.txt"):
        files["assets/vendor/" + name] = (VENDOR_DIR / name).read_bytes()

    pages = {}
    for page_name in OUTPUT_PAGES:
        html = strip_security_metadata(RENDERERS[page_name](presentation))

        def rewrite_resource(match):
            source = unescape(match[1])
            destination = publish_media(source) if source.startswith("Assets/") else source
            return match[0].replace(match[1], destination)

        html = RESOURCE_PATTERN.sub(rewrite_resource, html)

        def extract_style(match):
            files[STYLES[page_name]] = match[1].encode("utf-8")
            return f'<link rel="stylesheet" href="{STYLES[page_name]}">'

        html, count = re.subn(r"<style>(.*?)</style>", extract_style, html, flags=re.S)
        if count != 1:
            raise ValueError("La feuille de style attendue est absente ou répétée.")
        app_count = 0

        def extract_script(match):
            nonlocal app_count
            if re.search(r"\bsrc\s*=", match[1]):
                for name in PAGE_DEPENDENCIES[page_name]:
                    dependency = SCRIPTS[name]
                    original = f'<script src="{dependency.url}" integrity="{dependency.integrity}" crossorigin="anonymous"></script>'
                    if match[0] == original:
                        return f'<script src="{vendor_path(name)}"></script>'
                raise ValueError("Une bibliothèque inattendue a été trouvée.")
            if match[2].lstrip().startswith("(() => {"):
                app_count += 1
                destination = APP_SCRIPTS[page_name]
                if destination is None:
                    raise ValueError("Un script applicatif inattendu a été trouvé.")
                validate_application_script(match[2])
                files[destination] = match[2].encode("utf-8")
                return f'<script src="{destination}"></script>'
            return match[0]

        html = SCRIPT_PATTERN.sub(extract_script, html)
        if app_count != int(APP_SCRIPTS[page_name] is not None):
            raise ValueError("Le script applicatif attendu est absent ou répété.")
        html = secure_html(html, page_name, local_scripts=True)
        validate_html(html, page_name, local_scripts=expected_scripts(page_name))
        pages[page_name] = html
        files[page_name] = html.encode("utf-8")

    manifest = {
        "version": 1, "pages": list(OUTPUT_PAGES), "media": media,
        "scripts": {name: list(expected_scripts(name)) for name in OUTPUT_PAGES},
        "styles": STYLES,
        "files": {name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                  for name, data in sorted(files.items())},
    }
    files[MANIFEST_NAME] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    validate_publication(files)
    return Publication(pages, files)


def publication_path(value: str) -> str:
    if value in OUTPUT_PAGES or value == MANIFEST_NAME:
        return value
    value = local_asset_url(value)
    if not value.startswith("assets/"):
        raise ValueError("Un fichier publié doit rester dans assets.")
    return value


def validate_publication(files: dict[str, bytes]) -> dict:
    """Valider le manifeste, les octets, les scripts et toutes les références locales."""
    manifest = json.loads(files[MANIFEST_NAME])
    if manifest.get("version") != 1 or manifest.get("pages") != list(OUTPUT_PAGES):
        raise ValueError("Le manifeste de publication est invalide.")
    records = manifest["files"]
    if len({name.casefold() for name in records}) != len(records):
        raise ValueError("Deux fichiers publiés diffèrent seulement par leur casse.")
    if set(files) != {*records, MANIFEST_NAME}:
        raise ValueError("Le manifeste et les fichiers publiés ne correspondent pas.")
    for name, record in records.items():
        publication_path(name)
        data = files[name]
        if record != {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}:
            raise ValueError(f"La ressource {name} est absente ou altérée.")
    for name, dependency in SCRIPTS.items():
        actual = "sha384-" + base64.b64encode(hashlib.sha384(files[vendor_path(name)]).digest()).decode("ascii")
        if actual != dependency.integrity:
            raise ValueError(f"La bibliothèque {name} a été altérée.")
    for page_name in OUTPUT_PAGES:
        expected = expected_scripts(page_name)
        if manifest["scripts"].get(page_name) != list(expected) or manifest["styles"].get(page_name) != STYLES[page_name]:
            raise ValueError("Le manifeste contient des scripts ou styles inattendus.")
        html = files[page_name].decode("utf-8")
        validate_html(html, page_name, local_scripts=expected)
        if secure_html(strip_security_metadata(html), page_name, local_scripts=True) != html:
            raise ValueError("La politique de sécurité ne correspond pas aux scripts.")
        for match in RESOURCE_PATTERN.finditer(html):
            if unescape(match[1]) not in records:
                raise ValueError("Une référence locale est absente du manifeste.")
        for script in expected:
            if script not in records:
                raise ValueError("Un script local est absent du manifeste.")
        if STYLES[page_name] not in records:
            raise ValueError("Une feuille de style est absente du manifeste.")
    for source, destination in manifest["media"].items():
        if asset_destination(source) != destination or destination not in records:
            raise ValueError("Une référence de média est invalide.")
    return manifest


def read_publication(directory: Path) -> dict[str, bytes]:
    if directory.is_symlink():
        raise ValueError("Le site ne doit pas être un lien symbolique.")
    manifest_path = directory / MANIFEST_NAME
    if manifest_path.is_symlink():
        raise ValueError("Le manifeste ne doit pas être un lien symbolique.")
    manifest_data = manifest_path.read_bytes()
    manifest = json.loads(manifest_data)
    files = {MANIFEST_NAME: manifest_data}
    for name in manifest["files"]:
        publication_path(name)
        path = directory / name
        if path.is_symlink() or not path.resolve().is_relative_to(directory.resolve()):
            raise ValueError("Une ressource sort du site publié.")
        files[name] = path.read_bytes()
    validate_publication(files)
    return files
