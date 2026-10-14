"""Publication préparée sur disque, avec restauration en cas d’échec."""
from __future__ import annotations

import os
from pathlib import Path
import tempfile

from .publication import MANIFEST_NAME, publication_path, read_publication


def publish_files(files: dict[str, bytes], output_dir: Path) -> None:
    if output_dir.is_symlink():
        raise ValueError("Le dossier de publication ne doit pas être un lien symbolique.")
    output_dir.mkdir(parents=True, exist_ok=True)
    root = output_dir.resolve()
    # Seuls les fichiers de notre précédent manifeste peuvent être retirés.
    previous = read_publication(output_dir) if (output_dir / MANIFEST_NAME).exists() else {}
    owned = set(files) | set(previous)
    for name in owned:
        publication_path(name)
        target = output_dir / name
        if target.is_symlink() or not target.resolve().is_relative_to(root) or target.is_dir():
            raise ValueError("Un chemin de publication est invalide.")
    with tempfile.TemporaryDirectory(prefix=".barometre-stage-", dir=output_dir.parent) as folder:
        stage = Path(folder) / "site"
        backup = Path(folder) / "backup"
        for name, data in files.items():
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        read_publication(stage)
        changed = []
        try:
            # Le manifeste est remplacé en dernier.
            for name in sorted(owned - {MANIFEST_NAME}) + [MANIFEST_NAME]:
                target = output_dir / name
                saved = backup / name
                existed = target.exists()
                if existed:
                    saved.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(target, saved)
                changed.append((target, saved, existed))
                if name in files:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(stage / name, target)
        except BaseException:
            for target, saved, existed in reversed(changed):
                if existed:
                    os.replace(saved, target)
                else:
                    target.unlink(missing_ok=True)
            raise
