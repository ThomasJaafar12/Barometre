"""Cache JSON des données préparées, invalidé par le contenu des dépendances."""
from __future__ import annotations

from collections.abc import Callable, Iterable
import hashlib
import os
from pathlib import Path
import tempfile

from .utils import dump_json, load_json


CACHE_VERSION = 1


def source_fingerprint(paths: Iterable[Path], parameters: object) -> str:
    digest = hashlib.sha256(dump_json({"version": CACHE_VERSION, "parameters": parameters}).encode("utf-8"))
    for path in paths:
        digest.update(str(path.resolve()).encode("utf-8"))
        with path.open("rb") as handle:
            digest.update(hashlib.file_digest(handle, "sha256").digest())
    return digest.hexdigest()


def cached_json(path: Path, fingerprint: str, prepare: Callable[[], dict], required_keys: tuple[str, ...]) -> dict:
    try:
        entry = load_json(path)
        payload = entry["payload"]
        if (entry["fingerprint"] == fingerprint and isinstance(payload, dict)
                and all(key in payload for key in required_keys)
                and entry["sha256"] == hashlib.sha256(dump_json(payload).encode("utf-8")).hexdigest()):
            return payload
    except (KeyError, OSError, TypeError, ValueError):
        pass

    payload = prepare()
    serialized = dump_json(payload)
    entry = {"fingerprint": fingerprint, "sha256": hashlib.sha256(serialized.encode("utf-8")).hexdigest(), "payload": payload}
    temporary = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=path.parent,
                                         prefix=".barometre-cache-", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(dump_json(entry))
        os.replace(temporary, path)
    except OSError:
        # Le cache est facultatif : une sortie reste possible sans droit d’écriture ici.
        pass
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
    return payload
