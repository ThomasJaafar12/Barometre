"""Génère la maquette HTML du taux de reste à recouvrer."""
from __future__ import annotations

import base64
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from barometre_builder.config import ASSETS_DIR, OUTPUT_DIR, TRAR_CACHE_PATH  # noqa: E402
from barometre_builder.geometry import build_geographies  # noqa: E402
from barometre_builder.publication import VENDOR_DIR  # noqa: E402
from barometre_builder.trar import build_trar_module  # noqa: E402


def load_trar_and_geo() -> tuple[dict, dict, dict]:
    regions_geo, departments_geo, region_meta = build_geographies()
    department_names = {
        feature["properties"]["code"]: feature["properties"]["nom"]
        for feature in departments_geo["features"]
    }
    trar_data = build_trar_module(
        region_meta,
        department_names,
        cache_path=TRAR_CACHE_PATH,
    )
    return trar_data, departments_geo, region_meta


def build_payload() -> dict:
    trar_data, departments_geo, region_meta = load_trar_and_geo()
    # Keep only the department GeoJSON (much lighter) + ordered region metadata.
    return {
        "meta": {
            "publicationDateLabel": "24 juin 2026",
            "publicationIssueNumber": "189",
            "defaultRegion": "24",  # Centre-Val de Loire
        },
        "regions": list(region_meta.values()),
        "departmentsGeo": departments_geo,
        "trar": trar_data,
    }


def load_logo_data_uri() -> str:
    svg_bytes = (ASSETS_DIR / "logo" / "Urssaf.svg").read_bytes()
    encoded = base64.b64encode(svg_bytes).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def load_d3_source() -> str:
    return (VENDOR_DIR / "d3.min.js").read_text(encoding="utf-8")


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Taux de reste à recouvrer — Santé des entreprises Urssaf</title>
  <link rel="icon" href="data:,">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --urssaf-primary: #0B1D3A;
      --urssaf-secondary: #0EA5A8;
      --urssaf-info: #2B82F6;
      --urssaf-success: #16A34A;
      --urssaf-warning: #F59E0B;
      --urssaf-alert: #E11D48;
      --ink: #0B1E36;
      --navy: #0B1D3A;
      --text: #0F172A;
      --muted: #475569;
      --line: #E2E8F0;
      --line-strong: #CBD5E1;
      --paper-bg: #F6F8FB;
      --surface: #FFFFFF;
      --surface-soft: #F8FAFC;
      --surface-inset: #F1F5F9;

      /* Palette officielle Santé des entreprises */
      --topic-accent: #00816D;
      --topic-highlight: #CCECE6;

      /* Palette officielle du treemap sectoriel Conjoncture */
      --treemap-pos-soft: #62DDB1;
      --treemap-neutral: #F6C65B;
      --treemap-neg-soft: #FF967D;
      --treemap-neg-deep: #ED4766;
      --treemap-missing: #E2E8F0;

      /* Couleurs des horizons TRAR */
      --trar-j90: #98511F;
      --trar-mois: #087783;
      --trar-fin: #004B9B;

      --dashboard-ink: #0B1E36;
      --dashboard-blue: #004B9B;
      --dashboard-cyan: #009EDB;
      --dashboard-muted: #64748B;
      --dashboard-green: #059669;
      --dashboard-red: #DC2626;

      --font-sans: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-display: "Plus Jakarta Sans", "Inter", system-ui, sans-serif;
      --shadow-shell: 0 24px 70px rgba(11, 29, 58, 0.14);
      --shadow-card: 0 18px 42px rgba(11, 29, 58, 0.08);
      --spring: cubic-bezier(0.22, 1, 0.36, 1);
    }

    * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    html {
      background: var(--paper-bg);
      scroll-behavior: smooth;
    }

    body {
      margin: 0;
      min-height: 100vh;
      overflow-x: hidden;
      color: var(--text);
      background: linear-gradient(180deg, #F2F6FA 0%, #FFFFFF 360px, #F6F8FB 100%);
      font: 400 14px/1.6 var(--font-sans);
    }

    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }

    [hidden] {
      display: none !important;
    }

    :focus-visible {
      outline: 2px solid #004B9B;
      outline-offset: 2px;
    }

    /* ======================================================================
       NAVIGATION ET MISE EN PAGE
       ====================================================================== */
    .page-links {
      position: absolute;
      top: 0;
      right: 30px;
      z-index: 1000;
      display: flex;
      gap: 16px;
      padding: 2px 10px;
      background: #F8FAFC;
      color: #0B1D3A;
      font: 500 11px/16px var(--font-sans);
      border-bottom-left-radius: 6px;
      border-bottom-right-radius: 6px;
      border: 1px solid var(--line);
      border-top: 0;
    }

    .page-links a {
      color: inherit;
      text-underline-offset: 3px;
    }

    .page {
      width: min(calc(100% - 40px), 1480px);
      margin: 24px auto 80px;
    }

    .shell {
      padding: 18px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid #D9E2EC;
      box-shadow: var(--shadow-shell);
    }

    /* ======================================================================
       TOPIC HEADER PRODUIT EXACT (topic-header.css + geo-control)
       ====================================================================== */
    .topic-header {
      --topic-ink: #0F1C35;
      --topic-header-inset: 26px;
      position: relative;
      z-index: 40;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 20px;
      min-height: 108px;
      padding: 18px var(--topic-header-inset);
      margin-bottom: 18px;
      border: 1px solid #E4EBF5;
      border-radius: 14px;
      color: var(--topic-ink);
      background: linear-gradient(180deg, #FFFFFF, #F8FAFD);
      box-shadow: 0 10px 28px rgba(15, 28, 53, 0.04);
    }

    .topic-header-main {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 20px;
    }

    .topic-header-number {
      flex: none;
      color: var(--topic-accent);
      font: 800 26px/1 var(--font-display);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.05em;
    }

    .topic-header-copy {
      display: grid;
      min-width: 0;
      gap: 5px;
    }

    .topic-header-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px 10px;
      font-size: 11.5px;
      line-height: 1.3;
    }

    .topic-header-meta img {
      display: block;
      width: auto;
      height: 20px;
    }

    .topic-header-brand,
    .topic-header-edition {
      padding-inline-start: 10px;
      border-inline-start: 1px solid #D7E0EE;
    }

    .topic-header-brand {
      font-family: var(--font-display);
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .topic-header-edition {
      color: #000000;
      font-weight: 500;
    }

    .topic-header h1 {
      margin: 0;
      color: var(--topic-ink);
      font: 800 clamp(24px, 2.35vw, 34px)/1.12 var(--font-display);
      letter-spacing: -0.04em;
    }

    .topic-header-highlight {
      background: linear-gradient(transparent 76%, var(--topic-highlight) 76% 95%, transparent 95%);
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }

    .topic-header-description {
      margin: 0;
      color: #55647A;
      font-size: 13px;
      line-height: 1.45;
    }

    /* Geo selector exactement calqué sur details.css */
    .geo-control {
      position: relative;
      z-index: 60;
      justify-self: end;
    }

    .geo-trigger {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      min-height: 46px;
      padding: 8px 14px 8px 18px;
      border-radius: 999px;
      border: 1px solid #C8D6E8;
      background: #FFFFFF;
      color: var(--ink);
      font: 700 0.9rem/1.2 var(--font-display);
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
      transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    .geo-trigger:hover,
    .geo-control.is-open .geo-trigger {
      border-color: #00816D;
      box-shadow: 0 0 0 3px rgba(0, 129, 109, 0.14), 0 8px 20px rgba(15, 23, 42, 0.08);
      transform: translateY(-1px);
    }

    .geo-trigger-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--topic-accent);
      flex: none;
    }

    .geo-trigger-chevron {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #F1F5F9;
      color: #475569;
    }

    .geo-trigger-chevron svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 180ms ease;
    }

    .geo-control.is-open .geo-trigger-chevron svg {
      transform: rotate(180deg);
    }

    .geo-menu {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      width: min(760px, calc(100vw - 48px));
      padding: 24px 26px;
      border-radius: 12px;
      background: #FFFFFF;
      border: 1px solid rgba(15, 23, 42, 0.10);
      box-shadow: 0 22px 54px -12px rgba(15, 23, 42, 0.28);
      display: none;
      z-index: 120;
    }

    .geo-control.is-open .geo-menu {
      display: block;
    }

    .geo-menu-action-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      padding-bottom: 12px;
      border-bottom: 1px solid #E2E8F0;
    }

    .geo-context-label {
      color: #64748B;
      font-size: 0.74rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .geo-selector-grid {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr) minmax(0, 1fr);
      gap: 22px;
      align-items: start;
    }

    .geo-selector-column {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    .geo-column-title-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .geo-column-title {
      font: 800 0.68rem/1.2 var(--font-display);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 3px 7px;
      border-radius: 3px;
      color: #FFFFFF;
    }

    .geo-selector-column:nth-child(1) .geo-column-title { background: #E62B8A; }
    .geo-selector-column:nth-child(2) .geo-column-title { background: #006FB8; }
    .geo-selector-column:nth-child(3) .geo-column-title { background: #6D28D9; }

    .geo-column-counter {
      font-size: 0.68rem;
      font-weight: 700;
      color: #64748B;
      background: #F1F5F9;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .geo-national-card {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px;
      text-align: left;
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      border-radius: 10px;
    }

    .geo-national-card:hover {
      border-color: #0B1D3A;
      background: #F8FAFC;
    }

    .geo-national-card.is-active {
      border-color: #00816D;
      background: #E6F5F2;
    }

    .geo-national-title {
      font-weight: 700;
      font-size: 0.92rem;
      color: var(--ink);
    }

    .geo-national-desc {
      font-size: 0.74rem;
      color: #64748B;
      line-height: 1.35;
    }

    .geo-list-container {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 310px;
      overflow-y: auto;
    }

    .geo-selector-row {
      width: 100%;
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #1E293B;
      font-size: 0.82rem;
      font-weight: 500;
      text-align: left;
    }

    .geo-selector-row:hover {
      background: #F1F5F9;
    }

    .geo-selector-row.is-active {
      background: #E6F5F2;
      color: #065F46;
      font-weight: 700;
    }

    .geo-active-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #00816D;
      opacity: 0;
      flex: none;
    }

    .geo-selector-row.is-active .geo-active-dot {
      opacity: 1;
    }

    /* ======================================================================
       COMPOSANTS PARTAGÉS DES CARTES (alignés sur details.css)
       ====================================================================== */
    .trar-stack {
      display: grid;
      gap: 24px;
    }

    .trar-card {
      background: #FFFFFF;
      border: 1px solid #D4DEE9;
      border-radius: 16px;
      box-shadow: var(--shadow-card);
      overflow: visible;
    }

    .employment-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(350px, 0.33fr);
      gap: 0;
      align-items: stretch;
    }

    .employment-main {
      position: relative;
      padding: 24px 24px 20px;
      display: grid;
      gap: 16px;
      align-content: start;
      min-width: 0;
    }

    .employment-main.has-open-sector-picker,
    .has-open-sector-picker {
      z-index: 60;
    }

    .employment-intro {
      position: relative;
      z-index: 25;
      display: grid;
      gap: 14px;
    }

    .employment-title h2 {
      margin: 0;
      color: #0B1E36;
      font: 700 clamp(1.15rem, 1.45vw, 1.42rem)/1.28 var(--font-display);
      letter-spacing: -0.025em;
    }

    .employment-title span {
      display: block;
      margin-top: 3px;
      color: #64748B;
      font-size: 0.86rem;
    }

    .employment-controls {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px 14px;
      width: 100%;
    }

    .employment-select-label {
      display: block;
      color: #64748B;
      font: 600 11px/1.2 var(--font-sans);
      margin-bottom: 4px;
    }

    /* Metric Switch (segmented buttons) */
    .metric-switch {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px;
      border-radius: 10px;
      background: #F1F5F9;
      border: 1px solid #CBD5E1;
    }

    .metric-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 36px;
      padding: 7px 13px;
      border: 1px solid transparent;
      border-radius: 7px;
      background: transparent;
      color: #334155;
      font: 600 0.82rem/1.2 var(--font-sans);
      transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
    }

    .metric-button:hover {
      color: #0B1D3A;
      background: rgba(255, 255, 255, 0.7);
    }

    .metric-button.is-active {
      color: #FFFFFF;
      background: #0B1D3A;
      border-color: #0B1D3A;
    }

    .horizon-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex: none;
    }

    /* ======================================================================
       SÉLECTEUR PERSONNALISÉ (.employment-sector-picker & grand-sector)
       ====================================================================== */
    .employment-sector-picker {
      --sector-picker-text: #24364A;
      --sector-picker-muted: #60748A;
      --sector-picker-border: #CBD5E1;
      --sector-picker-active: #0EA5A8;
      --sector-picker-highlight: #00816D;
      position: relative;
      z-index: 20;
      display: grid;
      gap: 4px;
      width: min(100%, 310px);
      flex: 0 1 310px;
      color: var(--sector-picker-text);
    }

    .employment-sector-picker.is-open {
      z-index: 90;
    }

    .employment-sector-trigger {
      width: 100%;
      min-height: 42px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 12px 9px 14px;
      color: #13263D;
      background: #FFFFFF;
      border: 1px solid #BFCBDD;
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      font: 700 0.86rem/1.2 var(--font-sans);
      text-align: left;
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }

    .employment-sector-trigger:hover,
    .employment-sector-trigger:focus-visible,
    .employment-sector-picker.is-open .employment-sector-trigger {
      border-color: #6F8299;
      box-shadow: 0 0 0 3px rgba(0, 109, 119, 0.12), 0 4px 12px rgba(15, 23, 42, 0.08);
      outline: none;
    }

    .employment-sector-trigger-value {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .employment-sector-trigger svg {
      width: 18px;
      height: 18px;
      flex: 0 0 18px;
      fill: none;
      stroke: #60748A;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 180ms ease;
    }

    .employment-sector-picker.is-open .employment-sector-trigger svg {
      transform: rotate(180deg);
    }

    .employment-sector-menu {
      position: absolute;
      z-index: 110;
      top: calc(100% + 10px);
      left: 0;
      width: min(940px, calc(100vw - 80px));
      max-height: min(600px, calc(100vh - 120px));
      display: none;
      padding: 20px 24px 22px;
      overflow: auto;
      color: var(--sector-picker-text);
      background: #FFFFFF;
      border: 1px solid rgba(15, 23, 42, 0.10);
      border-radius: 10px;
      box-shadow: 0 18px 48px -12px rgba(15, 23, 42, 0.28), 0 8px 18px -10px rgba(15, 23, 42, 0.16);
    }

    .employment-sector-picker.is-open .employment-sector-menu {
      display: block;
      animation: menuIn 160ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    }

    @keyframes menuIn {
      from { opacity: 0; transform: translateY(-5px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .employment-sector-menu-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px 18px;
      margin-bottom: 22px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--sector-picker-border);
    }

    .employment-sector-menu-title {
      color: var(--sector-picker-muted);
      font-size: 0.74rem;
      font-weight: 800;
      letter-spacing: 0.055em;
      text-transform: uppercase;
    }

    .employment-sector-menu-tools {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .picker-search-input {
      min-width: 210px;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid #CBD5E1;
      font: 500 0.78rem/1.3 var(--font-sans);
      color: var(--ink);
      background: #F8FAFC;
    }

    .picker-search-input:focus {
      outline: none;
      border-color: #006D77;
      background: #FFFFFF;
    }

    .employment-sector-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 22px;
      align-items: stretch;
    }

    .employment-sector-column {
      position: relative;
      min-width: 0;
      padding-right: 14px;
    }

    .employment-sector-column:not(:last-child)::after {
      content: "";
      position: absolute;
      top: 34px;
      right: -3px;
      bottom: 8px;
      width: 1px;
      background: var(--sector-picker-border);
    }

    .employment-sector-column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 14px;
    }

    .employment-sector-badge {
      max-width: 100%;
      padding: 4px 7px;
      overflow: hidden;
      color: #FFFFFF;
      border-radius: 4px;
      font-size: 0.64rem;
      font-weight: 900;
      letter-spacing: 0.035em;
      line-height: 1.2;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .employment-sector-column--industry .employment-sector-badge { background: #006D77; }
    .employment-sector-column--trade .employment-sector-badge { background: #586A7A; }
    .employment-sector-column--business .employment-sector-badge { background: #D46B28; }
    .employment-sector-column--collective .employment-sector-badge { background: #6B7F2B; }
    .employment-sector-column--grand .employment-sector-badge { background: #7000FF; }
    .employment-sector-column--dept .employment-sector-badge { background: #004B9B; }

    .employment-sector-count {
      padding: 2px 6px;
      color: var(--sector-picker-muted);
      background: #F1F5F9;
      border-radius: 4px;
      font-size: 0.68rem;
      font-weight: 700;
    }

    .employment-sector-list {
      display: grid;
      gap: 3px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .employment-sector-option {
      width: 100%;
      min-height: 32px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      color: var(--sector-picker-text);
      background: transparent;
      border: 0;
      border-radius: 6px;
      font: 500 0.76rem/1.38 var(--font-sans);
      text-align: left;
      transition: color 140ms ease, background-color 140ms ease, transform 140ms ease;
    }

    .employment-sector-option:hover,
    .employment-sector-option:focus-visible {
      color: #081B2E;
      background: #F4F7FA;
      outline: none;
      transform: translateX(2px);
    }

    .employment-sector-option.is-active {
      color: #0B1E36;
      background: #EEF6F7;
      font-weight: 700;
    }

    .employment-sector-option-right {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: none;
    }

    .picker-rate-pill {
      padding: 2px 6px;
      border-radius: 999px;
      font: 700 0.7rem/1.2 var(--font-sans);
      font-variant-numeric: tabular-nums;
      background: #F1F5F9;
      color: #0B1E36;
    }

    .employment-sector-active-dot {
      width: 6px;
      height: 6px;
      flex: 0 0 6px;
      margin-top: 0.42em;
      border-radius: 50%;
      background: var(--sector-picker-active);
      opacity: 0;
    }

    .employment-sector-option.is-active .employment-sector-active-dot {
      opacity: 1;
    }

    .employment-sector-all-option {
      width: auto;
      min-height: 32px;
      align-items: center;
      padding: 6px 12px;
      color: #13263D;
      background: #F1F5F9;
      border: 1px solid #00816D;
      font-size: 0.75rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .employment-sector-all-option .employment-sector-active-dot {
      margin-top: 0;
    }

    .employment-grand-sector-picker {
      --sector-picker-active: #7000FF;
      width: 220px;
      max-width: 100%;
      flex: none;
    }

    .employment-grand-sector-picker .employment-sector-trigger {
      min-height: 46px;
    }

    .employment-grand-sector-picker .employment-sector-menu {
      width: min(380px, calc(100vw - 60px));
      padding: 20px 22px;
    }

    .employment-grand-sector-picker .employment-sector-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .employment-grand-sector-picker .employment-sector-column {
      padding-right: 0;
    }

    .employment-grand-sector-picker .employment-sector-column::after {
      display: none;
    }

    /* ======================================================================
       CHART SHELL & TOOLTIP
       ====================================================================== */
    .employment-chart-shell {
      position: relative;
      z-index: 1;
      width: 100%;
    }

    .employment-chart-shell svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .employment-tooltip {
      position: absolute;
      top: 16px;
      left: 16px;
      z-index: 30;
      width: max-content;
      min-width: 196px;
      max-width: min(275px, calc(100% - 24px));
      padding: 10px 13px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.98);
      border: 1px solid #CBD5E1;
      color: var(--text);
      box-shadow: 0 14px 32px rgba(15, 23, 42, 0.14);
      pointer-events: none;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 120ms ease, transform 120ms ease;
    }

    .employment-tooltip.is-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .employment-tooltip .tooltip-overline {
      font: 700 11px/1.3 var(--font-sans);
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .employment-tooltip .tooltip-body {
      margin-top: 6px;
      font-size: 0.85rem;
      line-height: 1.45;
      color: #0F172A;
    }

    .tooltip-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }

    .tooltip-row strong {
      font-variant-numeric: tabular-nums;
    }

    .legend-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px 16px;
      font-size: 0.82rem;
      color: #475569;
    }

    .legend-chip {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }

    .trar-line-sample {
      width: 22px;
      border-top: 3px solid currentColor;
      display: inline-block;
    }

    /* ======================================================================
       PANNEAU DROIT (SINGLE TAUX KPI + TOP 5 SECTEURS)
       ====================================================================== */
    .employment-side.trar-dashboard-panel {
      position: relative;
      padding: 24px;
      background: #F8FAFC;
      border-left: 1px solid #E2E8F0;
      border-top-right-radius: 16px;
      border-bottom-right-radius: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: hidden;
    }

    .employment-side.trar-dashboard-panel::before {
      content: "";
      position: absolute;
      top: -90px;
      left: -90px;
      width: 240px;
      height: 240px;
      border-radius: 50%;
      background: radial-gradient(circle, #009EDB 0%, transparent 62%);
      opacity: 0.09;
      pointer-events: none;
    }

    .employment-dashboard-context {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      color: var(--dashboard-muted);
      font: 700 0.72rem/1.35 var(--font-sans);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .employment-dashboard-context time {
      flex: none;
      padding: 4px 9px;
      color: var(--dashboard-blue);
      background: rgba(0, 75, 155, 0.07);
      border: 1px solid rgba(0, 75, 155, 0.14);
      border-radius: 999px;
      font-size: 0.72rem;
      text-transform: none;
      letter-spacing: 0;
    }

    .delai-kpi-block {
      position: relative;
      z-index: 1;
      padding: 18px;
      background: #FFFFFF;
      border: 1px solid rgba(0, 0, 0, 0.07);
      border-radius: 14px;
      box-shadow: 0 3px 10px rgba(11, 29, 58, 0.03);
    }

    .employment-dashboard-level-label {
      display: block;
      margin-bottom: 6px;
      color: var(--dashboard-muted);
      font: 700 0.76rem/1.3 var(--font-sans);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .trar-rate-level {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px 12px;
      flex-wrap: wrap;
    }

    .delai-level-value {
      color: var(--dashboard-blue);
      font: 800 clamp(2.1rem, 2.8vw, 2.75rem)/1.05 var(--font-display);
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }

    .trar-rate-level time {
      color: var(--dashboard-muted);
      font-size: 0.78rem;
      font-weight: 600;
    }

    .employment-dashboard-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }

    .employment-dashboard-stat {
      padding: 10px 12px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 10px;
    }

    .employment-dashboard-stat-label {
      display: block;
      margin-bottom: 4px;
      color: var(--dashboard-muted);
      font: 600 0.72rem/1.3 var(--font-sans);
    }

    .employment-dashboard-trend {
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--dashboard-muted);
      font: 700 1.02rem/1.2 var(--font-sans);
      font-variant-numeric: tabular-nums;
    }

    .employment-dashboard-trend svg {
      width: 16px;
      height: 16px;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* En TRAR : hausse = défavorable (rouge), baisse = favorable (vert) */
    .employment-dashboard-trend.is-positive { color: var(--dashboard-red); }
    .employment-dashboard-trend.is-negative { color: var(--dashboard-green); }
    .employment-dashboard-trend.is-negative svg { transform: rotate(180deg); }
    .employment-dashboard-trend.is-neutral svg { transform: rotate(90deg); }
    .employment-dashboard-trend.is-unknown svg { display: none; }

    .delai-top-sectors-block {
      position: relative;
      z-index: 1;
      padding: 16px;
      background: #FFFFFF;
      border: 1px solid rgba(0, 0, 0, 0.06);
      border-radius: 14px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
    }

    .delai-top-sectors-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #F1F5F9;
    }

    .delai-top-sectors-title {
      margin: 0;
      font: 700 0.78rem/1.3 var(--font-sans);
      color: #16212C;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .delai-top-sectors-meta {
      font-size: 0.74rem;
      color: #64748B;
      white-space: nowrap;
    }

    .delai-top-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 0.78rem;
    }

    .delai-top-table th {
      padding: 5px 4px;
      color: #64748B;
      font-weight: 600;
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid #E2E8F0;
    }

    .delai-top-table td {
      padding: 7px 4px;
      vertical-align: middle;
      border-bottom: 1px solid #F1F5F9;
    }

    .delai-th-rank { width: 20px; text-align: center; }
    .delai-th-sector { text-align: left; }
    .delai-th-mt { width: 64px; text-align: right; }
    .delai-th-yoy { width: 68px; text-align: right; }

    .delai-top-row {
      cursor: pointer;
      transition: background-color 140ms ease;
    }

    .delai-top-row:hover {
      background-color: rgba(0, 75, 155, 0.04);
    }

    .delai-top-row.is-active {
      background-color: rgba(0, 75, 155, 0.08);
    }

    .delai-td-rank {
      font-weight: 700;
      color: #64748B;
      text-align: center;
    }

    .sector-ranking-link {
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      background: none;
      color: #16212C;
      font: 600 0.78rem/1.35 var(--font-sans);
      text-align: left;
      overflow-wrap: anywhere;
    }

    .delai-td-mt {
      font-weight: 700;
      text-align: right;
      color: #004B9B;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .delai-td-yoy {
      font-weight: 700;
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .delai-td-yoy.trend-up { color: var(--dashboard-red); }
    .delai-td-yoy.trend-down { color: var(--dashboard-green); }
    .delai-td-yoy.trend-flat { color: var(--dashboard-muted); }

    /* ======================================================================
       BLOC 2 : CARTE DÉPARTEMENTALE + GRAPHIQUE CÔTE À CÔTE
       ====================================================================== */
    .trar-dept-panel {
      padding: 24px;
      display: grid;
      gap: 18px;
    }

    .trar-panel-head {
      position: relative;
      z-index: 35;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 14px 18px;
    }

    .trar-panel-head .employment-title {
      flex: 1 1 26rem;
      min-width: 0;
    }

    .trar-panel-controls {
      display: flex;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 10px;
    }

    .trar-panel-head .trar-panel-controls {
      flex: none;
      max-width: 100%;
    }

    .trar-split-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 18px;
      align-items: stretch;
    }

    .trar-map-column,
    .trar-history-column {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px;
      border-radius: 14px;
      border: 1px solid #E2E8F0;
      background: #F8FAFC;
      min-width: 0;
    }

    .trar-history-column {
      background: #FFFFFF;
    }

    .trar-map-shell {
      position: relative;
      flex: 1 0 auto;
      min-height: clamp(240px, 62vw, 430px);
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      overflow: hidden;
    }

    .trar-map-shell > svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    .trar-map-shell > .employment-tooltip {
      min-width: min(196px, calc(100% - 24px));
    }

    .trar-map-department {
      stroke: #FFFFFF;
      stroke-width: 1.5px;
      transition: fill 180ms ease, stroke 160ms ease, stroke-width 160ms ease, opacity 160ms ease;
    }

    .trar-map-department:hover {
      stroke: #0B1E36;
      stroke-width: 2.2px;
    }

    .trar-map-department.is-selected {
      stroke: #0B1E36;
      stroke-width: 3px;
      filter: drop-shadow(0 4px 10px rgba(11, 30, 54, 0.24));
    }

    .trar-map-label {
      pointer-events: none;
      text-anchor: middle;
      dominant-baseline: central;
      fill: #122139;
      font: 700 12px/1 var(--font-sans);
    }

    .trar-map-sublabel {
      pointer-events: none;
      text-anchor: middle;
      dominant-baseline: central;
      fill: #122139;
      font: 600 10.5px/1 var(--font-sans);
      font-variant-numeric: tabular-nums;
    }

    .trar-treemap-shell {
      position: relative;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      background: #FFFFFF;
      overflow: hidden;
      min-height: 360px;
    }

    .trar-treemap-shell svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .trar-region-group > rect {
      fill: #EDF3F8;
      stroke: #C8D5E2;
    }

    .trar-region-text {
      fill: #263C53;
      font: 700 11px var(--font-sans);
      pointer-events: none;
    }

    .trar-map-department[role="button"],
    .trar-department-tile[role="button"] {
      cursor: pointer;
      outline: none;
    }

    .trar-department-tile rect {
      stroke: #FFFFFF;
      stroke-width: 1px;
    }

    .trar-department-tile.is-selected rect,
    .trar-department-tile:hover rect {
      stroke: #0B1E36;
      stroke-width: 2.4px;
    }

    .trar-map-department:focus-visible,
    .trar-department-tile:focus-visible rect {
      stroke: #004B9B;
      stroke-width: 3.5px;
    }

    .trar-department-tile text {
      pointer-events: none;
      text-anchor: middle;
      dominant-baseline: central;
      fill: #122139;
      font: 700 11px var(--font-sans);
    }

    .trar-department-tile .trar-tile-rate {
      font-size: 9.5px;
      font-weight: 600;
    }

    /* Légende palette Conjoncture Treemap */
    .trar-snapshot-legend {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 7px 14px;
      font-size: 0.78rem;
      color: #354C64;
    }

    .trar-color-key {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .trar-color-key i.is-square {
      width: 13px;
      height: 13px;
      border-radius: 4px;
      border: 1px solid rgba(15, 23, 42, 0.14);
      display: inline-block;
    }

    .trar-history-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px 12px;
    }

    .trar-history-period {
      flex: none;
      min-height: 36px;
      padding: 6px 12px;
      border: 1px solid #CBD5E1;
      border-radius: 8px;
      background: #F1F5F9;
      color: #004B9B;
      font: 700 0.8rem/1.2 var(--font-sans);
    }

    .trar-history-period:hover {
      background: #E2E8F0;
    }

    .trar-history-meta h3 {
      margin: 0;
      font: 800 1.08rem/1.25 var(--font-display);
      color: #0B1E36;
      letter-spacing: -0.02em;
    }

    .trar-history-meta span {
      display: block;
      margin-top: 2px;
      color: #64748B;
      font-size: 0.8rem;
    }

    .trar-dept-kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .trar-mini-kpi {
      padding: 10px 12px;
      border-radius: 10px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
    }

    .trar-mini-kpi small {
      display: block;
      color: #64748B;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .trar-mini-kpi strong {
      display: block;
      margin-top: 3px;
      color: #0B1E36;
      font: 800 1.08rem/1.2 var(--font-display);
      font-variant-numeric: tabular-nums;
    }

    .trar-max-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: 999px;
      background: #FFF1F2;
      border: 1px solid #FECDD3;
      color: #9F1239;
      font: 700 0.78rem/1.2 var(--font-sans);
      align-self: flex-start;
    }

    .trar-max-chip-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--treemap-neg-deep);
    }

    /* Écart par rapport au taux de référence */
    .trar-benchmark-gap {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      padding: 6px 10px;
      border-radius: 8px;
      background: #F1F5F9;
      color: #1E293B;
      font: 600 0.76rem/1.3 var(--font-sans);
    }

    .trar-benchmark-gap strong {
      font-variant-numeric: tabular-nums;
    }

    .trar-benchmark-gap.is-higher {
      background: #FFF1F2;
      color: #9F1239;
    }

    .trar-benchmark-gap.is-lower {
      background: #ECFDF5;
      color: #065F46;
    }

    /* ======================================================================
       RESPONSIVE
       ====================================================================== */
    @media (max-width: 1120px) {
      .employment-grid,
      .trar-split-grid {
        grid-template-columns: 1fr;
      }

      .employment-side.trar-dashboard-panel {
        border-left: 0;
        border-top: 1px solid #E2E8F0;
        border-radius: 0 0 16px 16px;
      }

      .employment-sector-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .employment-sector-column:not(:last-child)::after {
        display: none;
      }
    }

    @media (max-width: 780px) {
      .page {
        width: calc(100% - 16px);
        margin: 8px auto 48px;
      }

      .shell {
        padding: 10px;
      }

      .topic-header {
        grid-template-columns: 1fr;
        padding: 16px;
      }

      .geo-control {
        justify-self: start;
      }

      .geo-selector-grid,
      .employment-sector-grid,
      .trar-dept-kpis {
        grid-template-columns: 1fr;
      }

      .employment-sector-menu {
        width: calc(100vw - 44px);
        padding: 18px;
      }
    }

    @media (max-width: 720px) {
      .trar-panel-head .trar-panel-controls,
      .employment-grand-sector-picker,
      .trar-panel-head .metric-switch {
        width: 100%;
      }

      .employment-grand-sector-picker .employment-sector-menu {
        width: min(380px, 100%);
      }

      .trar-panel-head .metric-switch {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .trar-panel-head .metric-button {
        gap: 4px;
        padding-inline: 4px;
        text-align: center;
      }
    }

    @media (max-width: 420px) {
      .trar-panel-head .metric-button {
        flex-direction: column;
        font-size: 0.75rem;
      }
    }
  </style>
</head>
<body data-topic="entreprises">
  <nav class="page-links" aria-label="Lectures du baromètre">
    <a href="barometre_entreprises.html">Page production</a>
    <a href="barometre_emploi.html">Conjoncture de l’emploi</a>
  </nav>

  <div class="page">
    <div class="shell">
      <header class="topic-header" data-topic="entreprises">
        <div class="topic-header-main">
          <span class="topic-header-number" aria-hidden="true">02</span>
          <div class="topic-header-copy">
            <div class="topic-header-meta">
              <img src="__LOGO_URI__" alt="Urssaf">
              <span class="topic-header-brand">Panorama économique</span>
              <span class="topic-header-edition"><strong>24 juin 2026</strong> · N°189</span>
            </div>
            <h1>Santé des <span class="topic-header-highlight">entreprises</span></h1>
            <p class="topic-header-description" id="topicDescription">Analysez la vitalité du tissu économique et la situation des entreprises · Centre-Val de Loire</p>
          </div>
        </div>
        <div class="geo-control" id="geoControl">
          <button class="geo-trigger" id="geoTrigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="geoMenu">
            <span class="geo-trigger-dot" aria-hidden="true"></span>
            <span class="geo-trigger-value" id="geoCurrent">Centre-Val de Loire</span>
            <span class="geo-trigger-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </span>
          </button>
          <div class="geo-menu" id="geoMenu" role="listbox" aria-label="Sélectionner une géographie"></div>
        </div>
      </header>

      <main id="trarRoot"></main>
    </div>
  </div>

  <script>__D3_SOURCE__</script>
  <script id="trarMockupPayload" type="application/json">__PAYLOAD_JSON__</script>
  <script>
    (() => {
      const PAYLOAD = JSON.parse(document.getElementById("trarMockupPayload").textContent);
      const TRAR = PAYLOAD.trar;
      const REGIONS = PAYLOAD.regions;
      const REGIONS_BY_CODE = new Map(REGIONS.map((region) => [region.code, region]));
      const DEPTS_GEO = PAYLOAD.departmentsGeo;
      const DEPT_FEATURES = DEPTS_GEO.features;
      const DEPTS_BY_REGION = d3.group(DEPT_FEATURES, (feature) => feature.properties.region);

      const CONJONCTURE_COLORS = ["#10AD8D", "#62DDB1", "#F6C65B", "#FF967D", "#ED4766"];
      const TRAR_HORIZONS = [
        { key: "j90", index: 2, label: "90 jours après l’échéance", shortLabel: "À 90 jours", color: "#98511F" },
        { key: "moisSuivant", index: 1, label: "Fin du mois suivant", shortLabel: "Mois suivant", color: "#087783" },
        { key: "fin", index: 0, label: "Fin du mois d’échéance", shortLabel: "À l’échéance", color: "#004B9B" },
      ];
      const REGIONAL_SECTOR_GROUPS = [
        {
          key: "industry",
          label: "Industrie & énergie",
          codes: [
            "industries-extractives", "industries-agro", "habillement-textile-et-cuir", "bois-et-papier",
            "cokefaction-raffinage-industrie-chimique-et-pharmaceutique",
            "industrie-des-plastiques-et-autres-produits-non-mineraux",
            "metallurgie-et-fabrication-de-produits-metalliques",
            "fabrication-de-produits-inform-elect-et-optiques-et-d-equipement-elect",
            "fabrication-de-machines-et-de-materiel-de-transport",
            "industrie-du-meuble-et-diverses-reparation-et-installation-de-machines",
            "production-et-distribution-d-electricite-de-gaz-et-d-eau",
          ],
        },
        {
          key: "trade",
          label: "BTP, commerce & transp.",
          codes: [
            "construction", "commerce-reparation-d-automobiles-et-de-motocycles",
            "transports-et-entreposage", "hebergement-et-restauration",
          ],
        },
        {
          key: "business",
          label: "Services entreprises",
          codes: [
            "edition-telecommunications-et-activites-informatiques",
            "activites-financieres-et-d-assurance", "activites-immobilieres",
            "activites-juridiques-de-conseil-et-d-ingenierie",
            "recherche-developpement-et-autres-activites-scientifiques-et-techniques",
            "interimaires", "activites-de-services-administratifs-et-de-soutien-hors-interimaires",
          ],
        },
        {
          key: "collective",
          label: "Services collectifs",
          codes: [
            "administration-publique", "education", "activites-pour-la-sante-humaine",
            "action-sociale-et-hebergement-medico", "arts-spectacles-et-activites-recreatives",
            "autres-activites-de-services",
          ],
        },
      ];

      const NATIONAL_GROUP_RULES = [
        { key: "industry", label: "Agri, industrie & énergie", match: (n) => n >= 1 && n <= 39 },
        { key: "trade", label: "BTP, commerce & transp.", match: (n) => n >= 41 && n <= 56 },
        { key: "business", label: "Services entreprises", match: (n) => n >= 58 && n <= 82 },
        { key: "collective", label: "Services collectifs", match: (n) => n >= 84 && n <= 96 },
      ];

      const appState = {
        scope: PAYLOAD.meta.defaultRegion || "24", // "national" or region code
        mainHorizon: "j90",
        nationalSector: "tous-secteurs",
        regionalSector: "tous-secteurs",
        deptSector: "tous-secteurs",
        deptHorizon: "j90",
        showFullDeptHistory: false,
        selectedDeptByScope: {},
      };

      const trarSeriesCache = new WeakMap();
      const snapshotCache = new Map();
      const deptGeomCache = new WeakMap();
      let treemapLayoutCache = null;

      /* ====================================================================
         OUTILS DE FORMATAGE & CALCULS MÉTIER
         ==================================================================== */
      function frNumber(value, decimals = 2) {
        if (!Number.isFinite(value)) return "—";
        return new Intl.NumberFormat("fr-FR", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }).format(value);
      }

      function formatTrarPercent(value) {
        if (!Number.isFinite(value)) return "—";
        const mag = Math.abs(value);
        const decimals = mag && mag < 0.00005 ? 6 : mag && mag < 0.005 ? 4 : 2;
        return `${frNumber(value, decimals)}\u00a0%`;
      }

      function formatTrarChange(change) {
        if (!Number.isFinite(change)) return "—";
        const sign = change > 0 ? "+" : change < 0 ? "−" : "";
        return `${sign}${frNumber(Math.abs(change), 2)}\u00a0pt`;
      }

      const MONTH_NAMES = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
      function monthLabel(isoDate) {
        if (!isoDate) return "—";
        const [y, m] = isoDate.split("-");
        return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
      }

      function el(tag, className = "", text = null) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== null) node.textContent = text;
        return node;
      }

      function svgEl(tag, attrs = {}) {
        const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
        return node;
      }

      function horizonByKey(key) {
        return TRAR_HORIZONS.find((h) => h.key === key) || TRAR_HORIZONS[0];
      }

      function currentScopeLabel() {
        return appState.scope === "national" ? "France entière" : (REGIONS_BY_CODE.get(appState.scope)?.name || "");
      }

      function getTrarSeries(values) {
        if (!values) return { points: [], latest: {} };
        const cached = trarSeriesCache.get(values);
        if (cached) return cached;
        const latest = {};
        const dateIndex = new Map(TRAR.dates.map((d, i) => [d, i]));
        const points = TRAR.dates.map((date, idx) => {
          const point = { date };
          const prevYearDate = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
          const prevIdx = dateIndex.get(prevYearDate);
          TRAR_HORIZONS.forEach(({ key, index }) => {
            const val = values[idx]?.[index];
            point[key] = Number.isFinite(val) ? val : null;
            const prevVal = prevIdx != null ? values[prevIdx]?.[index] : null;
            point[`${key}_yoy`] = (Number.isFinite(val) && Number.isFinite(prevVal))
              ? Number((val - prevVal).toFixed(2))
              : null;
            if (date >= TRAR.displayStartDate && Number.isFinite(val)) {
              latest[key] = { date, value: val };
            }
          });
          return point;
        });
        const first = points.findIndex((p) => p.date >= TRAR.displayStartDate
          && TRAR_HORIZONS.some(({ key }) => Number.isFinite(p[key])));
        const result = { points: first === -1 ? [] : points.slice(first), latest };
        trarSeriesCache.set(values, result);
        return result;
      }

      function lastThreeYears({ points, latest }, horizonKey) {
        const endDate = latest[horizonKey]?.date;
        if (!endDate) return [];
        const start = new Date(endDate);
        start.setUTCMonth(start.getUTCMonth() - 35);
        const startDate = start.toISOString().slice(0, 10);
        return points.filter(({ date }) => date >= startDate && date <= endDate);
      }

      function getSnapshot(sectorKey, horizonKey, scopeKey) {
        const horizon = horizonByKey(horizonKey);
        const cacheKey = `${scopeKey}:${sectorKey}:${horizon.key}`;
        if (snapshotCache.has(cacheKey)) return snapshotCache.get(cacheKey);
        const dateIndex = TRAR.departmentSnapshots[sectorKey]?.[horizon.index];
        const date = dateIndex == null ? null : TRAR.dates[dateIndex];
        const values = new Map();
        const changes = new Map();
        const features = scopeKey === "national"
          ? DEPT_FEATURES
          : (DEPTS_BY_REGION.get(scopeKey) || []);
        const allowedCodes = new Set(features.map((f) => f.properties.code));

        if (date) {
          const prevDate = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
          const prevIndex = TRAR.dates.indexOf(prevDate);
          Object.entries(TRAR.departments).forEach(([code, scope]) => {
            if (!allowedCodes.has(code)) return;
            const series = scope[sectorKey];
            const val = series?.[dateIndex]?.[horizon.index];
            if (!Number.isFinite(val)) return;
            values.set(code, val);
            const prev = prevIndex >= 0 ? series?.[prevIndex]?.[horizon.index] : null;
            if (Number.isFinite(prev)) changes.set(code, Number((val - prev).toFixed(2)));
          });
        }

        const rates = [...values.values()].sort(d3.ascending);
        const distinct = [...new Set(rates)];
        const classCount = Math.min(distinct.length, CONJONCTURE_COLORS.length);
        let cuts;
        if (distinct.length <= 12 && classCount > 1) {
          // Pour les mailles régionales (2 à 13 dépts), découpe aux milieux pour isoler le taux maximal en #ED4766.
          cuts = Array.from({ length: classCount - 1 }, (_, idx) => {
            const pos = Math.round(((idx + 1) * distinct.length) / classCount) - 1;
            const i = Math.max(0, Math.min(distinct.length - 2, pos));
            return Number(((distinct[i] + distinct[i + 1]) / 2).toFixed(3));
          });
        } else {
          cuts = Array.from({ length: Math.max(0, classCount - 1) }, (_, idx) =>
            d3.quantileSorted(rates, (idx + 1) / classCount));
        }
        const thresholds = [...new Set(cuts)].filter((cut) => cut > rates[0]);
        if (!thresholds.length && classCount > 1) thresholds.push(distinct[1]);
        const colors = Array.from({ length: thresholds.length + 1 }, (_, idx) =>
          CONJONCTURE_COLORS[thresholds.length
            ? Math.round(idx * (CONJONCTURE_COLORS.length - 1) / thresholds.length)
            : 2]);
        const rateColor = d3.scaleThreshold(thresholds, colors);

        const result = { date, values, changes, thresholds, colors, rateColor };
        snapshotCache.set(cacheKey, result);
        return result;
      }

      function buildDepartmentEntries(snapshot, features, sectorKey) {
        const entries = features.map((feature) => {
          const { code, nom: name, region } = feature.properties;
          const value = snapshot.values.get(code);
          const change = snapshot.changes.get(code);
          const fill = Number.isFinite(value) ? snapshot.rateColor(value) : "#E2E8F0";
          const hasHistory = Boolean(TRAR.departments[code]?.[sectorKey]);
          return { code, name, region, value, change, fill, hasHistory };
        });
        return entries;
      }

      function findHighestRateDept(entries) {
        const candidates = entries.filter((d) => d.hasHistory && Number.isFinite(d.value));
        return d3.least(candidates, (a, b) => (b.value - a.value) || a.name.localeCompare(b.name, "fr"));
      }

      function ensureActiveDeptCode(entries, highestRateDept) {
        const key = `${appState.scope}:${appState.deptSector}:${appState.deptHorizon}`;
        const saved = appState.selectedDeptByScope[key];
        if (saved && entries.some((d) => d.code === saved && d.hasHistory)) {
          return saved;
        }
        const code = highestRateDept?.code ?? entries.find((d) => d.hasHistory)?.code ?? "";
        appState.selectedDeptByScope[key] = code;
        return code;
      }

      function setActiveDeptCode(code) {
        const key = `${appState.scope}:${appState.deptSector}:${appState.deptHorizon}`;
        appState.selectedDeptByScope[key] = code;
      }

      /* ====================================================================
         SÉLECTEUR GÉOGRAPHIQUE DU HEADER (.geo-control)
         ==================================================================== */
      function initGeoControl() {
        const control = document.getElementById("geoControl");
        const trigger = document.getElementById("geoTrigger");
        const currentEl = document.getElementById("geoCurrent");
        const menu = document.getElementById("geoMenu");

        function updateLabel() {
          const name = currentScopeLabel();
          currentEl.textContent = name;
          document.getElementById("topicDescription").textContent =
            `Analysez la vitalité du tissu économique et la situation des entreprises · ${name}`;
          menu.querySelectorAll(".geo-national-card, .geo-selector-row").forEach((btn) => {
            const active = btn.dataset.geoCode === appState.scope;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", String(active));
          });
        }

        function buildMenu() {
          menu.replaceChildren();
          const head = el("div", "geo-menu-action-header");
          head.append(el("span", "geo-context-label", "Sélection du territoire"));
          menu.append(head);

          const grid = el("div", "geo-selector-grid");

          // National
          const colNat = el("div", "geo-selector-column");
          const barNat = el("div", "geo-column-title-bar");
          barNat.append(el("span", "geo-column-title", "National"));
          const natBtn = el("button", "geo-national-card");
          natBtn.type = "button";
          natBtn.dataset.geoCode = "national";
          natBtn.setAttribute("role", "option");
          natBtn.append(
            el("span", "geo-national-title", "France entière"),
            el("span", "geo-national-desc", "Vue consolidée NACE 88 et treemap des 100 départements.")
          );
          natBtn.addEventListener("click", () => selectScope("national"));
          colNat.append(barNat, natBtn);
          grid.append(colNat);

          // Actuelles
          const mainland = REGIONS.filter((r) => r.group === "mainland")
            .sort((a, b) => a.name.localeCompare(b.name, "fr"));
          const colMain = el("div", "geo-selector-column");
          const barMain = el("div", "geo-column-title-bar");
          barMain.append(el("span", "geo-column-title", "Métropole"), el("span", "geo-column-counter", String(mainland.length)));
          const listMain = el("ul", "geo-list-container");
          mainland.forEach((r) => {
            const li = el("li");
            const btn = el("button", "geo-selector-row");
            btn.type = "button";
            btn.dataset.geoCode = r.code;
            btn.setAttribute("role", "option");
            btn.append(el("span", "", r.name), el("span", "geo-active-dot"));
            btn.addEventListener("click", () => selectScope(r.code));
            li.append(btn);
            listMain.append(li);
          });
          colMain.append(barMain, listMain);
          grid.append(colMain);

          // Outre-mer
          const doms = REGIONS.filter((r) => r.group === "dom")
            .sort((a, b) => a.name.localeCompare(b.name, "fr"));
          const colDom = el("div", "geo-selector-column");
          const barDom = el("div", "geo-column-title-bar");
          barDom.append(el("span", "geo-column-title", "Outre-mer"), el("span", "geo-column-counter", String(doms.length)));
          const listDom = el("ul", "geo-list-container");
          doms.forEach((r) => {
            const li = el("li");
            const btn = el("button", "geo-selector-row");
            btn.type = "button";
            btn.dataset.geoCode = r.code;
            btn.setAttribute("role", "option");
            btn.append(el("span", "", r.name), el("span", "geo-active-dot"));
            btn.addEventListener("click", () => selectScope(r.code));
            li.append(btn);
            listDom.append(li);
          });
          colDom.append(barDom, listDom);
          grid.append(colDom);

          menu.append(grid);
        }

        function setOpen(open) {
          control.classList.toggle("is-open", open);
          trigger.setAttribute("aria-expanded", String(open));
        }

        function selectScope(code) {
          appState.scope = code;
          setOpen(false);
          updateLabel();
          renderMockup();
        }

        buildMenu();
        updateLabel();

        trigger.addEventListener("click", (e) => {
          e.stopPropagation();
          closeAllPickers();
          setOpen(!control.classList.contains("is-open"));
        });

        document.addEventListener("click", (e) => {
          if (!control.contains(e.target)) setOpen(false);
        });
      }

      /* ====================================================================
         COMPOSANT DROPDOWN PERSONNALISÉ (STYLE .employment-sector-picker)
         ==================================================================== */
      function closeAllPickers(except = null) {
        document.querySelectorAll(".employment-sector-picker.is-open").forEach((picker) => {
          if (picker === except) return;
          picker.classList.remove("is-open");
          picker.querySelector(".employment-sector-trigger")?.setAttribute("aria-expanded", "false");
          picker.closest(".employment-main, .trar-panel-head")?.classList.remove("has-open-sector-picker");
        });
      }

      document.addEventListener("click", (e) => {
        if (!e.target.closest(".employment-sector-picker")) {
          closeAllPickers();
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeAllPickers();
      });

      function createCustomPicker({
        label,
        extraClass = "",
        menuTitle = "Sélection",
        selectedKey,
        allOption = null,
        groups = [],
        searchable = false,
        showRateBadge = false,
        onSelect,
      }) {
        const wrapper = el("div", `employment-sector-picker ${extraClass}`.trim());
        if (label) {
          wrapper.append(el("span", "employment-select-label", label));
        }
        const trigger = el("button", "employment-sector-trigger");
        trigger.type = "button";
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");

        const allOptions = [...(allOption ? [allOption] : []), ...groups.flatMap((g) => g.options)];
        const activeOption = allOptions.find((o) => o.key === selectedKey) || allOptions[0];
        const triggerVal = el("span", "employment-sector-trigger-value", activeOption?.label ?? "—");
        const chev = svgEl("svg", { viewBox: "0 0 20 20", "aria-hidden": "true" });
        chev.append(svgEl("path", { d: "m5 7.5 5 5 5-5" }));
        trigger.append(triggerVal, chev);

        const menu = el("div", "employment-sector-menu");
        menu.setAttribute("role", "listbox");

        const header = el("div", "employment-sector-menu-header");
        header.append(el("span", "employment-sector-menu-title", menuTitle));

        const tools = el("div", "employment-sector-menu-tools");
        let searchInput = null;
        if (searchable) {
          searchInput = el("input", "picker-search-input");
          searchInput.type = "search";
          searchInput.placeholder = "Filtrer…";
          searchInput.setAttribute("aria-label", "Filtrer la liste");
          searchInput.addEventListener("click", (e) => e.stopPropagation());
          tools.append(searchInput);
        }

        const makeOptBtn = (opt, extra = "") => {
          const isSelected = opt.key === selectedKey;
          const btn = el("button", `employment-sector-option${extra ? ` ${extra}` : ""}${isSelected ? " is-active" : ""}`);
          btn.type = "button";
          btn.setAttribute("role", "option");
          btn.setAttribute("aria-selected", String(isSelected));
          btn.dataset.searchText = `${opt.label} ${opt.key}`.toLowerCase();
          btn.append(el("span", "", opt.label));
          const right = el("span", "employment-sector-option-right");
          if (showRateBadge && opt.badgeText) {
            right.append(el("span", "picker-rate-pill", opt.badgeText));
          }
          const dot = el("span", "employment-sector-active-dot");
          dot.setAttribute("aria-hidden", "true");
          right.append(dot);
          btn.append(right);
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeAllPickers();
            onSelect(opt.key);
          });
          return btn;
        };

        if (allOption) {
          tools.append(makeOptBtn(allOption, "employment-sector-all-option"));
        }
        if (tools.childElementCount) {
          header.append(tools);
        }
        menu.append(header);

        const grid = el("div", "employment-sector-grid");
        groups.forEach((group) => {
          if (!group.options.length) return;
          const col = el("section", `employment-sector-column employment-sector-column--${group.key}`);
          const colHead = el("div", "employment-sector-column-header");
          const badge = el("span", "employment-sector-badge", group.label);
          const count = el("span", "employment-sector-count", String(group.options.length));
          colHead.append(badge, count);
          const list = el("ul", "employment-sector-list");
          group.options.forEach((opt) => {
            const li = el("li");
            li.append(makeOptBtn(opt));
            list.append(li);
          });
          col.append(colHead, list);
          grid.append(col);
        });
        menu.append(grid);

        if (searchInput) {
          searchInput.addEventListener("input", () => {
            const q = searchInput.value.trim().toLowerCase();
            grid.querySelectorAll("li").forEach((li) => {
              const btn = li.querySelector(".employment-sector-option");
              li.hidden = Boolean(q && !btn.dataset.searchText.includes(q));
            });
            grid.querySelectorAll(".employment-sector-column").forEach((col) => {
              const visibleCount = col.querySelectorAll("li:not([hidden])").length;
              col.hidden = visibleCount === 0;
              col.querySelector(".employment-sector-count").textContent = String(visibleCount);
            });
          });
        }

        trigger.addEventListener("click", (e) => {
          e.stopPropagation();
          const willOpen = !wrapper.classList.contains("is-open");
          closeAllPickers(wrapper);
          wrapper.classList.toggle("is-open", willOpen);
          trigger.setAttribute("aria-expanded", String(willOpen));
          wrapper.closest(".employment-main, .trar-panel-head")
            ?.classList.toggle("has-open-sector-picker", willOpen);
          if (willOpen && searchInput) {
            requestAnimationFrame(() => searchInput.focus());
          }
        });

        wrapper.append(trigger, menu);
        return wrapper;
      }

      function buildMainSectorPicker({ selectedKey, onSelect, horizonKey }) {
        const isNational = appState.scope === "national";
        const options = isNational ? TRAR.sectors.national : TRAR.sectors.regional;
        const scopeSeries = isNational ? TRAR.national : TRAR.regions[appState.scope];

        const decorate = (opt) => {
          if (!scopeSeries?.[opt.key]) return opt;
          const lastVal = getTrarSeries(scopeSeries[opt.key]).latest[horizonKey]?.value;
          return {
            ...opt,
            badgeText: Number.isFinite(lastVal) ? formatTrarPercent(lastVal) : null,
          };
        };

        const allOpt = decorate(options.find((o) => o.key === "tous-secteurs") || options[0]);
        const rest = options.filter((o) => o.key !== "tous-secteurs");

        let groups;
        if (isNational) {
          groups = NATIONAL_GROUP_RULES.map((rule) => ({
            key: rule.key,
            label: rule.label,
            options: rest.filter((o) => rule.match(Number(o.key))).map(decorate),
          }));
        } else {
          const byKey = new Map(rest.map((o) => [o.key, o]));
          groups = REGIONAL_SECTOR_GROUPS.map((grp) => ({
            key: grp.key,
            label: grp.label,
            options: grp.codes.map((c) => byKey.get(c)).filter(Boolean).map(decorate),
          }));
        }

        return createCustomPicker({
          label: `Secteur d’activité (${isNational ? "NACE 88" : "NACE 28"})`,
          menuTitle: isNational ? "Nomenclature NACE 88 (France entière)" : "Secteurs d’activité (NACE 28)",
          selectedKey,
          allOption: allOpt,
          groups,
          searchable: true,
          showRateBadge: true,
          onSelect,
        });
      }

      function buildGrandSectorPicker({ selectedKey, onSelect }) {
        const options = TRAR.sectors.departmental;
        const allOpt = options.find((o) => o.key === "tous-secteurs") || options[0];
        const rest = options.filter((o) => o.key !== "tous-secteurs");
        return createCustomPicker({
          label: "Grand secteur (NACE 5)",
          extraClass: "employment-grand-sector-picker",
          menuTitle: "Grands secteurs NACE 5",
          selectedKey,
          allOption: allOpt,
          groups: [{ key: "grand", label: "Grands secteurs", options: rest }],
          searchable: false,
          onSelect,
        });
      }

      function buildHorizonSwitch(activeKey, onChange) {
        const wrap = el("div", "metric-switch");
        wrap.setAttribute("role", "group");
        wrap.setAttribute("aria-label", "Échéance du taux de reste à recouvrer");
        TRAR_HORIZONS.forEach((h) => {
          const btn = el("button", `metric-button${h.key === activeKey ? " is-active" : ""}`);
          btn.type = "button";
          btn.setAttribute("aria-pressed", String(h.key === activeKey));
          const dot = el("span", "horizon-dot");
          dot.style.background = h.color;
          btn.append(dot, document.createTextNode(h.shortLabel));
          btn.addEventListener("click", () => onChange(h.key));
          wrap.append(btn);
        });
        return wrap;
      }

      /* ====================================================================
         COMPOSANTS KPI & CLASSEMENT DROIT (SINGLE TAUX)
         ==================================================================== */
      function buildTrendBox(label, change) {
        const stat = el("div", "employment-dashboard-stat");
        const dir = !Number.isFinite(change) ? "unknown" : change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
        const trend = el("strong", `employment-dashboard-trend is-${dir}`);
        const svg = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
        svg.append(svgEl("path", { d: "M5 10l7-7m0 0 7 7M12 3v18" }));
        trend.append(svg, el("span", "", formatTrarChange(change)));
        stat.append(el("span", "employment-dashboard-stat-label", label), trend);
        return stat;
      }

      function buildSingleKpiCard({ horizon, latestPoint, changes, comparison }) {
        const card = el("div", "delai-kpi-block");
        card.append(el("span", "employment-dashboard-level-label", horizon.label));

        const level = el("div", "trar-rate-level");
        level.append(el("strong", "delai-level-value", formatTrarPercent(latestPoint?.value)));
        if (latestPoint?.date) {
          const t = el("time", "", monthLabel(latestPoint.date));
          t.dateTime = latestPoint.date;
          level.append(t);
        }
        card.append(level);

        const [yoy, mom] = changes || [];
        const stats = el("div", "employment-dashboard-stats");
        stats.append(buildTrendBox("Gliss. annuel", yoy), buildTrendBox("Gliss. mensuel", mom));
        card.append(stats);

        if (comparison) card.append(comparison);
        return card;
      }

      function buildTopSectorsBlock({ options, dashboard, horizonIndex, selectedKey, onSelect }) {
        const block = el("section", "delai-top-sectors-block");
        const snapshot = dashboard?.rankings?.[horizonIndex];
        const date = snapshot?.date;

        const head = el("div", "delai-top-sectors-head");
        head.append(
          el("h3", "delai-top-sectors-title", "5 taux sectoriels les plus élevés"),
          el("time", "delai-top-sectors-meta", date ? monthLabel(date) : "—")
        );
        block.append(head);

        const rows = (snapshot?.rows || []).map(([key, value, yoy]) => ({
          key,
          label: options.find((o) => o.key === key)?.label || key,
          value,
          yoy,
        }));

        if (!rows.length) {
          block.append(el("p", "delai-top-sectors-meta", "Aucun taux sectoriel disponible."));
          return block;
        }

        const table = el("table", "delai-top-table");
        const thead = el("thead");
        const htr = el("tr");
        [["#", "delai-th-rank"], ["Secteur", "delai-th-sector"], ["Taux", "delai-th-mt"], ["Écart 1 an", "delai-th-yoy"]].forEach(([txt, cls]) => {
          const th = el("th", cls, txt);
          th.scope = "col";
          htr.append(th);
        });
        thead.append(htr);

        const tbody = el("tbody");
        rows.forEach((row, idx) => {
          const tr = el("tr", `delai-top-row${row.key === selectedKey ? " is-active" : ""}`);
          const tdRank = el("td", "delai-td-rank", String(idx + 1));
          const tdSec = el("td");
          const btn = el("button", "sector-ranking-link", row.label);
          btn.type = "button";
          btn.title = row.label;
          btn.addEventListener("click", () => onSelect(row.key));
          tdSec.append(btn);
          const tdVal = el("td", "delai-td-mt", formatTrarPercent(row.value));
          const yoyCls = row.yoy > 0 ? "trend-up" : row.yoy < 0 ? "trend-down" : "trend-flat";
          const tdYoy = el("td", `delai-td-yoy ${yoyCls}`, formatTrarChange(row.yoy));
          tr.append(tdRank, tdSec, tdVal, tdYoy);
          tbody.append(tr);
        });
        table.append(thead, tbody);
        block.append(table);
        return block;
      }

      function buildChartTickDates(dates, xScale) {
        const step = dates.length > 60 ? 12 : dates.length > 30 ? 6 : 3;
        const tickDates = dates.filter((_, i) => i % step === 0);
        const lastDate = dates[dates.length - 1];
        if (tickDates[tickDates.length - 1] !== lastDate) {
          if (tickDates.length && xScale(lastDate) - xScale(tickDates[tickDates.length - 1]) < 68) {
            tickDates.pop();
          }
          tickDates.push(lastDate);
        }
        return tickDates;
      }

      /* ====================================================================
         DESSIN DES GRAPHIQUES (COURBE UNIQUE, COURBE+BARRES, COMPARAISON)
         ==================================================================== */
      function drawSingleLineChart({
        svgNode,
        tooltipNode,
        points,
        horizon,
        scopeLabelText,
        benchmarkPoints = null,
        benchmarkLabel = "",
        viewBoxWidth = 940,
        compactHeight = 460,
      }) {
        const svg = d3.select(svgNode);
        svg.selectAll("*").remove();
        const width = viewBoxWidth;
        const height = compactHeight;
        const margin = { top: 30, right: 24, bottom: 48, left: 66 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        svg.attr("viewBox", `0 0 ${width} ${height}`);

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const valid = points.filter((p) => Number.isFinite(p[horizon.key]));
        if (!valid.length) {
          g.append("text").attr("x", innerW / 2).attr("y", innerH / 2).attr("text-anchor", "middle")
            .attr("fill", "#64748B").style("font-size", "16px").text("Données indisponibles pour cette sélection.");
          return;
        }

        const dates = points.map((p) => p.date);
        const x = d3.scalePoint().domain(dates).range([0, innerW]).padding(0.2);

        const allVals = [...valid.map((p) => p[horizon.key])];
        if (benchmarkPoints) {
          benchmarkPoints.forEach((p) => {
            if (Number.isFinite(p[horizon.key])) allVals.push(p[horizon.key]);
          });
        }
        const minV = Math.min(0, d3.min(allVals) ?? 0);
        const maxV = d3.max(allVals) ?? 1;
        const pad = (maxV - minV) * 0.1 || 0.1;
        const y = d3.scaleLinear().domain([minV < 0 ? minV - pad : 0, maxV + pad]).nice().range([innerH, 0]);

        // Grid
        g.append("g")
          .call(d3.axisLeft(y).ticks(6).tickSize(-innerW).tickFormat(""))
          .call((ax) => {
            ax.select(".domain").remove();
            ax.selectAll("line").attr("stroke", "rgba(148,163,184,0.22)").attr("stroke-dasharray", "3 3");
          });

        // Benchmark curve (if provided)
        let benchByDate = null;
        if (benchmarkPoints) {
          benchByDate = new Map(benchmarkPoints.map((p) => [p.date, p[horizon.key]]));
          const benchLine = d3.line()
            .defined((p) => Number.isFinite(benchByDate.get(p.date)))
            .x((p) => x(p.date))
            .y((p) => y(benchByDate.get(p.date)))
            .curve(d3.curveMonotoneX);
          g.append("path")
            .attr("d", benchLine(points))
            .attr("fill", "none")
            .attr("stroke", "#64748B")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "5 5")
            .attr("opacity", 0.78);
        }

        // Main line
        const line = d3.line()
          .defined((p) => Number.isFinite(p[horizon.key]))
          .x((p) => x(p.date))
          .y((p) => y(p[horizon.key]))
          .curve(d3.curveMonotoneX);
        g.append("path")
          .attr("d", line(points))
          .attr("fill", "none")
          .attr("stroke", horizon.color)
          .attr("stroke-width", 3.2)
          .attr("stroke-linecap", "round");

        // Points
        g.append("g").selectAll("circle").data(valid).join("circle")
          .attr("cx", (p) => x(p.date))
          .attr("cy", (p) => y(p[horizon.key]))
          .attr("r", (_, i) => (i === valid.length - 1 ? 5.2 : 2.6))
          .attr("fill", (_, i) => (i === valid.length - 1 ? "#FFFFFF" : horizon.color))
          .attr("stroke", horizon.color)
          .attr("stroke-width", (_, i) => (i === valid.length - 1 ? 2.8 : 1));

        // Axes
        const yAxis = g.append("g").call(d3.axisLeft(y).ticks(6).tickFormat(formatTrarPercent));
        yAxis.select(".domain").attr("stroke", "#CBD5E1");
        yAxis.selectAll("line").attr("stroke", "#CBD5E1");
        yAxis.selectAll("text").attr("fill", horizon.color).style("font-size", "11px").style("font-weight", "600");
        yAxis.append("text").attr("x", -8).attr("y", -12).attr("fill", horizon.color)
          .attr("text-anchor", "start").style("font-size", "11px").style("font-weight", "700")
          .text(`${horizon.label} (%)`);

        const tickDates = buildChartTickDates(dates, x);
        const xAxis = g.append("g").attr("transform", `translate(0,${innerH})`)
          .call(d3.axisBottom(x).tickValues(tickDates).tickFormat(monthLabel));
        xAxis.selectAll("path,line").attr("stroke", "#CBD5E1");
        xAxis.selectAll("text").attr("fill", "#64748B").style("font-size", "11.5px").attr("dy", "1.2em");

        // Tooltip & Crosshair
        const crosshair = g.append("line").attr("y1", 0).attr("y2", innerH)
          .attr("stroke", "#64748B").attr("stroke-width", 1.2).attr("stroke-dasharray", "4 4").style("opacity", 0);
        const marker = g.append("circle").attr("r", 6).attr("fill", horizon.color)
          .attr("stroke", "#FFFFFF").attr("stroke-width", 2.5).style("opacity", 0);
        const shell = tooltipNode.parentElement;

        const hide = () => {
          crosshair.style("opacity", 0);
          marker.style("opacity", 0);
          tooltipNode.classList.remove("is-visible");
          tooltipNode.setAttribute("aria-hidden", "true");
        };

        const show = (event) => {
          const [mx] = d3.pointer(event, g.node());
          const idx = Math.max(0, Math.min(points.length - 1, Math.round((mx - x(dates[0])) / (x.step() || 1))));
          const pt = points[idx];
          const px = x(pt.date);
          const val = pt[horizon.key];
          crosshair.attr("x1", px).attr("x2", px).style("opacity", 0.65);
          if (Number.isFinite(val)) {
            marker.attr("cx", px).attr("cy", y(val)).style("opacity", 1);
          } else {
            marker.style("opacity", 0);
          }
          tooltipNode.querySelector(".tooltip-overline").textContent = `${monthLabel(pt.date)} · ${scopeLabelText}`;
          const body = tooltipNode.querySelector(".tooltip-body");
          body.replaceChildren();
          const row1 = el("div", "tooltip-row");
          const lbl = el("span", "", `${horizon.shortLabel} :`);
          lbl.style.color = horizon.color;
          lbl.style.fontWeight = "600";
          row1.append(lbl, el("strong", "", formatTrarPercent(val)));
          body.append(row1);

          const yoy = pt[`${horizon.key}_yoy`];
          if (Number.isFinite(yoy)) {
            const row2 = el("div", "tooltip-row");
            row2.append(el("span", "", "Écart annuel :"), el("strong", "", formatTrarChange(yoy)));
            body.append(row2);
          }

          if (benchByDate && Number.isFinite(benchByDate.get(pt.date))) {
            const rowB = el("div", "tooltip-row");
            rowB.append(el("span", "", `${benchmarkLabel} :`), el("strong", "", formatTrarPercent(benchByDate.get(pt.date))));
            body.append(rowB);
          }

          tooltipNode.classList.add("is-visible");
          tooltipNode.setAttribute("aria-hidden", "false");

          const shellBounds = shell.getBoundingClientRect();
          const svgBounds = svgNode.getBoundingClientRect();
          const sx = svgBounds.left - shellBounds.left + (margin.left + px) * svgBounds.width / width;
          const sy = svgBounds.top - shellBounds.top + (margin.top + (Number.isFinite(val) ? y(val) : innerH / 2)) * svgBounds.height / height;
          const tw = tooltipNode.offsetWidth;
          const th = tooltipNode.offsetHeight;
          const left = sx + 16 + tw <= shellBounds.width ? sx + 16 : sx - tw - 16;
          tooltipNode.style.left = `${Math.max(8, Math.min(shellBounds.width - tw - 8, left))}px`;
          tooltipNode.style.top = `${Math.max(8, Math.min(shellBounds.height - th - 8, sy - th - 12))}px`;
        };

        g.append("rect").attr("width", innerW).attr("height", innerH).attr("fill", "none").attr("pointer-events", "all")
          .on("pointermove", show).on("pointerleave", hide);
      }

      /* ====================================================================
         CARTE DÉPARTEMENTALE / TREEMAP NATIONAL (COULEURS CONJONCTURE)
         ==================================================================== */
      function getDeptGeometry(features) {
        let geom = deptGeomCache.get(features);
        if (!geom) {
          const collection = { type: "FeatureCollection", features };
          const projection = d3.geoMercator().fitSize([700, 520], collection);
          const pathGen = d3.geoPath(projection);
          const [[x0, y0], [x1, y1]] = pathGen.bounds(collection);
          const inset = 26;
          const viewBox = Number.isFinite(x0)
            ? [x0 - inset, y0 - inset, x1 - x0 + 2 * inset, y1 - y0 + 2 * inset].join(" ")
            : "0 0 700 520";
          const paths = new Map();
          const centroids = new Map();
          features.forEach((f) => {
            paths.set(f.properties.code, pathGen(f));
            centroids.set(f.properties.code, pathGen.centroid(f));
          });
          geom = { viewBox, paths, centroids };
          deptGeomCache.set(features, geom);
        }
        return geom;
      }

      function renderConjonctureLegend(snapshot) {
        const legend = el("div", "trar-snapshot-legend");
        const { thresholds, colors, values } = snapshot;
        if (values.size) {
          colors.forEach((color, idx) => {
            const lower = thresholds[idx - 1];
            const upper = thresholds[idx];
            let interval = formatTrarPercent(values.values().next().value);
            if (upper !== undefined) {
              interval = `${lower === undefined ? "" : `${formatTrarPercent(lower)} à `}< ${formatTrarPercent(upper)}`;
            } else if (lower !== undefined) {
              interval = `≥ ${formatTrarPercent(lower)}`;
            }
            const key = el("span", "trar-color-key");
            const swatch = el("i", "is-square");
            swatch.style.backgroundColor = color;
            key.append(swatch, document.createTextNode(interval));
            legend.append(key);
          });
        }
        return legend;
      }

      function renderDeptMapOrTreemap({
        features,
        entries,
        activeCode,
        onSelectDept,
      }) {
        const isNational = appState.scope === "national";
        const shell = el("div", isNational ? "trar-treemap-shell" : "trar-map-shell");
        const tooltip = el("div", "employment-tooltip");
        tooltip.setAttribute("aria-hidden", "true");
        tooltip.append(el("div", "tooltip-overline"), el("div", "tooltip-body"));

        const showDeptTooltip = (event, entry) => {
          const bounds = shell.getBoundingClientRect();
          tooltip.querySelector(".tooltip-overline").textContent = `${entry.name} (${entry.code})`;
          const body = tooltip.querySelector(".tooltip-body");
          body.replaceChildren();
          const r1 = el("div", "tooltip-row");
          r1.append(el("span", "", `${horizonByKey(appState.deptHorizon).shortLabel} :`), el("strong", "", formatTrarPercent(entry.value)));
          body.append(r1);
          if (Number.isFinite(entry.change)) {
            const r2 = el("div", "tooltip-row");
            r2.append(el("span", "", "Écart annuel :"), el("strong", "", formatTrarChange(entry.change)));
            body.append(r2);
          }
          tooltip.classList.add("is-visible");
          tooltip.setAttribute("aria-hidden", "false");
          const sx = event.clientX - bounds.left;
          const sy = event.clientY - bounds.top;
          const tw = tooltip.offsetWidth;
          const th = tooltip.offsetHeight;
          const left = sx + 14 + tw <= bounds.width ? sx + 14 : sx - tw - 14;
          tooltip.style.left = `${Math.max(8, Math.min(bounds.width - tw - 8, left))}px`;
          tooltip.style.top = `${Math.max(8, Math.min(bounds.height - th - 8, sy - th - 10))}px`;
        };
        const hideDeptTooltip = () => {
          tooltip.classList.remove("is-visible");
          tooltip.setAttribute("aria-hidden", "true");
        };

        const enableSelection = (selection, entryOf) => {
          selection.filter((datum) => entryOf(datum)?.hasHistory)
            .attr("role", "button")
            .attr("tabindex", 0)
            .attr("data-department-code", (datum) => entryOf(datum).code)
            .attr("aria-pressed", (datum) => String(entryOf(datum).code === activeCode))
            .attr("aria-label", (datum) => {
              const { name, code, value } = entryOf(datum);
              return `${name} (${code}) · ${Number.isFinite(value) ? formatTrarPercent(value) : "Taux indisponible"}`;
            })
            .on("click", (event, datum) => {
              onSelectDept(entryOf(datum).code, event.currentTarget === document.activeElement);
            })
            .on("keydown", (event, datum) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              if (!event.repeat) onSelectDept(entryOf(datum).code, true);
            });
        };

        if (isNational) {
          const width = 660;
          const height = 470;
          if (!treemapLayoutCache) {
            const grouped = d3.groups(DEPT_FEATURES, (f) => f.properties.region);
            const root = d3.hierarchy({
              children: grouped.map(([code, fs]) => ({
                code,
                children: fs.map((f) => ({ code: f.properties.code })),
              })),
            }).sum((n) => (n.children ? 0 : 1))
              .sort((a, b) => b.value - a.value || a.data.code.localeCompare(b.data.code, "fr"));
            d3.treemap().tile(d3.treemapSquarify.ratio(1)).size([width, height])
              .paddingInner((n) => (n.depth === 0 ? 4 : 2))
              .paddingLeft(3).paddingRight(3).paddingBottom(3)
              .paddingTop((n) => (n.depth === 1 && n.y1 - n.y0 >= 38 ? 18 : 3)).round(true)(root);
            treemapLayoutCache = root;
          }
          const byCode = new Map(entries.map((e) => [e.code, e]));
          const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": "Treemap des départements" });
          const d3Svg = d3.select(svg);
          const groups = d3Svg.selectAll("g.trar-region-group").data(treemapLayoutCache.children).join("g")
            .attr("class", "trar-region-group")
            .attr("transform", (n) => `translate(${n.x0},${n.y0})`);
          groups.append("rect").attr("rx", 4).attr("width", (n) => n.x1 - n.x0).attr("height", (n) => n.y1 - n.y0);
          groups.append("text").attr("class", "trar-region-text").attr("x", 5).attr("y", 12).text((n) => {
            if (n.y1 - n.y0 < 38) return "";
            const name = REGIONS_BY_CODE.get(n.data.code)?.name || n.data.code;
            const maxChars = Math.floor((n.x1 - n.x0 - 10) / 5.8);
            return name.length <= maxChars ? name : maxChars >= 4 ? `${name.slice(0, maxChars - 1)}…` : "";
          });
          const tiles = groups.selectAll("g.trar-department-tile").data((n) => n.children).join("g")
            .attr("class", (n) => `trar-department-tile${n.data.code === activeCode ? " is-selected" : ""}`)
            .attr("transform", (n) => `translate(${n.x0 - n.parent.x0},${n.y0 - n.parent.y0})`)
            .on("pointermove", (event, n) => {
              const entry = byCode.get(n.data.code);
              if (entry) showDeptTooltip(event, entry);
            })
            .on("pointerleave", hideDeptTooltip);
          enableSelection(tiles, (n) => byCode.get(n.data.code));
          tiles.append("rect").attr("rx", 3)
            .attr("width", (n) => n.x1 - n.x0).attr("height", (n) => n.y1 - n.y0)
            .attr("fill", (n) => byCode.get(n.data.code)?.fill || "#E2E8F0");
          tiles.append("text")
            .attr("x", (n) => (n.x1 - n.x0) / 2)
            .attr("y", (n) => (n.y1 - n.y0) / 2 - (n.x1 - n.x0 >= 44 && n.y1 - n.y0 >= 30 ? 5 : 0))
            .text((n) => (n.x1 - n.x0 >= 18 && n.y1 - n.y0 >= 14 ? n.data.code : ""));
          tiles.append("text").attr("class", "trar-tile-rate")
            .attr("x", (n) => (n.x1 - n.x0) / 2)
            .attr("y", (n) => (n.y1 - n.y0) / 2 + 8)
            .text((n) => (n.x1 - n.x0 >= 44 && n.y1 - n.y0 >= 30 ? formatTrarPercent(byCode.get(n.data.code)?.value) : ""));
          shell.append(svg, tooltip);
          return shell;
        }

        // Regional SVG map
        const { viewBox, paths, centroids } = getDeptGeometry(features);
        const svg = svgEl("svg", { viewBox, role: "group", "aria-label": `Carte départementale · ${currentScopeLabel()}` });
        const d3Svg = d3.select(svg);
        const sortedEntries = [...entries].sort((a, b) => (a.code === activeCode ? 1 : b.code === activeCode ? -1 : 0));

        const departments = d3Svg.selectAll("path.trar-map-department").data(sortedEntries).join("path")
          .attr("class", (d) => `trar-map-department${d.code === activeCode ? " is-selected" : ""}`)
          .attr("d", (d) => paths.get(d.code))
          .attr("fill", (d) => d.fill)
          .on("pointermove", (event, d) => showDeptTooltip(event, d))
          .on("pointerleave", hideDeptTooltip);
        enableSelection(departments, (d) => d);

        // Labels on map
        entries.forEach((d) => {
          const [cx, cy] = centroids.get(d.code) || [];
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
          const isSelected = d.code === activeCode;
          const lbl = svgEl("text", { x: cx, y: cy - (isSelected ? 7 : 0), class: "trar-map-label" });
          lbl.textContent = d.code;
          svg.append(lbl);
          if (isSelected && Number.isFinite(d.value)) {
            const val = svgEl("text", { x: cx, y: cy + 9, class: "trar-map-sublabel" });
            val.textContent = formatTrarPercent(d.value);
            svg.append(val);
          }
        });

        shell.append(svg, tooltip);
        return shell;
      }

      /* ====================================================================
         RENDU DE LA MAQUETTE TRAR
         ==================================================================== */
      const root = document.getElementById("trarRoot");

      function renderMockup() {
        root.replaceChildren();
        const isNational = appState.scope === "national";
        const mainSectorKey = isNational ? appState.nationalSector : appState.regionalSector;
        const mainOptions = isNational ? TRAR.sectors.national : TRAR.sectors.regional;
        const mainSector = mainOptions.find((o) => o.key === mainSectorKey) || mainOptions[0];
        const mainScope = isNational ? TRAR.national : TRAR.regions[appState.scope];
        const mainDashboard = isNational ? TRAR.dashboards.national : TRAR.dashboards.regions[appState.scope];
        const mainHorizon = horizonByKey(appState.mainHorizon);
        const mainSeriesData = getTrarSeries(mainScope?.[mainSector.key]);
        const mainLatest = mainSeriesData.latest[mainHorizon.key];
        const mainChanges = mainDashboard?.changes?.[mainSector.key]?.[mainHorizon.index];

        const compareWithAllSectors = mainSector.key !== "tous-secteurs";
        const mainBenchmark = compareWithAllSectors
          ? getTrarSeries(mainScope?.["tous-secteurs"])
          : isNational ? null : getTrarSeries(TRAR.national?.["tous-secteurs"]);
        const mainBenchmarkLabel = compareWithAllSectors ? "Tous secteurs" : "France entière · Tous secteurs";

        const setMainSector = (key) => {
          if (isNational) appState.nationalSector = key;
          else appState.regionalSector = key;
          renderMockup();
        };

        const setMainHorizon = (key) => {
          appState.mainHorizon = key;
          renderMockup();
        };

        /* ---------------- BLOC 1 : GRAPHIQUE PRINCIPAL + KPI DROIT ---------------- */
        const stack = el("div", "trar-stack");
        const block1 = el("article", "trar-card");
        const grid1 = el("div", "employment-grid");
        const mainPanel = el("div", "employment-main");

        const intro1 = el("div", "employment-intro");
        const title1 = el("div", "employment-title");
        title1.append(
          el("h2", "", "Taux de reste à recouvrer"),
          el("span", "", `${currentScopeLabel()} · ${mainSector.label} · ${mainHorizon.label}`)
        );

        const controls1 = el("div", "employment-controls");
        controls1.append(
          buildMainSectorPicker({
            selectedKey: mainSector.key,
            onSelect: setMainSector,
            horizonKey: mainHorizon.key,
          })
        );

        const rightControls1 = el("div", "trar-panel-controls");
        rightControls1.append(buildHorizonSwitch(mainHorizon.key, setMainHorizon));
        controls1.append(rightControls1);
        intro1.append(title1, controls1);

        const chartShell1 = el("div", "employment-chart-shell");
        const chartSvg1 = svgEl("svg", { viewBox: "0 0 940 460", role: "img", "aria-label": "Évolution mensuelle du taux de reste à recouvrer" });
        const chartTip1 = el("div", "employment-tooltip");
        chartTip1.setAttribute("aria-hidden", "true");
        chartTip1.append(el("div", "tooltip-overline"), el("div", "tooltip-body"));
        chartShell1.append(chartSvg1, chartTip1);

        const legend1 = el("div", "legend-row");
        const chip = el("span", "legend-chip");
        const lineSample = el("i", "trar-line-sample");
        lineSample.style.borderColor = mainHorizon.color;
        chip.append(lineSample, document.createTextNode(`${mainHorizon.label} (${mainSector.label})`));
        legend1.append(chip);
        if (mainBenchmark) {
          const bChip = el("span", "legend-chip");
          const bLine = el("i", "trar-line-sample");
          bLine.style.borderColor = "#64748B";
          bLine.style.borderTopStyle = "dashed";
          bChip.append(bLine, document.createTextNode(`Référence · ${mainBenchmarkLabel}`));
          legend1.append(bChip);
        }

        mainPanel.append(intro1, chartShell1, legend1);

        // Right Dashboard Panel (ONLY ONE TAUX AT ONCE)
        const side1 = el("div", "employment-side trar-dashboard-panel");
        const ctx1 = el("div", "employment-dashboard-context");
        ctx1.append(
          el("span", "", `${currentScopeLabel()} · ${mainSector.label}`),
          el("time", "", mainLatest?.date ? monthLabel(mainLatest.date) : "—")
        );
        side1.append(ctx1);

        const reference = mainBenchmark?.latest[mainHorizon.key];
        let comparison = null;
        if (mainLatest && reference) {
          const diff = Number((mainLatest.value - reference.value).toFixed(2));
          comparison = el("div", `trar-benchmark-gap ${diff > 0 ? "is-higher" : diff < 0 ? "is-lower" : ""}`);
          comparison.append(
            document.createTextNode(`Écart vs ${mainBenchmarkLabel} : `),
            el("strong", "", formatTrarChange(diff))
          );
        }

        side1.append(buildSingleKpiCard({
          horizon: mainHorizon,
          latestPoint: mainLatest,
          changes: mainChanges,
          comparison,
        }));

        side1.append(buildTopSectorsBlock({
          options: mainOptions,
          dashboard: mainDashboard,
          horizonIndex: mainHorizon.index,
          selectedKey: mainSector.key,
          onSelect: setMainSector,
        }));

        grid1.append(mainPanel, side1);
        block1.append(grid1);
        stack.append(block1);

        drawSingleLineChart({
          svgNode: chartSvg1,
          tooltipNode: chartTip1,
          points: mainSeriesData.points,
          horizon: mainHorizon,
          scopeLabelText: `${currentScopeLabel()} · ${mainSector.label}`,
          benchmarkPoints: mainBenchmark?.points,
          benchmarkLabel: mainBenchmarkLabel,
        });

        /* ---------------- BLOC 2 : CARTE DÉPARTEMENTALE + HISTORIQUE CÔTE À CÔTE ---------------- */
        const deptSector = TRAR.sectors.departmental.find((s) => s.key === appState.deptSector) || TRAR.sectors.departmental[0];
        const deptHorizon = horizonByKey(appState.deptHorizon);
        const snapshot = getSnapshot(deptSector.key, deptHorizon.key, appState.scope);
        const features = isNational ? DEPT_FEATURES : (DEPTS_BY_REGION.get(appState.scope) || []);
        const entries = buildDepartmentEntries(snapshot, features, deptSector.key);
        const highestRateDept = findHighestRateDept(entries);
        const activeDeptCode = ensureActiveDeptCode(entries, highestRateDept);
        const activeDept = entries.find((d) => d.code === activeDeptCode) || entries[0];

        const block2 = el("article", "trar-card");
        const panel2 = el("div", "trar-dept-panel");

        const head2 = el("div", "trar-panel-head");
        const title2 = el("div", "employment-title");
        title2.append(
          el("h2", "", "Taux de reste à recouvrer par département"),
          el("span", "", `${currentScopeLabel()} · ${deptSector.label} · ${deptHorizon.label} · ${snapshot.date ? monthLabel(snapshot.date) : "—"}`)
        );

        const controls2 = el("div", "trar-panel-controls");
        controls2.append(
          buildGrandSectorPicker({
            selectedKey: deptSector.key,
            onSelect: (key) => { appState.deptSector = key; renderMockup(); },
          }),
          buildHorizonSwitch(deptHorizon.key, (key) => { appState.deptHorizon = key; renderMockup(); })
        );
        head2.append(title2, controls2);
        panel2.append(head2);

        const splitGrid = el("div", "trar-split-grid");

        // Carte départementale et légende
        const mapCol = el("div", "trar-map-column");
        if (highestRateDept) {
          const maxChip = el("div", "trar-max-chip");
          maxChip.append(
            el("span", "trar-max-chip-dot"),
            document.createTextNode(
              `Plus fort taux : ${highestRateDept.name} (${highestRateDept.code}) · ${formatTrarPercent(highestRateDept.value)}`
            )
          );
          mapCol.append(maxChip);
        }

        const onSelectDept = (code, keepFocus) => {
          setActiveDeptCode(code);
          renderMockup();
          if (keepFocus) {
            root.querySelector(`[data-department-code="${CSS.escape(code)}"]`)?.focus({ preventScroll: true });
          }
        };

        mapCol.append(
          renderDeptMapOrTreemap({
            features,
            entries,
            activeCode: activeDeptCode,
            onSelectDept,
          }),
          renderConjonctureLegend(snapshot)
        );

        const histCol = el("div", "trar-history-column");
        const deptSeries = getTrarSeries(TRAR.departments[activeDept?.code]?.[deptSector.key]);
        const recentDeptPoints = lastThreeYears(deptSeries, deptHorizon.key);
        const deptBenchmark = getTrarSeries(mainScope?.["tous-secteurs"]);

        const histHead = el("div", "trar-history-head");
        const histMeta = el("div", "trar-history-meta");
        const histPeriod = el("span");
        histPeriod.setAttribute("aria-live", "polite");
        histMeta.append(
          el("h3", "", activeDept ? `Historique · ${activeDept.name} (${activeDept.code})` : "Historique départemental"),
          histPeriod
        );
        const periodButton = el("button", "trar-history-period");
        periodButton.type = "button";
        periodButton.setAttribute("aria-controls", "trar-dept-history-chart");
        histHead.append(histMeta, periodButton);
        histCol.append(histHead);

        // Department Mini KPI Strip
        if (activeDept) {
          const avgLast = deptBenchmark.latest[deptHorizon.key]?.value;
          const gapVsRegion = (Number.isFinite(activeDept.value) && Number.isFinite(avgLast))
            ? Number((activeDept.value - avgLast).toFixed(2))
            : null;
          const kpiRow = el("div", "trar-dept-kpis");

          const k1 = el("div", "trar-mini-kpi");
          k1.append(el("small", "", deptHorizon.shortLabel), el("strong", "", formatTrarPercent(activeDept.value)));
          const k2 = el("div", "trar-mini-kpi");
          const k2Val = el("strong", "", formatTrarChange(activeDept.change));
          if (Number.isFinite(activeDept.change)) {
            k2Val.style.color = activeDept.change > 0 ? "var(--dashboard-red)" : activeDept.change < 0 ? "var(--dashboard-green)" : "";
          }
          k2.append(el("small", "", "Gliss. annuel"), k2Val);
          const k3 = el("div", "trar-mini-kpi");
          const k3Val = el("strong", "", formatTrarChange(gapVsRegion));
          if (Number.isFinite(gapVsRegion)) {
            k3Val.style.color = gapVsRegion > 0 ? "var(--dashboard-red)" : gapVsRegion < 0 ? "var(--dashboard-green)" : "";
          }
          k3.append(el("small", "", isNational ? "Écart vs France" : "Écart vs région"), k3Val);

          kpiRow.append(k1, k2, k3);
          histCol.append(kpiRow);
        }

        const deptChartShell = el("div", "employment-chart-shell");
        deptChartShell.id = "trar-dept-history-chart";
        const deptSvg = svgEl("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": "Historique du département sélectionné" });
        const deptTip = el("div", "employment-tooltip");
        deptTip.setAttribute("aria-hidden", "true");
        deptTip.append(el("div", "tooltip-overline"), el("div", "tooltip-body"));
        deptChartShell.append(deptSvg, deptTip);
        histCol.append(deptChartShell);

        const deptLegend = el("div", "legend-row");
        const c1 = el("span", "legend-chip");
        const l1 = el("i", "trar-line-sample");
        l1.style.borderColor = deptHorizon.color;
        c1.append(l1, document.createTextNode(`${activeDept ? activeDept.name : "Département"} (${deptHorizon.shortLabel})`));
        deptLegend.append(c1);
        const c2 = el("span", "legend-chip");
        const l2 = el("i", "trar-line-sample");
        l2.style.borderColor = "#64748B";
        l2.style.borderTopStyle = "dashed";
        c2.append(l2, document.createTextNode(isNational ? "Moyenne nationale (Tous secteurs)" : `Moyenne ${currentScopeLabel()} (Tous secteurs)`));
        deptLegend.append(c2);
        histCol.append(deptLegend);

        splitGrid.append(mapCol, histCol);
        panel2.append(splitGrid);
        block2.append(panel2);
        stack.append(block2);
        root.append(stack);

        function updateDeptChart() {
          const showFull = appState.showFullDeptHistory;
          const points = showFull ? deptSeries.points : recentDeptPoints;
          const firstDate = points[0]?.date;
          const lastDate = points.at(-1)?.date;
          const benchmarkPoints = firstDate
            ? deptBenchmark.points.filter(({ date }) => date >= firstDate && date <= lastDate)
            : [];
          const label = showFull ? "Série complète" : "3 dernières années";
          const action = showFull ? "Afficher les trois dernières années" : "Afficher la série complète";
          periodButton.textContent = label;
          periodButton.setAttribute("aria-label", `${label}. ${action}`);
          histPeriod.textContent = `${deptSector.label} · ${deptHorizon.label}${firstDate ? ` · depuis ${monthLabel(firstDate)}` : ""}`;
          deptTip.classList.remove("is-visible");
          deptTip.setAttribute("aria-hidden", "true");
          drawSingleLineChart({
            svgNode: deptSvg,
            tooltipNode: deptTip,
            points,
            horizon: deptHorizon,
            scopeLabelText: activeDept ? `${activeDept.name} (${activeDept.code})` : "",
            benchmarkPoints,
            benchmarkLabel: currentScopeLabel(),
            viewBoxWidth: 640,
            compactHeight: 360,
          });
        }

        periodButton.addEventListener("click", () => {
          appState.showFullDeptHistory = !appState.showFullDeptHistory;
          updateDeptChart();
        });
        updateDeptChart();
      }

      initGeoControl();
      renderMockup();
    })();
  </script>
</body>
</html>
"""


def main() -> None:
    payload_json = json.dumps(build_payload(), ensure_ascii=False, separators=(",", ":"))
    payload_json = payload_json.replace("</", "<\\/")
    html = (
        HTML_TEMPLATE
        .replace("__LOGO_URI__", load_logo_data_uri())
        .replace("__D3_SOURCE__", load_d3_source())
        .replace("__PAYLOAD_JSON__", payload_json)
    )
    targets = [
        OUTPUT_DIR / "trar_mockups.html",
        ROOT / "Assets" / "Mockups" / "trar_mockups.html",
    ]
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(html, encoding="utf-8", newline="\n")
        print(f"Wrote {target} ({target.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
