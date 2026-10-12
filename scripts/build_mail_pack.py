"""Créer un paquet de diffusion avec les pages liées et leurs ressources locales."""
from __future__ import annotations

import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import shutil
import sys
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from barometre_builder.config import OUTPUT_PAGES
from barometre_builder.security import local_asset_url

DEFAULT_HTML = ROOT / "index.html"
DEFAULT_OUTPUT_DIR = ROOT / "dist" / "mail_pack"
LOCAL_ASSET_PATTERN = re.compile(r"Assets/[^\s\"'<>`()]+")


class FrenchParser(argparse.ArgumentParser):
    def format_help(self):
        return super().format_help().replace("usage:", "Utilisation :")

    def format_usage(self):
        return super().format_usage().replace("usage:", "Utilisation :")

    def error(self, message):
        if message.startswith("unrecognized arguments: "):
            translated = "Arguments inconnus : " + message.removeprefix("unrecognized arguments: ")
        elif message.startswith("argument ") and message.endswith(": expected one argument"):
            option = message.removeprefix("argument ").removesuffix(": expected one argument")
            translated = f"L’option {option} nécessite une valeur."
        elif message.startswith("argument ") and ": ignored explicit argument " in message:
            option = message.removeprefix("argument ").split(":", 1)[0]
            translated = f"L’option {option} n’accepte pas de valeur."
        else:
            translated = "Les arguments de commande sont invalides. Consultez --help pour afficher les options."
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog} : erreur : {translated}\n")


def parse_args() -> argparse.Namespace:
    parser = FrenchParser(description="Créer un paquet léger avec les pages du baromètre et leurs ressources locales.", add_help=False, allow_abbrev=False)
    parser._optionals.title = "Options"
    parser.add_argument("-h", "--help", action="help", help="Afficher cette aide.")
    parser.add_argument("--html", type=Path, default=DEFAULT_HTML, metavar="PAGE", help="Page de départ du paquet (accueil par défaut).")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, metavar="DOSSIER", help="Sous-dossier de dist dans lequel créer le paquet.")
    parser.add_argument("--zip", action="store_true", help="Créer aussi une archive ZIP à côté du dossier.")
    return parser.parse_args()


def normalize_path(path: Path) -> Path:
    return (path if path.is_absolute() else ROOT / path).resolve()


def checked_output_dir(path: Path) -> Path:
    resolved = normalize_path(path)
    allowed = ROOT.resolve() / "dist"
    if resolved == allowed or not resolved.is_relative_to(allowed) or path.is_symlink():
        raise ValueError("Le dossier de sortie doit être un sous-dossier de dist, sans lien symbolique vers un autre emplacement.")
    return resolved


class PageLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.pages: set[str] = set()
        self.remote_urls: set[str] = set()

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "a" and fields.get("href") in OUTPUT_PAGES:
            self.pages.add(fields["href"])
        for name in ("src", "href"):
            value = fields.get(name, "")
            if value.startswith("https://"):
                self.remote_urls.add(value)


def extract_local_assets(html_text: str) -> list[Path]:
    return [Path(local_asset_url(value)) for value in sorted(set(LOCAL_ASSET_PATTERN.findall(html_text)))]


def extract_remote_urls(html_text: str) -> list[str]:
    links = PageLinks()
    links.feed(html_text)
    return sorted(links.remote_urls)


def collect_pack(html_path: Path) -> tuple[dict[Path, str], list[Path]]:
    pending = [normalize_path(html_path)]
    pages: dict[Path, str] = {}
    assets: set[Path] = set()
    while pending:
        source = pending.pop()
        if source in pages:
            continue
        if source.parent != ROOT.resolve() or source.suffix.lower() != ".html" or not source.is_file():
            raise ValueError("Chaque page du paquet doit être un fichier HTML présent à la racine du projet.")
        try:
            html = source.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise ValueError(f"La page {source.name} doit être encodée en UTF-8.") from error
        pages[source] = html
        assets.update(extract_local_assets(html))
        links = PageLinks()
        links.feed(html)
        pending.extend(ROOT / name for name in sorted(links.pages))
    for relative in assets:
        source = (ROOT / relative).resolve()
        if not source.is_relative_to(ROOT.resolve() / "Assets") or not source.is_file():
            raise ValueError(f"La ressource locale {relative.as_posix()} est absente ou sort du dossier Assets.")
    return pages, sorted(assets)


def copy_pack(html_path: Path, output_dir: Path, args: argparse.Namespace) -> tuple[list[Path], list[Path]]:
    output_dir = checked_output_dir(output_dir)
    pages, local_assets = collect_pack(html_path)
    # Vérifier toutes les sources avant de remplacer un paquet existant.
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)
    copied_files = []
    for source in pages:
        shutil.copy2(source, output_dir / source.name)
        copied_files.append(Path(source.name))
    for relative in local_assets:
        target = output_dir / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / relative, target)
        copied_files.append(relative)
    manifest = {
        "html": html_path.name,
        "pages": sorted(source.name for source in pages),
        "localAssets": [path.as_posix() for path in local_assets],
        "missingLocalAssets": [],
        "remoteDependencies": sorted({url for html in pages.values() for url in extract_remote_urls(html)}),
    }
    (output_dir / "mail_pack_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    copied_files.append(Path("mail_pack_manifest.json"))
    return copied_files, []


def create_zip(output_dir: Path) -> Path:
    output_dir = checked_output_dir(output_dir)
    archive_path = output_dir.with_suffix(".zip")
    if not archive_path.resolve().is_relative_to(ROOT.resolve() / "dist") or archive_path.is_symlink():
        raise ValueError("Le chemin de l’archive n’est pas autorisé.")
    with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(output_dir.rglob("*")):
            if path.is_file():
                if not path.resolve().is_relative_to(output_dir):
                    raise ValueError("Une ressource du paquet sort du dossier de sortie.")
                archive.write(path, path.relative_to(output_dir))
    return archive_path


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    args = parse_args()
    try:
        html_path = normalize_path(args.html)
        output_dir = checked_output_dir(args.output_dir)
        copied, _ = copy_pack(html_path, output_dir, args)
        archive = create_zip(output_dir) if args.zip else None
    except (OSError, ValueError) as error:
        raise SystemExit(f"Le paquet de diffusion ne peut pas être créé : {error}") from error
    print(f"Paquet de diffusion créé : {output_dir}")
    print(f"Fichiers copiés : {len(copied)}")
    print("Les scripts et les polices externes nécessitent une connexion Internet.")
    if archive:
        print(f"Archive ZIP créée : {archive}")


if __name__ == "__main__":
    main()
