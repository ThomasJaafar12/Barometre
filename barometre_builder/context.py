"""Contexte partagé par les trois moteurs de rendu."""
from dataclasses import dataclass

from .brief import build_bref_payload
from .payloads import build_payloads


@dataclass(frozen=True)
class BuildContext:
    boot: dict
    deferred: dict
    brief: dict


def build_context() -> BuildContext:
    boot, deferred = build_payloads()
    dpae = deferred["modules"]["dpae"]
    return BuildContext(boot, deferred, build_bref_payload(boot, deferred, dpae))
