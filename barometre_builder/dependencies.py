"""Versions et empreintes des ressources autorisées dans les pages."""
from dataclasses import dataclass


@dataclass(frozen=True)
class ScriptDependency:
    url: str
    integrity: str
    global_name: str


SCRIPTS = {
    "d3": ScriptDependency(
        "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js",
        "sha384-CjloA8y00+1SDAUkjs099PVfnY2KmDC2BZnws9kh8D/lX1s46w6EPhpXdqMfjK6i",
        "d3",
    ),
    "gsap": ScriptDependency(
        "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js",
        "sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt",
        "gsap",
    ),
    "scroll_trigger": ScriptDependency(
        "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js",
        "sha384-Z3REaz79l2IaAZqJsSABtTbhjgOUYyV3p90XNnAPCSHg3EMTz1fouunq9WZRtj3d",
        "ScrollTrigger",
    ),
}

PAGE_DEPENDENCIES = {
    "index.html": (),
    "barometre_bref.html": ("d3",),
    "barometre_details.html": ("d3", "gsap", "scroll_trigger"),
}


def script_tags(names: tuple[str, ...]) -> str:
    return "\n".join(
        f'<script src="{SCRIPTS[name].url}" integrity="{SCRIPTS[name].integrity}" crossorigin="anonymous"></script>'
        for name in names
    )
