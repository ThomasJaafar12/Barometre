"""Exporter le site validé de dist, avec une archive ZIP facultative."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
import tempfile
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from barometre_builder.config import OUTPUT_DIR
from barometre_builder.publication import read_publication
from barometre_builder.publishing import publish_files

DEFAULT_OUTPUT_DIR = ROOT / "exports" / "export_package"


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
            translated = "Les arguments sont invalides. Consultez --help."
        self.print_usage(sys.stderr)
        self.exit(2, f"{self.prog} : erreur : {translated}\n")


def parse_args() -> argparse.Namespace:
    parser = FrenchParser(description="Exporter les trois pages et leurs ressources locales.",
                          add_help=False, allow_abbrev=False)
    parser.add_argument("-h", "--help", action="help", help="Afficher cette aide.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR,
                        help="Sous-dossier de exports dans lequel créer le paquet.")
    parser.add_argument("--zip", action="store_true", help="Créer une archive ZIP à côté du dossier.")
    return parser.parse_args()


def checked_output_dir(path: Path) -> Path:
    requested = path if path.is_absolute() else ROOT / path
    allowed = ROOT.resolve() / "exports"
    resolved = requested.resolve()
    if requested.is_symlink() or resolved == allowed or not resolved.is_relative_to(allowed):
        raise ValueError("Le dossier de sortie doit être un sous-dossier de exports, sans lien symbolique sortant.")
    return resolved


def create_zip(output_dir: Path) -> Path:
    output_dir = checked_output_dir(output_dir)
    files = read_publication(output_dir)
    archive_path = output_dir.with_name(output_dir.name + ".zip")
    if archive_path.is_symlink():
        raise ValueError("L’archive ne doit pas être un lien symbolique.")
    with tempfile.NamedTemporaryFile(dir=archive_path.parent, prefix=".barometre-zip-",
                                      suffix=".tmp", delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as archive:
            for name, data in sorted(files.items()):
                archive.writestr(name, data)
        with ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError("L’archive créée est endommagée.")
        os.replace(temporary, archive_path)
    finally:
        temporary.unlink(missing_ok=True)
    return archive_path


def export_site(output_dir: Path, *, source_dir: Path = OUTPUT_DIR) -> Path:
    output_dir = checked_output_dir(output_dir)
    files = read_publication(source_dir)
    publish_files(files, output_dir)
    return output_dir


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    args = parse_args()
    try:
        directory = export_site(args.output_dir)
        archive = create_zip(directory) if args.zip else None
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit(f"Le paquet de diffusion ne peut pas être créé : {error}") from error
    print(f"Paquet de diffusion créé : {directory}")
    print("Les polices Google nécessitent toujours une connexion Internet.")
    if archive:
        print(f"Archive ZIP créée : {archive}")


if __name__ == "__main__":
    main()
