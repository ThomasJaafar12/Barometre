from __future__ import annotations

from copy import deepcopy

from .config import EXPERIENCE_REGION_CODES


PRODUCTION_TOKENS = {
    "bg": "#0B1D3A",
    "bg-soft": "#0EA5A8",
    "page-bg": "#F8FAFC",
    "page-bg-soft": "#F1F5F9",
    "panel": "#FFFFFF",
    "panel-strong": "#FFFFFF",
    "panel-faint": "#F8FAFC",
    "surface": "#FFFFFF",
    "surface-strong": "#F8FAFC",
    "surface-inset": "#F1F5F9",
    "nav-panel": "#0B1D3A",
    "editorial-panel": "#FFFFFF",
    "editorial-panel-inner": "#F8FAFC",
    "chip-bg": "#F8FAFC",
    "chip-border": "#CBD5E1",
    "chip-active-a": "#0B1D3A",
    "chip-active-b": "#0B1D3A",
    "line": "#E2E8F0",
    "line-strong": "#CBD5E1",
    "text": "#0F172A",
    "muted": "#334155",
    "muted-soft": "#64748B",
    "danger": "#E11D48",
    "warning": "#F59E0B",
    "neutral": "#E2E8F0",
    "button-active-a": "#0B1D3A",
    "button-active-b": "#0B1D3A",
    "hero-action-a": "#0B1D3A",
    "hero-action-b": "#0B1D3A",
    "map-idle": "#E2E8F0",
    "map-empty": "#EEF3F8",
    "map-unavailable": "#D8E1EA",
    "map-national-low": "#C9D7E6",
    "map-national-high": "#0A9FA6",
    "chart-sector-start": "#2B82F6",
    "chart-sector-end": "#0EA5A8",
    "chart-sector-area": "rgba(43,130,246,0.18)",
    "chart-payroll-area": "rgba(14,165,168,0.18)",
    "chart-auto-low": "#BFE8CF",
    "chart-auto-high": "#16A34A",
    "chart-rar-low": "#F5B7C4",
    "chart-rar-high": "#E11D48",
    "chart-rar-fin": "#2B82F6",
    "chart-rar-next": "#F59E0B",
    "chart-rar-90": "#E11D48",
    "chart-employment-dept-low": "#F7C96B",
    "chart-employment-dept-high": "#E86E2A",
    "employment-chart-ink": "#0B1D3A",
    "employment-chart-ink-soft": "rgba(11,29,58,0.14)",
    "employment-chart-text": "#0F172A",
    "employment-chart-muted": "#64748B",
    "employment-chart-grid": "rgba(148,163,184,0.24)",
    "employment-chart-grid-strong": "rgba(100,116,139,0.26)",
    "employment-chart-positive-a": "rgba(14,165,168,0.94)",
    "employment-chart-positive-b": "rgba(14,165,168,0.54)",
    "employment-chart-negative-a": "rgba(225,29,72,0.94)",
    "employment-chart-negative-b": "rgba(225,29,72,0.50)",
    "employment-chart-focus-a": "rgba(43,130,246,0.12)",
    "employment-chart-focus-b": "rgba(43,130,246,0)",
    "employment-treemap-negative": "#E7A1AE",
    "employment-treemap-neutral": "#F3E7D4",
    "employment-treemap-positive": "#8CCDC4",
    "focus-stroke": "#0B1D3A",
    "focus-glow": "rgba(14,165,168,0.24)",
    "chapter-tone-1": "linear-gradient(180deg, #FFFFFF, #F8FAFC)",
    "chapter-tone-2": "linear-gradient(180deg, #FFFFFF, #F8FAFC)",
    "chapter-tone-3": "linear-gradient(180deg, #FFFFFF, #F8FAFC)",
    "chapter-tone-4": "linear-gradient(180deg, #FFFFFF, #F8FAFC)",
    "chapter-shadow-1": "rgba(15,23,42,0.08)",
    "chapter-shadow-2": "rgba(15,23,42,0.08)",
    "chapter-shadow-3": "rgba(15,23,42,0.08)",
    "chapter-shadow-4": "rgba(15,23,42,0.08)",
    "chapter-rail-line": "#E2E8F0",
}


def _theme(accent: str, accent_deep: str, secondary: str, glow: str) -> dict[str, str]:
    return {
        "accent": accent,
        "accentDeep": accent_deep,
        "secondary": secondary,
        "glow": glow,
    }


REGION_THEME_CYCLE = [
    _theme("#0EA5A8", "#0B1D3A", "#2B82F6", "#0EA5A8"),
    _theme("#2B82F6", "#0B1D3A", "#0EA5A8", "#2B82F6"),
    _theme("#16A34A", "#0B1D3A", "#0EA5A8", "#16A34A"),
    _theme("#F59E0B", "#0B1D3A", "#2B82F6", "#F59E0B"),
    _theme("#E11D48", "#0B1D3A", "#F59E0B", "#E11D48"),
    _theme("#0EA5A8", "#0B1D3A", "#16A34A", "#0EA5A8"),
]


DEFAULT_REGION_THEMES = [
    deepcopy(REGION_THEME_CYCLE[index % len(REGION_THEME_CYCLE)])
    for index, _ in enumerate(EXPERIENCE_REGION_CODES)
]


def build_color_system() -> dict[str, object]:
    return {
        "tokens": deepcopy(PRODUCTION_TOKENS),
        "regionThemes": deepcopy(DEFAULT_REGION_THEMES),
    }
