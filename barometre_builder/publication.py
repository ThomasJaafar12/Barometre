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
from .renderers.details import render_region_map
from .renderers.landing import render_landing_prefetch
from .security import local_asset_url, script_json, secure_html, validate_html, validate_application_script
from .topics import TOPICS


MANIFEST_NAME = "site_manifest.json"
VENDOR_DIR = Path(__file__).resolve().parent / "vendor"
APP_SCRIPTS = {"index.html": None, "barometre_bref.html": "assets/js/brief.js",
               "barometre_emploi.html": "assets/js/emploi.js",
               "barometre_entreprises.html": "assets/js/entreprises.js",
               "barometre_chiffres.html": "assets/js/chiffres.js"}
DEFERRED_DATA_SCRIPTS = {topic.page_name: f"assets/js/{topic.key}-data.js" for topic in TOPICS.values()}
STYLES = {"index.html": "assets/css/landing.css", "barometre_bref.html": "assets/css/shared.css",
          "barometre_emploi.html": "assets/css/details.css",
          "barometre_entreprises.html": "assets/css/details.css",
          "barometre_chiffres.html": "assets/css/chiffres.css"}
# Anciens formats acceptés uniquement lors du remplacement d’une publication existante.
PREVIOUS_PAGES = ("index.html", "barometre_bref.html", "barometre_emploi.html", "barometre_entreprises.html")
LEGACY_PAGES = ("index.html", "barometre_bref.html", "barometre_details.html")
LEGACY_APP_SCRIPTS = {"index.html": None, "barometre_bref.html": "assets/js/brief.js",
                      "barometre_details.html": "assets/js/details.js"}
LEGACY_STYLES = {"index.html": "assets/css/landing.css", "barometre_bref.html": "assets/css/shared.css",
                 "barometre_details.html": "assets/css/details.css"}
PAGE_LINK_PATTERN = re.compile(r'\bhref="([^"/#?]+\.html)(?:[?#][^"]*)?"')
SECURITY_METADATA = re.compile(
    r'\n  <meta http-equiv="Content-Security-Policy" content="[^"]+">\n  <meta name="referrer" content="no-referrer">'
)
SCRIPT_PATTERN = re.compile(r"<script\b([^>]*)>(.*?)</script\s*>", re.S | re.I)
RESOURCE_PATTERN = re.compile(r'\b(?:src|href)="((?:Assets|assets)/[^"<>]+)"')
DEFERRED_DATA_ASSIGNMENT = r'window\.BAROMETRE_DEFERRED_GZIP = "[A-Za-z0-9+/]+={0,2}";'
INLINE_DEFERRED_DATA = re.compile(rf"^    ({DEFERRED_DATA_ASSIGNMENT})$", re.M)
DEFERRED_DATA_SOURCE = re.compile(r'window\.BAROMETRE_DEFERRED_SRC\s*=\s*"([^"\n]+)";')
REGION_MAP_PREFETCH_SCRIPT = re.compile(r'<script id="region-map-prefetch">(.*?)</script>', re.S)


def vendor_path(name: str) -> str:
    return "assets/vendor/" + SCRIPTS[name].url.rsplit("/", 1)[-1]


def region_map_asset_path(data: bytes) -> str:
    return f"assets/js/region-map-{hashlib.sha256(data).hexdigest()[:16]}.js"


def region_map_resources(region_map: str) -> tuple[str, str]:
    return vendor_path("d3"), region_map


def region_map_preloads(region_map: str) -> str:
    return "".join(f'  <link rel="preload" as="script" href="{path}">\n'
                   for path in region_map_resources(region_map))


def expected_scripts(page_name: str, *, legacy: bool = False, region_map: str | None = None) -> tuple[str, ...]:
    app = (LEGACY_APP_SCRIPTS if legacy else APP_SCRIPTS)[page_name]
    dependencies = ("d3", "gsap", "scroll_trigger") if legacy and page_name == "barometre_details.html" else PAGE_DEPENDENCIES[page_name]
    scripts = tuple(vendor_path(name) for name in dependencies) + ((app,) if app else ())
    if region_map is not None and page_name in DEFERRED_DATA_SCRIPTS:
        return region_map_resources(region_map) + scripts[1:]
    return scripts


def late_detail_scripts(page_name: str) -> tuple[str, ...]:
    return expected_scripts(page_name)[1:] if page_name in DEFERRED_DATA_SCRIPTS else ()


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
    for key in ("national", "credits"):
        if videos.get(key):
            videos[key] = publish_media(videos[key])
    videos["byRegion"] = {code: publish_media(path) for code, path in videos["byRegion"].items()}
    if "byHistorical" in videos:
        videos["byHistorical"] = {slug: publish_media(path) for slug, path in videos["byHistorical"].items()}
    if "posters" in videos:
        videos["posters"] = {
            publish_media(video): publish_media(poster) for video, poster in videos["posters"].items()
        }
    for region in boot["regions"]:
        if region.get("video"):
            region["video"] = publish_media(region["video"])
    region_geography = boot.get("geography", {}).pop("regions", None)
    map_data = render_region_map(region_geography).encode("utf-8")
    region_map = region_map_asset_path(map_data)
    files[region_map] = map_data
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
        late_scripts = late_detail_scripts(page_name)
        if destination := DEFERRED_DATA_SCRIPTS.get(page_name):
            assignments = INLINE_DEFERRED_DATA.findall(html)
            if len(assignments) != 1:
                raise ValueError("Les données différées sont absentes ou répétées.")
            files[destination] = (assignments[0] + "\n").encode("ascii")
            html = INLINE_DEFERRED_DATA.sub(f'    window.BAROMETRE_DEFERRED_SRC = "{destination}";', html)
            icon = '  <link rel="icon" href="data:,">'
            html = html.replace(icon, region_map_preloads(region_map) + icon, 1)

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
                        script = vendor_path(name)
                        mode = " defer" if script in late_scripts else ""
                        return f'<script{mode} src="{script}"></script>'
                raise ValueError("Une bibliothèque inattendue a été trouvée.")
            if match[1] == ' id="barometre-region-map"' and late_scripts:
                validate_application_script(match[2])
                return f'<script src="{region_map}"></script>'
            if match[2].lstrip().startswith("(() => {"):
                app_count += 1
                destination = APP_SCRIPTS[page_name]
                if destination is None:
                    raise ValueError("Un script applicatif inattendu a été trouvé.")
                validate_application_script(match[2])
                files[destination] = match[2].encode("utf-8")
                mode = " defer" if destination in late_scripts else ""
                return f'<script{mode} src="{destination}"></script>'
            return match[0]

        html = SCRIPT_PATTERN.sub(extract_script, html)
        if app_count != int(APP_SCRIPTS[page_name] is not None):
            raise ValueError("Le script applicatif attendu est absent ou répété.")
        if page_name == "index.html":
            prefetch = render_landing_prefetch(region_map_resources(region_map))
            validate_application_script(prefetch)
            html = html.replace("</body>", prefetch + "</body>", 1)
        html = secure_html(html, page_name, local_scripts=True)
        validate_html(html, page_name, local_scripts=expected_scripts(page_name, region_map=region_map),
                      deferred_scripts=late_scripts)
        pages[page_name] = html
        files[page_name] = html.encode("utf-8")

    manifest = {
        "version": 3, "pages": list(OUTPUT_PAGES), "media": media, "region_map": region_map,
        "scripts": {name: list(expected_scripts(name, region_map=region_map)) for name in OUTPUT_PAGES},
        "styles": STYLES,
        "files": {name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
                  for name, data in sorted(files.items())},
    }
    files[MANIFEST_NAME] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    validate_publication(files)
    return Publication(pages, files)


def publication_path(value: str, *, allow_legacy: bool = False) -> str:
    if value in OUTPUT_PAGES or value == MANIFEST_NAME or (allow_legacy and value == "barometre_details.html"):
        return value
    value = local_asset_url(value)
    if not value.startswith("assets/"):
        raise ValueError("Un fichier publié doit rester dans assets.")
    return value


def validate_publication(files: dict[str, bytes], *, allow_legacy: bool = False) -> dict:
    """Valider le manifeste, les octets, les scripts et toutes les références locales."""
    manifest = json.loads(files[MANIFEST_NAME])
    known_layouts = (OUTPUT_PAGES, PREVIOUS_PAGES, LEGACY_PAGES) if allow_legacy else (OUTPUT_PAGES,)
    pages = next((layout for layout in known_layouts if manifest.get("pages") == list(layout)), None)
    version = manifest.get("version")
    if pages is None or version not in (1, 2, 3) or (version > 1 and pages != OUTPUT_PAGES):
        raise ValueError("Le manifeste de publication est invalide.")
    region_map = None
    if version == 3:
        region_map = manifest.get("region_map")
        if not isinstance(region_map, str) or region_map not in files or region_map_asset_path(files[region_map]) != region_map:
            raise ValueError("La carte des régions est absente ou son empreinte ne correspond pas.")
    elif "region_map" in manifest:
        raise ValueError("Le manifeste contient une carte des régions inattendue.")
    legacy = pages == LEGACY_PAGES
    styles = LEGACY_STYLES if legacy else {name: STYLES[name] for name in pages}
    scripts = {name: list(expected_scripts(name, legacy=legacy, region_map=region_map)) for name in pages}
    if manifest.get("styles") != styles or manifest.get("scripts") != scripts:
        raise ValueError("Le manifeste contient des scripts ou styles inattendus.")
    records = manifest["files"]
    if len({name.casefold() for name in records}) != len(records):
        raise ValueError("Deux fichiers publiés diffèrent seulement par leur casse.")
    if set(files) != {*records, MANIFEST_NAME}:
        raise ValueError("Le manifeste et les fichiers publiés ne correspondent pas.")
    for name, record in records.items():
        publication_path(name, allow_legacy=legacy)
        if name not in pages and not name.startswith("assets/"):
            raise ValueError("Une page inattendue est présente dans la publication.")
        data = files[name]
        if record != {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}:
            raise ValueError(f"La ressource {name} est absente ou altérée.")
    for name, dependency in SCRIPTS.items():
        actual = "sha384-" + base64.b64encode(hashlib.sha384(files[vendor_path(name)]).digest()).decode("ascii")
        if actual != dependency.integrity:
            raise ValueError(f"La bibliothèque {name} a été altérée.")
    for page_name in pages:
        expected = tuple(scripts[page_name])
        html = files[page_name].decode("utf-8")
        late_scripts = late_detail_scripts(page_name) if region_map else ()
        validate_html(html, page_name, local_scripts=expected, deferred_scripts=late_scripts)
        if secure_html(strip_security_metadata(html), page_name, local_scripts=True) != html:
            raise ValueError("La politique de sécurité ne correspond pas aux scripts.")
        data_script = DEFERRED_DATA_SCRIPTS.get(page_name) if version >= 2 else None
        data_sources = DEFERRED_DATA_SOURCE.findall(html)
        if data_script:
            if (data_sources != [data_script] or INLINE_DEFERRED_DATA.search(html)
                    or data_script not in records
                    or not re.fullmatch((DEFERRED_DATA_ASSIGNMENT + "\n").encode("ascii"), files[data_script])):
                raise ValueError(f"Les données différées de {page_name} sont absentes ou invalides.")
        elif data_sources:
            raise ValueError(f"Une source de données différées inattendue est présente dans {page_name}.")
        if region_map and late_scripts:
            if html.partition("</head>")[0].count(region_map_preloads(region_map)) != 1:
                raise ValueError(f"Les ressources de la carte de {page_name} ne sont pas préchargées.")
        if region_map and page_name == "index.html":
            prefetch_scripts = REGION_MAP_PREFETCH_SCRIPT.findall(html)
            paths = script_json(region_map_resources(region_map))
            if len(prefetch_scripts) != 1 or f"const paths = {paths};" not in prefetch_scripts[0]:
                raise ValueError("Le préchargement de la carte sur l’accueil référence des ressources inattendues.")
        for match in RESOURCE_PATTERN.finditer(html):
            if unescape(match[1]) not in records:
                raise ValueError("Une référence locale est absente du manifeste.")
        for script in expected:
            if script not in records:
                raise ValueError("Un script local est absent du manifeste.")
        for match in PAGE_LINK_PATTERN.finditer(html):
            if match[1] not in pages:
                raise ValueError("Un lien pointe vers une page absente de la publication.")
        if styles[page_name] not in records:
            raise ValueError("Une feuille de style est absente du manifeste.")
    for source, destination in manifest["media"].items():
        if asset_destination(source) != destination or destination not in records:
            raise ValueError("Une référence de média est invalide.")
    return manifest


def read_publication(directory: Path, *, allow_legacy: bool = False) -> dict[str, bytes]:
    if directory.is_symlink():
        raise ValueError("Le site ne doit pas être un lien symbolique.")
    manifest_path = directory / MANIFEST_NAME
    if manifest_path.is_symlink():
        raise ValueError("Le manifeste ne doit pas être un lien symbolique.")
    manifest_data = manifest_path.read_bytes()
    manifest = json.loads(manifest_data)
    files = {MANIFEST_NAME: manifest_data}
    for name in manifest["files"]:
        publication_path(name, allow_legacy=allow_legacy)
        path = directory / name
        if path.is_symlink() or not path.resolve().is_relative_to(directory.resolve()):
            raise ValueError("Une ressource sort du site publié.")
        files[name] = path.read_bytes()
    validate_publication(files, allow_legacy=allow_legacy)
    return files
