"""Contexte partagé par les trois moteurs de rendu."""
from dataclasses import dataclass

from .brief import build_bref_payload
from .config import DPAE_CACHE_PATH
from .dpae import build_dpae_module
from .payloads import build_payloads


@dataclass(frozen=True)
class BuildContext:
    boot: dict
    deferred: dict
    brief: dict


def build_context() -> BuildContext:
    boot, deferred = build_payloads()
    region_meta = {region["code"]: region for region in boot["regions"]}
    dpae = build_dpae_module(region_meta, cache_path=DPAE_CACHE_PATH)
    return BuildContext(boot, deferred, build_bref_payload(boot, deferred, dpae))
