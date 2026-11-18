"""Génère la maquette HTML à 5 variantes pour la refonte du module TRAR."""
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
  <title>Taux de reste à recouvrer · 5 Variantes — Santé des entreprises Urssaf</title>
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
      --muted-soft: #64748B;
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
      --treemap-pos-deep: #10AD8D;
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
       BARRE DE NAVIGATION PRODUIT & STUDIO COMPARATEUR
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

    /* Studio switcher bar */
    .studio-bar {
      position: relative;
      z-index: 95;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px 14px;
      padding: 10px 14px;
      margin-bottom: 14px;
      border-radius: 12px;
      background: #F8FAFC;
      border: 1px solid #D4DEE9;
    }

    .studio-brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .studio-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--topic-accent);
      box-shadow: 0 0 0 4px rgba(0, 129, 109, 0.14);
      flex: none;
    }

    .studio-brand strong {
      font: 800 0.86rem/1.2 var(--font-display);
      color: var(--ink);
      letter-spacing: -0.02em;
    }

    .studio-brand span {
      display: block;
      font-size: 0.72rem;
      color: var(--muted-soft);
    }

    .studio-tabs {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      padding: 4px;
      border-radius: 10px;
      background: #F1F5F9;
      border: 1px solid #E2E8F0;
    }

    .studio-tab {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      min-height: 34px;
      padding: 6px 11px;
      border: 1px solid transparent;
      border-radius: 7px;
      background: transparent;
      color: #475569;
      font: 700 0.78rem/1.2 var(--font-sans);
      transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    }

    .studio-tab:hover {
      color: var(--ink);
      background: rgba(255, 255, 255, 0.72);
    }

    .studio-tab.is-active {
      color: #FFFFFF;
      background: #0B1D3A;
      border-color: #0B1D3A;
      box-shadow: 0 4px 12px rgba(11, 29, 58, 0.18);
    }

    .studio-tab-num {
      font-variant-numeric: tabular-nums;
      opacity: 0.78;
      font-size: 0.72rem;
    }

    .studio-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }

    .studio-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 34px;
      padding: 6px 11px;
      border-radius: 8px;
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: var(--ink);
      font: 600 0.76rem/1.2 var(--font-sans);
      transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
    }

    .studio-pill:hover {
      background: #F8FAFC;
      border-color: #94A3B8;
    }

    .studio-pill.is-active {
      color: #075953;
      background: #E6F5F2;
      border-color: #99D5C9;
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
       FRAMES VARIANTES & BANNIÈRES
       ====================================================================== */
    .variant-frame {
      display: none;
    }

    .variant-frame.is-visible {
      display: block;
    }

    body.is-showcase .variant-frame {
      display: block;
      margin-bottom: 48px;
      padding-bottom: 36px;
      border-bottom: 2px dashed #CBD5E1;
    }

    body.is-showcase .variant-frame:last-child {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: 0;
    }

    .variant-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 14px;
      padding: 12px 16px;
      border-radius: 12px;
      background: #F8FAFC;
      border: 1px solid #D9E2EC;
    }

    .variant-banner-main {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .variant-num {
      display: inline-grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 9px;
      background: #0B1D3A;
      color: #FFFFFF;
      font: 800 13px/1 var(--font-display);
      flex: none;
    }

    .variant-banner h2 {
      margin: 0;
      font: 800 1rem/1.25 var(--font-display);
      color: var(--ink);
      letter-spacing: -0.02em;
    }

    .variant-banner p {
      margin: 2px 0 0;
      font-size: 0.8rem;
      color: #475569;
    }

    .variant-tags {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }

    .variant-tag {
      padding: 4px 10px;
      border-radius: 999px;
      background: #FFFFFF;
      border: 1px solid #CBD5E1;
      color: #1E293B;
      font: 600 0.72rem/1.2 var(--font-sans);
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

    .employment-title h3,
    .employment-title h4 {
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
      width: min(100%, 220px);
      flex: 0 1 220px;
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

    .trar-dept-picker {
      --sector-picker-active: #004B9B;
      width: min(100%, 285px);
      flex: 0 1 285px;
    }

    .trar-dept-picker .employment-sector-menu {
      width: min(410px, calc(100vw - 60px));
      padding: 20px 22px;
    }

    .trar-dept-picker.align-right .employment-sector-menu {
      left: auto;
      right: 0;
    }

    .trar-dept-picker .employment-sector-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .trar-dept-picker .employment-sector-column {
      padding-right: 0;
    }

    .trar-dept-picker .employment-sector-column::after {
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

    .employment-swatch {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 3px;
    }

    .employment-swatch-positive { background: var(--treemap-pos-deep); }
    .employment-swatch-negative { background: var(--treemap-neg-deep); }

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

    .trar-kpi-kicker {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }

    .employment-dashboard-level-label {
      color: var(--dashboard-muted);
      font: 700 0.76rem/1.3 var(--font-sans);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .trar-horizon-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 999px;
      font: 700 0.7rem/1.2 var(--font-sans);
      background: #F1F5F9;
      color: #0B1E36;
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

    .trar-interpretation {
      position: relative;
      z-index: 1;
      margin: 0;
      padding: 10px 12px 10px 32px;
      border-radius: 10px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      color: #475569;
      font: 500 0.8rem/1.5 var(--font-sans);
    }

    .trar-interpretation::before {
      content: "i";
      position: absolute;
      left: 11px;
      top: 11px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(0, 158, 219, 0.14);
      color: #0284C7;
      font: 800 11px/16px var(--font-sans);
      text-align: center;
    }

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
      flex: 1 1 260px;
    }

    .trar-panel-controls {
      display: flex;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 10px;
    }

    .trar-split-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 18px;
      align-items: stretch;
    }

    .trar-split-grid--46-54 { grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr); }
    .trar-split-grid--48-52 { grid-template-columns: minmax(0, 0.96fr) minmax(0, 1.04fr); }
    .trar-split-grid--44-56 { grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr); }

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
      display: grid;
      place-items: center;
      min-height: 360px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      padding: 10px;
      overflow: hidden;
    }

    .trar-map-shell svg {
      width: 100%;
      height: auto;
      max-height: 430px;
      display: block;
    }

    .trar-map-department {
      stroke: #FFFFFF;
      stroke-width: 1.5px;
      cursor: pointer;
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

    .trar-department-tile {
      cursor: pointer;
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

    .employment-treemap-swatch {
      display: inline-block;
      width: 18px;
      height: 9px;
      border-radius: 999px;
    }

    .trar-color-key i.is-square {
      width: 13px;
      height: 13px;
      border-radius: 4px;
      border: 1px solid rgba(15, 23, 42, 0.14);
      display: inline-block;
    }

    .trar-history-head {
      position: relative;
      z-index: 30;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }

    .trar-history-meta h5 {
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

    /* ======================================================================
       STYLES SPÉCIFIQUES AUX 5 VARIANTES
       ====================================================================== */
    /* Variant 2 : Podium départemental + Sparkline KPI + Zoom 2022 */
    .v2-spark-box {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #F1F5F9;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .v2-spark-box span {
      font-size: 0.72rem;
      font-weight: 600;
      color: #64748B;
    }

    .v2-podium {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .v2-podium-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: #1E293B;
      font: 600 0.76rem/1.2 var(--font-sans);
      transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
    }

    .v2-podium-btn:hover {
      border-color: #0B1D3A;
      transform: translateY(-1px);
    }

    .v2-podium-btn.is-active {
      background: #0B1D3A;
      border-color: #0B1D3A;
      color: #FFFFFF;
      box-shadow: 0 6px 14px rgba(11, 29, 58, 0.16);
    }

    .v2-podium-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex: none;
    }

    /* Variant 3 : Inline bars dans Top 5 */
    .v3-bar-cell {
      position: relative;
    }

    .v3-rate-bar {
      height: 4px;
      border-radius: 999px;
      background: #E2E8F0;
      margin-top: 4px;
      overflow: hidden;
    }

    .v3-rate-bar > i {
      display: block;
      height: 100%;
      border-radius: 999px;
      background: var(--treemap-neg-deep);
    }

    /* Variant 4 : Executive Horizon Tabs + Dept Leaderboard */
    .v4-kpi-tabs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 4px;
      padding: 4px;
      border-radius: 10px;
      background: #E2E8F0;
    }

    .v4-kpi-tab {
      padding: 7px 6px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #334155;
      font: 700 0.74rem/1.2 var(--font-sans);
      text-align: center;
    }

    .v4-kpi-tab.is-active {
      background: #FFFFFF;
      color: #0B1D3A;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
    }

    .v4-leaderboard {
      display: grid;
      gap: 6px;
      max-height: 215px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .v4-leader-row {
      display: grid;
      grid-template-columns: 24px 12px minmax(0, 1fr) auto;
      align-items: center;
      gap: 9px;
      width: 100%;
      padding: 8px 10px;
      border-radius: 9px;
      border: 1px solid #E2E8F0;
      background: #FFFFFF;
      text-align: left;
      transition: border-color 140ms ease, background-color 140ms ease;
    }

    .v4-leader-row:hover {
      border-color: #94A3B8;
      background: #F8FAFC;
    }

    .v4-leader-row.is-active {
      border-color: #0B1D3A;
      background: #EFF6FF;
    }

    .v4-leader-rank {
      font: 800 0.76rem/1 var(--font-display);
      color: #64748B;
      text-align: center;
    }

    .v4-leader-row.is-active .v4-leader-rank {
      color: #0B1D3A;
    }

    .v4-leader-name {
      font: 700 0.8rem/1.25 var(--font-sans);
      color: #0B1E36;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .v4-leader-val {
      font: 800 0.82rem/1.2 var(--font-sans);
      font-variant-numeric: tabular-nums;
      color: #0B1E36;
    }

    /* Variant 5 : Spread comparison badge */
    .v5-spread-pill {
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

    .v5-spread-pill strong {
      font-variant-numeric: tabular-nums;
    }

    .v5-spread-pill.is-higher {
      background: #FFF1F2;
      color: #9F1239;
    }

    .v5-spread-pill.is-lower {
      background: #ECFDF5;
      color: #065F46;
    }

    /* ======================================================================
       RESPONSIVE
       ====================================================================== */
    @media (max-width: 1120px) {
      .employment-grid,
      .trar-split-grid,
      .trar-split-grid--46-54,
      .trar-split-grid--48-52,
      .trar-split-grid--44-56 {
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
  </style>
</head>
<body data-topic="entreprises">
  <nav class="page-links" aria-label="Lectures du baromètre">
    <a href="barometre_entreprises.html">Page production</a>
    <a href="barometre_emploi.html">Conjoncture de l’emploi</a>
  </nav>

  <div class="page">
    <div class="shell">
      <aside class="studio-bar" aria-label="Comparateur des 5 variantes">
        <div class="studio-brand">
          <span class="studio-dot" aria-hidden="true"></span>
          <div>
            <strong>Maquette TRAR · 5 Variantes</strong>
            <span>Refonte Taux de reste à recouvrer &amp; Carte départementale</span>
          </div>
        </div>
        <div class="studio-tabs" role="tablist" aria-label="Choisir une variante">
          <button type="button" class="studio-tab is-active" role="tab" aria-selected="true" data-variant="1">
            <span class="studio-tab-num">01</span> Tech Dashboard
          </button>
          <button type="button" class="studio-tab" role="tab" aria-selected="false" data-variant="2">
            <span class="studio-tab-num">02</span> Focus &amp; Podium
          </button>
          <button type="button" class="studio-tab" role="tab" aria-selected="false" data-variant="3">
            <span class="studio-tab-num">03</span> Style Conjoncture
          </button>
          <button type="button" class="studio-tab" role="tab" aria-selected="false" data-variant="4">
            <span class="studio-tab-num">04</span> Cockpit Exécutif
          </button>
          <button type="button" class="studio-tab" role="tab" aria-selected="false" data-variant="5">
            <span class="studio-tab-num">05</span> Atelier Comparatif
          </button>
        </div>
        <div class="studio-actions">
          <button type="button" class="studio-pill" data-quick-geo="24">Centre-Val de Loire</button>
          <button type="button" class="studio-pill" data-quick-geo="11">Île-de-France</button>
          <button type="button" class="studio-pill" data-quick-geo="national">France entière</button>
          <button type="button" class="studio-pill" id="toggleShowcaseBtn">Comparer les 5</button>
        </div>
      </aside>

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

      <main id="variantsRoot"></main>
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
      const DEPT_BY_CODE = new Map(DEPT_FEATURES.map((feature) => [feature.properties.code, feature]));
      const DEPTS_BY_REGION = d3.group(DEPT_FEATURES, (feature) => feature.properties.region);

      const CONJONCTURE_COLORS = ["#10AD8D", "#62DDB1", "#F6C65B", "#FF967D", "#ED4766"];
      const TRAR_HORIZONS = [
        { key: "j90", index: 2, label: "90 jours après l’échéance", shortLabel: "À 90 jours", color: "#98511F" },
        { key: "moisSuivant", index: 1, label: "Fin du mois suivant", shortLabel: "Mois suivant", color: "#087783" },
        { key: "fin", index: 0, label: "Fin du mois d’échéance", shortLabel: "À l’échéance", color: "#004B9B" },
      ];
      const TRAR_COLOR_MODES = [
        { key: "rate", label: "Taux" },
        { key: "annual", label: "Écart annuel" },
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

      const VARIANTS = [
        {
          id: 1,
          title: "Variante 01 · Tech Dashboard Unifié (Standard Produit)",
          desc: "Un seul taux sur le graphique (À 90 jours par défaut) et un seul KPI actif à droite. Carte départementale colorée comme le treemap Conjoncture côte à côte avec l’historique du plus fort taux actif.",
          tags: ["À 90 jours par défaut", "KPI unique synchronisé", "Dropdown NACE 4 colonnes", "Carte + Graphe 50/50"],
        },
        {
          id: 2,
          title: "Variante 02 · Focus Post-Covid & Podium Départemental",
          desc: "Ajoute une bascule de fenêtre temporelle (Depuis 2022 vs 2019) pour lire les variations récentes sans écrasement par le pic 2020, une sparkline 12 mois dans le KPI unique et un podium cliquable sous la carte.",
          tags: ["Zoom 2022–2026", "Sparkline KPI 12 mois", "Podium départements", "Référence régionale"],
        },
        {
          id: 3,
          title: "Variante 03 · Style Conjoncture (Courbe de taux + Barres d’écart annuel)",
          desc: "La courbe foncée indique le taux sur l’axe de gauche. Les barres vertes et corail indiquent le glissement annuel sur l’axe de droite.",
          tags: ["Courbe + Histogramme YoY", "Palette Conjoncture intégrale", "Étiquettes sur carte", "Barres Top 5"],
        },
        {
          id: 4,
          title: "Variante 04 · Cockpit Exécutif & Classement Éclair",
          desc: "Onglets d’échéance intégrés directement au sommet du KPI unique à droite, ligne de moyenne historique sur le graphe et classement complet des départements couplé à la carte.",
          tags: ["Onglets KPI synchronisés", "Ligne de moyenne", "Leaderboard départements", "Bandeau 3 KPIs dépt."],
        },
        {
          id: 5,
          title: "Variante 05 · Atelier Comparatif (Secteur & Département vs Moyenne)",
          desc: "Affiche les taux en direct dans le sélecteur de secteur et superpose en pointillés la référence « Tous secteurs » (bloc 1) ou la moyenne régionale (bloc 2) pour situer l’écart en points.",
          tags: ["Taux dans le sélecteur", "Courbe de référence", "Badge d’écart en pt", "Comparaison temps réel"],
        },
      ];

      const appState = {
        variant: 1,
        showcase: false,
        scope: PAYLOAD.meta.defaultRegion || "24", // "national" or region code
        mainHorizon: "j90",
        nationalSector: "tous-secteurs",
        regionalSector: "tous-secteurs",
        deptSector: "tous-secteurs",
        deptHorizon: "j90",
        deptColorMode: "rate",
        selectedDeptByScope: {},
        v2Window: "since2022", // "since2022" or "full"
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

      function treemapVariationColorScale(values, valueOf) {
        const maxAbs = Math.max(1.5, d3.max(values, (row) => {
          const v = valueOf(row);
          return Number.isFinite(v) ? Math.abs(v) : 0;
        }) || 0);
        const negative = d3.interpolateRgb("#FF967D", "#ED4766");
        const positive = d3.interpolateRgb("#62DDB1", "#10AD8D");
        const neutral = "#F6C65B";
        return (value) => {
          if (!Number.isFinite(value)) return "#E2E8F0";
          if (Math.abs(value) <= 0.05) return neutral;
          const intensity = Math.sqrt(Math.min(1, Math.abs(value) / maxAbs));
          return value < 0 ? negative(intensity) : positive(intensity);
        };
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
        const annualColor = treemapVariationColorScale(changes.values(), (c) => c);

        const result = { date, values, changes, thresholds, colors, rateColor, annualColor };
        snapshotCache.set(cacheKey, result);
        return result;
      }

      function getRegionalAverageForDept(sectorKey, horizonKey, regionCode) {
        if (regionCode === "national") {
          const scopeSeries = TRAR.national?.["tous-secteurs"];
          return getTrarSeries(scopeSeries).points;
        }
        const scopeSeries = TRAR.regions?.[regionCode]?.["tous-secteurs"];
        return getTrarSeries(scopeSeries).points;
      }

      function buildDepartmentEntries(snapshot, features, sectorKey) {
        const entries = features.map((feature) => {
          const { code, nom: name, region } = feature.properties;
          const value = snapshot.values.get(code);
          const change = snapshot.changes.get(code);
          const annual = appState.deptColorMode === "annual";
          const fill = annual
            ? (Number.isFinite(change) ? snapshot.annualColor(-change) : "#E2E8F0")
            : (Number.isFinite(value) ? snapshot.rateColor(value) : "#E2E8F0");
          const hasHistory = Boolean(TRAR.departments[code]?.[sectorKey]);
          return { code, name, region, value, change, fill, hasHistory, feature };
        });
        return entries;
      }

      function findBiggestDeptCode(entries, colorMode) {
        const candidates = entries.filter((d) => d.hasHistory && Number.isFinite(d.value));
        if (!candidates.length) {
          return entries.find((d) => d.hasHistory)?.code || "";
        }
        const sorted = [...candidates].sort((a, b) => {
          if (colorMode === "annual") {
            const ac = Number.isFinite(a.change) ? a.change : -Infinity;
            const bc = Number.isFinite(b.change) ? b.change : -Infinity;
            if (bc !== ac) return bc - ac;
          }
          return (b.value - a.value) || a.name.localeCompare(b.name, "fr");
        });
        return sorted[0].code;
      }

      function ensureActiveDeptCode(entries) {
        const key = `${appState.scope}:${appState.deptSector}:${appState.deptHorizon}:${appState.deptColorMode}`;
        const saved = appState.selectedDeptByScope[key];
        if (saved && entries.some((d) => d.code === saved && d.hasHistory)) {
          return saved;
        }
        const biggest = findBiggestDeptCode(entries, appState.deptColorMode);
        appState.selectedDeptByScope[key] = biggest;
        return biggest;
      }

      function setActiveDeptCode(code) {
        const key = `${appState.scope}:${appState.deptSector}:${appState.deptHorizon}:${appState.deptColorMode}`;
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
          document.querySelectorAll("[data-quick-geo]").forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.quickGeo === appState.scope);
          });
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
          renderActiveViews();
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

        document.querySelectorAll("[data-quick-geo]").forEach((btn) => {
          btn.addEventListener("click", () => selectScope(btn.dataset.quickGeo));
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
          picker.closest(".employment-main, .trar-panel-head, .trar-history-head")?.classList.remove("has-open-sector-picker");
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
        const triggerVal = el("span", "employment-sector-trigger-value", activeOption ? activeOption.displayLabel || activeOption.label : "—");
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
            const pill = el("span", "picker-rate-pill", opt.badgeText);
            if (opt.badgeBg) pill.style.background = opt.badgeBg;
            right.append(pill);
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
          wrapper.closest(".employment-main, .trar-panel-head, .trar-history-head")
            ?.classList.toggle("has-open-sector-picker", willOpen);
          if (willOpen && searchInput) {
            requestAnimationFrame(() => searchInput.focus());
          }
        });

        wrapper.append(trigger, menu);
        return wrapper;
      }

      function buildMainSectorPicker({ selectedKey, onSelect, showRates = false, horizonIndex = 2 }) {
        const isNational = appState.scope === "national";
        const options = isNational ? TRAR.sectors.national : TRAR.sectors.regional;
        const scopeSeries = isNational ? TRAR.national : TRAR.regions[appState.scope];

        const decorate = (opt) => {
          if (!showRates || !scopeSeries?.[opt.key]) return opt;
          const pts = getTrarSeries(scopeSeries[opt.key]).points;
          const hKey = TRAR_HORIZONS.find((h) => h.index === horizonIndex)?.key || "j90";
          const lastVal = [...pts].reverse().find((p) => Number.isFinite(p[hKey]))?.[hKey];
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
          showRateBadge: showRates,
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

      function buildDepartmentPicker({ entries, selectedCode, onSelect, alignRight = true }) {
        const sorted = entries
          .filter((d) => d.hasHistory)
          .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.name.localeCompare(b.name, "fr"));
        const options = sorted.map((d, idx) => ({
          key: d.code,
          label: `${idx + 1}. ${d.name} (${d.code})`,
          displayLabel: `${d.name} (${d.code})`,
          badgeText: Number.isFinite(d.value) ? formatTrarPercent(d.value) : "—",
          badgeBg: d.fill,
        }));
        return createCustomPicker({
          label: "Département à suivre",
          extraClass: `trar-dept-picker${alignRight ? " align-right" : ""}`,
          menuTitle: "Départements triés par taux actif",
          selectedKey: selectedCode,
          groups: [{ key: "dept", label: currentScopeLabel(), options }],
          searchable: sorted.length > 12,
          showRateBadge: true,
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

      function buildColorModeSwitch(activeKey, onChange) {
        const wrap = el("div", "metric-switch");
        wrap.setAttribute("role", "group");
        wrap.setAttribute("aria-label", "Mode de couleur de la carte");
        TRAR_COLOR_MODES.forEach((mode) => {
          const btn = el("button", `metric-button${mode.key === activeKey ? " is-active" : ""}`, mode.label);
          btn.type = "button";
          btn.setAttribute("aria-pressed", String(mode.key === activeKey));
          btn.addEventListener("click", () => onChange(mode.key));
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

      function trarInterpretationText(yoy, mom, horizon) {
        const dirYoy = !Number.isFinite(yoy) ? "u" : yoy > 0.05 ? "up" : yoy < -0.05 ? "down" : "flat";
        const dirMom = !Number.isFinite(mom) ? "u" : mom > 0.05 ? "up" : mom < -0.05 ? "down" : "flat";
        const map = {
          "down-down": `À ${horizon.shortLabel.toLowerCase()}, le taux de reste à recouvrer recule sur un an comme sur le mois : le recouvrement s’améliore.`,
          "up-up": `À ${horizon.shortLabel.toLowerCase()}, le taux progresse sur un mois et sur un an, signalant une tension accrue sur la trésorerie.`,
          "down-up": `En repli sur un an malgré une légère hausse mensuelle : la situation reste globalement mieux orientée qu’il y a un an.`,
          "up-down": `En hausse sur un an mais en repli sur le dernier mois : amorce d’accalmie récente à confirmer.`,
          "flat-down": `Quasi stable sur un an, avec un repli mensuel favorable sur la dernière observation.`,
          "flat-up": `Quasi stable sur un an, mais en légère remontée sur le dernier mois disponible.`,
        };
        return map[`${dirYoy}-${dirMom}`]
          || `Lecture active sur l’échéance « ${horizon.label} » (${formatTrarChange(yoy)} sur un an).`;
      }

      function buildSingleKpiCard({ horizon, latestPoint, changes, extraTop = null, extraBottom = null }) {
        const card = el("div", "delai-kpi-block");
        if (extraTop) card.append(extraTop);

        const kicker = el("div", "trar-kpi-kicker");
        kicker.append(el("span", "employment-dashboard-level-label", horizon.label));
        const pill = el("span", "trar-horizon-badge");
        const dot = el("span", "horizon-dot");
        dot.style.background = horizon.color;
        pill.append(dot, document.createTextNode(horizon.shortLabel));
        kicker.append(pill);
        card.append(kicker);

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

        if (extraBottom) card.append(extraBottom);
        return card;
      }

      function buildSparklineSvg(points, horizonKey, color) {
        const recent = points.filter((p) => Number.isFinite(p[horizonKey])).slice(-12);
        const svg = svgEl("svg", { viewBox: "0 0 130 34", width: "130", height: "34", "aria-hidden": "true" });
        if (recent.length < 2) return svg;
        const vals = recent.map((p) => p[horizonKey]);
        const x = d3.scaleLinear().domain([0, recent.length - 1]).range([4, 126]);
        const minV = d3.min(vals);
        const maxV = d3.max(vals);
        const y = d3.scaleLinear().domain([minV - (maxV - minV) * 0.12, maxV + (maxV - minV) * 0.12 || 1]).range([30, 4]);
        const line = d3.line().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
        svg.append(svgEl("path", { d: line(vals), fill: "none", stroke: color, "stroke-width": 2.4, "stroke-linecap": "round" }));
        svg.append(svgEl("circle", { cx: x(vals.length - 1), cy: y(vals[vals.length - 1]), r: 3.2, fill: color, stroke: "#FFFFFF", "stroke-width": 1.4 }));
        return svg;
      }

      function buildTopSectorsBlock({ options, dashboard, horizonIndex, selectedKey, onSelect, inlineBars = false }) {
        const block = el("section", "delai-top-sectors-block");
        const snapshot = dashboard?.rankings?.[horizonIndex];
        const date = snapshot?.date;

        const head = el("div", "delai-top-sectors-head");
        head.append(
          el("h4", "delai-top-sectors-title", "5 taux sectoriels les plus élevés"),
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

        const maxVal = d3.max(rows, (r) => r.value) || 1;
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
          const tdSec = el("td", inlineBars ? "v3-bar-cell" : "");
          const btn = el("button", "sector-ranking-link", row.label);
          btn.type = "button";
          btn.title = row.label;
          btn.addEventListener("click", () => onSelect(row.key));
          tdSec.append(btn);
          if (inlineBars) {
            const track = el("div", "v3-rate-bar");
            const fill = el("i");
            fill.style.width = `${Math.max(8, Math.round((row.value / maxVal) * 100))}%`;
            track.append(fill);
            tdSec.append(track);
          }
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
        showArea = true,
        showMeanLine = false,
        showExtrema = false,
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

        // Area
        if (showArea) {
          const gradId = `grad-${Math.random().toString(36).slice(2, 9)}`;
          const defs = svg.append("defs");
          const grad = defs.append("linearGradient").attr("id", gradId).attr("x1", "0%").attr("x2", "0%").attr("y1", "0%").attr("y2", "100%");
          grad.append("stop").attr("offset", "0%").attr("stop-color", horizon.color).attr("stop-opacity", 0.22);
          grad.append("stop").attr("offset", "100%").attr("stop-color", horizon.color).attr("stop-opacity", 0.01);
          const area = d3.area()
            .defined((p) => Number.isFinite(p[horizon.key]))
            .x((p) => x(p.date))
            .y0(innerH)
            .y1((p) => y(p[horizon.key]))
            .curve(d3.curveMonotoneX);
          g.append("path").attr("d", area(points)).attr("fill", `url(#${gradId})`);
        }

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

        // Optional period mean line
        if (showMeanLine) {
          const meanVal = d3.mean(valid, (p) => p[horizon.key]);
          if (Number.isFinite(meanVal)) {
            const my = y(meanVal);
            g.append("line")
              .attr("x1", 0).attr("x2", innerW).attr("y1", my).attr("y2", my)
              .attr("stroke", "#64748B").attr("stroke-width", 1.5).attr("stroke-dasharray", "4 4");
            g.append("text")
              .attr("x", innerW - 4).attr("y", my - 6).attr("text-anchor", "end")
              .attr("fill", "#475569").style("font-size", "11px").style("font-weight", "600")
              .text(`Moy. période : ${formatTrarPercent(meanVal)}`);
          }
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

        // Optional min/max/latest annotations
        if (showExtrema && valid.length > 2) {
          const maxPt = valid.reduce((a, b) => (b[horizon.key] > a[horizon.key] ? b : a));
          const lastPt = valid[valid.length - 1];
          const drawTag = (pt, txt, dy = -12, align = "middle") => {
            const cx = x(pt.date);
            const cy = y(pt[horizon.key]);
            g.append("text")
              .attr("x", cx).attr("y", Math.max(12, cy + dy))
              .attr("text-anchor", align)
              .attr("fill", "#0B1E36")
              .style("font-size", "11px").style("font-weight", "700")
              .text(txt);
          };
          if (maxPt !== lastPt) drawTag(maxPt, `Pic : ${formatTrarPercent(maxPt[horizon.key])}`, -12, "middle");
          drawTag(lastPt, formatTrarPercent(lastPt[horizon.key]), -12, "end");
        }

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

      /* Style Conjoncture (Variante 3) : Barres YoY + Courbe de Taux */
      function drawConjonctureComboChart({ svgNode, tooltipNode, points, horizon, scopeLabelText, viewBoxWidth = 940, compactHeight = 460 }) {
        const svg = d3.select(svgNode);
        svg.selectAll("*").remove();
        const width = viewBoxWidth;
        const height = compactHeight;
        const margin = { top: 32, right: 66, bottom: 48, left: 70 };
        const innerW = width - margin.left - margin.right;
        const innerH = height - margin.top - margin.bottom;
        svg.attr("viewBox", `0 0 ${width} ${height}`);

        const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
        const valid = points.filter((p) => Number.isFinite(p[horizon.key]));
        if (!valid.length) {
          g.append("text").attr("x", innerW / 2).attr("y", innerH / 2).attr("text-anchor", "middle")
            .attr("fill", "#64748B").text("Données indisponibles.");
          return;
        }

        const dates = points.map((p) => p.date);
        const x = d3.scalePoint().domain(dates).range([0, innerW]).padding(0.25);
        const yoyKey = `${horizon.key}_yoy`;
        const yoyVals = points.map((p) => p[yoyKey]).filter(Number.isFinite);
        let yoyMin = d3.min(yoyVals) ?? -1;
        let yoyMax = d3.max(yoyVals) ?? 1;
        const yoyPad = Math.max(0.4, (yoyMax - yoyMin) * 0.12);
        yoyMin = Math.min(0, yoyMin - yoyPad);
        yoyMax = Math.max(0, yoyMax + yoyPad);

        const rateVals = valid.map((p) => p[horizon.key]);
        const rateMax = (d3.max(rateVals) ?? 1) * 1.1;

        const yYoY = d3.scaleLinear().domain([yoyMin, yoyMax]).nice().range([innerH, 0]);
        const yRate = d3.scaleLinear().domain([0, rateMax]).nice().range([innerH, 0]);

        // Grid on YoY
        g.append("g")
          .selectAll("line")
          .data(yYoY.ticks(6))
          .join("line")
          .attr("x1", 0).attr("x2", innerW)
          .attr("y1", (v) => yYoY(v)).attr("y2", (v) => yYoY(v))
          .attr("stroke", (v) => (v === 0 ? "rgba(100,116,139,0.35)" : "rgba(148,163,184,0.22)"))
          .attr("stroke-width", (v) => (v === 0 ? 1.4 : 1));

        const stepPx = dates.length > 1 ? x(dates[1]) - x(dates[0]) : innerW;
        const barW = Math.max(3, Math.min(10, stepPx * 0.68));
        const zeroY = yYoY(0);

        g.append("g")
          .selectAll("rect")
          .data(points.filter((p) => Number.isFinite(p[yoyKey])))
          .join("rect")
          .attr("x", (p) => x(p.date) - barW / 2)
          .attr("y", (p) => (p[yoyKey] >= 0 ? yYoY(p[yoyKey]) : zeroY))
          .attr("width", barW)
          .attr("height", (p) => Math.max(1, Math.abs(yYoY(p[yoyKey]) - zeroY)))
          .attr("rx", 1.5)
          .attr("fill", (p) => (p[yoyKey] > 0 ? "#ED4766" : "#10AD8D"))
          .attr("opacity", 0.85);

        const line = d3.line()
          .defined((p) => Number.isFinite(p[horizon.key]))
          .x((p) => x(p.date))
          .y((p) => yRate(p[horizon.key]))
          .curve(d3.curveMonotoneX);

        g.append("path")
          .attr("d", line(points))
          .attr("fill", "none")
          .attr("stroke", "#0B1D3A")
          .attr("stroke-width", 3.2)
          .attr("stroke-linecap", "round");

        const lastPt = valid[valid.length - 1];
        g.append("circle")
          .attr("cx", x(lastPt.date))
          .attr("cy", yRate(lastPt[horizon.key]))
          .attr("r", 5.2)
          .attr("fill", "#FFFFFF")
          .attr("stroke", "#0B1D3A")
          .attr("stroke-width", 2.8);

        const rateAxis = g.append("g").call(d3.axisLeft(yRate).ticks(6).tickFormat(formatTrarPercent));
        rateAxis.select(".domain").attr("stroke", "rgba(11,29,58,0.22)");
        rateAxis.selectAll("text").attr("fill", "#0B1D3A").style("font-size", "11px").style("font-weight", "700");
        rateAxis.append("text").attr("x", 0).attr("y", -14).attr("fill", "#0B1D3A")
          .attr("text-anchor", "start").style("font-size", "11px").style("font-weight", "700")
          .text(`Taux (%) · ${horizon.shortLabel}`);

        const yoyAxis = g.append("g").attr("transform", `translate(${innerW},0)`)
          .call(d3.axisRight(yYoY).ticks(6).tickFormat((v) => `${frNumber(v, 1)} pt`));
        yoyAxis.select(".domain").remove();
        yoyAxis.selectAll("line").remove();
        yoyAxis.selectAll("text").attr("fill", "#64748B").style("font-size", "11px");
        yoyAxis.append("text").attr("x", 0).attr("y", -14).attr("fill", "#0F172A")
          .attr("text-anchor", "end").style("font-size", "11px").style("font-weight", "700")
          .text("Glissement annuel (pt)");

        const tickDates = buildChartTickDates(dates, x);
        const xAxis = g.append("g").attr("transform", `translate(0,${innerH})`)
          .call(d3.axisBottom(x).tickValues(tickDates).tickFormat(monthLabel));
        xAxis.selectAll("path,line").attr("stroke", "#CBD5E1");
        xAxis.selectAll("text").attr("fill", "#64748B").style("font-size", "11.5px").attr("dy", "1.2em");

        // Tooltip
        const crosshair = g.append("line").attr("y1", 0).attr("y2", innerH)
          .attr("stroke", "#64748B").attr("stroke-width", 1.2).attr("stroke-dasharray", "4 4").style("opacity", 0);
        const marker = g.append("circle").attr("r", 5.8).attr("fill", "#0B1D3A")
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
          if (Number.isFinite(val)) marker.attr("cx", px).attr("cy", yRate(val)).style("opacity", 1);
          else marker.style("opacity", 0);

          tooltipNode.querySelector(".tooltip-overline").textContent = `${monthLabel(pt.date)} · ${scopeLabelText}`;
          const body = tooltipNode.querySelector(".tooltip-body");
          body.replaceChildren();
          const r1 = el("div", "tooltip-row");
          r1.append(el("span", "", `${horizon.shortLabel} :`), el("strong", "", formatTrarPercent(val)));
          const r2 = el("div", "tooltip-row");
          r2.append(el("span", "", "Écart annuel :"), el("strong", "", formatTrarChange(pt[yoyKey])));
          body.append(r1, r2);

          tooltipNode.classList.add("is-visible");
          tooltipNode.setAttribute("aria-hidden", "false");
          const shellBounds = shell.getBoundingClientRect();
          const svgBounds = svgNode.getBoundingClientRect();
          const sx = svgBounds.left - shellBounds.left + (margin.left + px) * svgBounds.width / width;
          const sy = svgBounds.top - shellBounds.top + (margin.top + (Number.isFinite(val) ? yRate(val) : innerH / 2)) * svgBounds.height / height;
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
          const projection = d3.geoMercator().fitExtent([[28, 28], [672, 492]], { type: "FeatureCollection", features });
          const pathGen = d3.geoPath(projection);
          const paths = new Map();
          const centroids = new Map();
          features.forEach((f) => {
            paths.set(f.properties.code, pathGen(f));
            centroids.set(f.properties.code, pathGen.centroid(f));
          });
          geom = { paths, centroids };
          deptGeomCache.set(features, geom);
        }
        return geom;
      }

      function renderConjonctureLegend(snapshot, annual, entries) {
        const legend = el("div", "trar-snapshot-legend");
        if (annual) {
          const items = [
            ["#10AD8D", "Repli annuel (favorable)"],
            ["#F6C65B", "Quasi stable"],
            ["#ED4766", "Hausse annuelle (tension)"],
          ];
          if (entries.some((d) => !Number.isFinite(d.change))) {
            items.push(["#E2E8F0", "Indisponible"]);
          }
          items.forEach(([bg, text]) => {
            const key = el("span", "trar-color-key");
            const swatch = el("i", "employment-treemap-swatch");
            swatch.style.backgroundColor = bg;
            key.append(swatch, document.createTextNode(text));
            legend.append(key);
          });
          return legend;
        }
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
        entries,
        activeCode,
        onSelectDept,
        showFullLabels = false,
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
            .on("click", (_, n) => {
              const entry = byCode.get(n.data.code);
              if (entry?.hasHistory) onSelectDept(entry.code);
            })
            .on("pointermove", (event, n) => {
              const entry = byCode.get(n.data.code);
              if (entry) showDeptTooltip(event, entry);
            })
            .on("pointerleave", hideDeptTooltip);
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
        const features = entries.map((e) => e.feature);
        const { paths, centroids } = getDeptGeometry(features);
        const svg = svgEl("svg", { viewBox: "0 0 700 520", role: "group", "aria-label": `Carte départementale · ${currentScopeLabel()}` });
        const d3Svg = d3.select(svg);
        const sortedEntries = [...entries].sort((a, b) => (a.code === activeCode ? 1 : b.code === activeCode ? -1 : 0));

        d3Svg.selectAll("path.trar-map-department").data(sortedEntries).join("path")
          .attr("class", (d) => `trar-map-department${d.code === activeCode ? " is-selected" : ""}`)
          .attr("d", (d) => paths.get(d.code))
          .attr("fill", (d) => d.fill)
          .on("click", (_, d) => { if (d.hasHistory) onSelectDept(d.code); })
          .on("pointermove", (event, d) => showDeptTooltip(event, d))
          .on("pointerleave", hideDeptTooltip);

        // Labels on map
        entries.forEach((d) => {
          const [cx, cy] = centroids.get(d.code) || [];
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
          const isSelected = d.code === activeCode;
          if (showFullLabels) {
            const codeTxt = svgEl("text", { x: cx, y: cy - 7, class: "trar-map-label" });
            codeTxt.textContent = `${d.code}`;
            const valTxt = svgEl("text", { x: cx, y: cy + 8, class: "trar-map-sublabel" });
            valTxt.textContent = Number.isFinite(d.value) ? formatTrarPercent(d.value) : "—";
            svg.append(codeTxt, valTxt);
          } else {
            const lbl = svgEl("text", { x: cx, y: cy - (isSelected ? 7 : 0), class: "trar-map-label" });
            lbl.textContent = d.code;
            svg.append(lbl);
            if (isSelected && Number.isFinite(d.value)) {
              const val = svgEl("text", { x: cx, y: cy + 9, class: "trar-map-sublabel" });
              val.textContent = formatTrarPercent(d.value);
              svg.append(val);
            }
          }
        });

        shell.append(svg, tooltip);
        return shell;
      }

      /* ====================================================================
         RENDU DES 5 VARIANTES
         ==================================================================== */
      function renderVariant(variantId, mountNode) {
        mountNode.replaceChildren();
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

        let mainPoints = mainSeriesData.points;
        if (variantId === 2 && appState.v2Window === "since2022") {
          mainPoints = mainPoints.filter((p) => p.date >= "2022-01-01");
        }

        // Benchmark for Variant 5 (Tous secteurs if specific sector chosen, or France entière on regional Tous secteurs)
        let mainBenchmarkPts = null;
        let mainBenchmarkLbl = "";
        if (variantId === 5) {
          if (mainSector.key !== "tous-secteurs") {
            mainBenchmarkPts = getTrarSeries(mainScope?.["tous-secteurs"]).points;
            mainBenchmarkLbl = "Tous secteurs";
          } else if (!isNational) {
            mainBenchmarkPts = getTrarSeries(TRAR.national?.["tous-secteurs"]).points;
            mainBenchmarkLbl = "France entière · Tous secteurs";
          }
        }

        const setMainSector = (key) => {
          if (isNational) appState.nationalSector = key;
          else appState.regionalSector = key;
          renderActiveViews();
        };

        const setMainHorizon = (key) => {
          appState.mainHorizon = key;
          renderActiveViews();
        };

        /* ---------------- BLOC 1 : GRAPHIQUE PRINCIPAL + KPI DROIT ---------------- */
        const stack = el("div", "trar-stack");
        const block1 = el("article", "trar-card");
        const grid1 = el("div", "employment-grid");
        const mainPanel = el("div", "employment-main");

        const intro1 = el("div", "employment-intro");
        const title1 = el("div", "employment-title");
        title1.append(
          el("h3", "", "Taux de reste à recouvrer"),
          el("span", "", `${currentScopeLabel()} · ${mainSector.label} · ${mainHorizon.label}`)
        );

        const controls1 = el("div", "employment-controls");
        controls1.append(
          buildMainSectorPicker({
            selectedKey: mainSector.key,
            onSelect: setMainSector,
            showRates: variantId === 5,
            horizonIndex: mainHorizon.index,
          })
        );

        const rightControls1 = el("div", "trar-panel-controls");
        if (variantId === 2) {
          const winSwitch = el("div", "metric-switch");
          [["since2022", "Focus 2022–2026"], ["full", "Depuis 2019"]].forEach(([wk, wl]) => {
            const b = el("button", `metric-button${appState.v2Window === wk ? " is-active" : ""}`, wl);
            b.type = "button";
            b.addEventListener("click", () => {
              appState.v2Window = wk;
              renderActiveViews();
            });
            winSwitch.append(b);
          });
          rightControls1.append(winSwitch);
        }
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
        if (variantId === 3) {
          legend1.append(
            (() => { const c = el("span", "legend-chip"); c.append(el("i", "employment-swatch employment-swatch-negative"), document.createTextNode("Hausse annuelle (pt)")); return c; })(),
            (() => { const c = el("span", "legend-chip"); c.append(el("i", "employment-swatch employment-swatch-positive"), document.createTextNode("Repli annuel (pt)")); return c; })(),
            (() => { const c = el("span", "legend-chip"); const l = el("i", "trar-line-sample"); l.style.borderColor = "#0B1D3A"; c.append(l, document.createTextNode(mainHorizon.label)); return c; })()
          );
        } else {
          const chip = el("span", "legend-chip");
          const lineSample = el("i", "trar-line-sample");
          lineSample.style.borderColor = mainHorizon.color;
          chip.append(lineSample, document.createTextNode(`${mainHorizon.label} (${mainSector.label})`));
          legend1.append(chip);
          if (mainBenchmarkPts) {
            const bChip = el("span", "legend-chip");
            const bLine = el("i", "trar-line-sample");
            bLine.style.borderColor = "#64748B";
            bLine.style.borderTopStyle = "dashed";
            bChip.append(bLine, document.createTextNode(`Référence · ${mainBenchmarkLbl}`));
            legend1.append(bChip);
          }
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

        let kpiExtraTop = null;
        if (variantId === 4) {
          const tabs = el("div", "v4-kpi-tabs");
          TRAR_HORIZONS.forEach((h) => {
            const tb = el("button", `v4-kpi-tab${h.key === mainHorizon.key ? " is-active" : ""}`, h.shortLabel);
            tb.type = "button";
            tb.addEventListener("click", () => setMainHorizon(h.key));
            tabs.append(tb);
          });
          kpiExtraTop = tabs;
        }

        let kpiExtraBottom = null;
        if (variantId === 2) {
          const sparkBox = el("div", "v2-spark-box");
          sparkBox.append(
            el("span", "", "Tendance 12 derniers mois"),
            buildSparklineSvg(mainSeriesData.points, mainHorizon.key, mainHorizon.color)
          );
          kpiExtraBottom = sparkBox;
        } else if (variantId === 5 && mainBenchmarkPts) {
          const refPts = mainSector.key !== "tous-secteurs"
            ? getTrarSeries(mainScope?.["tous-secteurs"]).latest[mainHorizon.key]
            : getTrarSeries(TRAR.national?.["tous-secteurs"]).latest[mainHorizon.key];
          if (mainLatest && refPts) {
            const diff = Number((mainLatest.value - refPts.value).toFixed(2));
            const spread = el("div", `v5-spread-pill ${diff > 0 ? "is-higher" : diff < 0 ? "is-lower" : ""}`);
            spread.append(
              document.createTextNode(`Écart vs ${mainBenchmarkLbl} : `),
              el("strong", "", formatTrarChange(diff))
            );
            kpiExtraBottom = spread;
          }
        }

        side1.append(buildSingleKpiCard({
          horizon: mainHorizon,
          latestPoint: mainLatest,
          changes: mainChanges,
          extraTop: kpiExtraTop,
          extraBottom: kpiExtraBottom,
        }));

        if (variantId === 1) {
          const [yoy, mom] = mainChanges || [];
          side1.append(el("p", "trar-interpretation", trarInterpretationText(yoy, mom, mainHorizon)));
        }

        side1.append(buildTopSectorsBlock({
          options: mainOptions,
          dashboard: mainDashboard,
          horizonIndex: mainHorizon.index,
          selectedKey: mainSector.key,
          onSelect: setMainSector,
          inlineBars: variantId === 3,
        }));

        grid1.append(mainPanel, side1);
        block1.append(grid1);
        stack.append(block1);

        // Draw Block 1 Chart
        if (variantId === 3) {
          drawConjonctureComboChart({
            svgNode: chartSvg1,
            tooltipNode: chartTip1,
            points: mainPoints,
            horizon: mainHorizon,
            scopeLabelText: `${currentScopeLabel()} · ${mainSector.label}`,
          });
        } else {
          drawSingleLineChart({
            svgNode: chartSvg1,
            tooltipNode: chartTip1,
            points: mainPoints,
            horizon: mainHorizon,
            scopeLabelText: `${currentScopeLabel()} · ${mainSector.label}`,
            benchmarkPoints: mainBenchmarkPts,
            benchmarkLabel: mainBenchmarkLbl,
            showArea: variantId === 1 || variantId === 2,
            showMeanLine: variantId === 4,
            showExtrema: variantId === 2,
          });
        }

        /* ---------------- BLOC 2 : CARTE DÉPARTEMENTALE + HISTORIQUE CÔTE À CÔTE ---------------- */
        const deptSector = TRAR.sectors.departmental.find((s) => s.key === appState.deptSector) || TRAR.sectors.departmental[0];
        const deptHorizon = horizonByKey(appState.deptHorizon);
        const snapshot = getSnapshot(deptSector.key, deptHorizon.key, appState.scope);
        const features = isNational ? DEPT_FEATURES : (DEPTS_BY_REGION.get(appState.scope) || []);
        const entries = buildDepartmentEntries(snapshot, features, deptSector.key);
        const activeDeptCode = ensureActiveDeptCode(entries);
        const activeDept = entries.find((d) => d.code === activeDeptCode) || entries[0];
        const biggestDept = entries.find((d) => d.code === findBiggestDeptCode(entries, appState.deptColorMode));

        const block2 = el("article", "trar-card");
        const panel2 = el("div", "trar-dept-panel");

        const head2 = el("div", "trar-panel-head");
        const title2 = el("div", "employment-title");
        title2.append(
          el("h4", "", "Taux de reste à recouvrer par département"),
          el("span", "", `${currentScopeLabel()} · ${deptSector.label} · ${deptHorizon.label} · ${snapshot.date ? monthLabel(snapshot.date) : "—"}`)
        );

        const controls2 = el("div", "trar-panel-controls");
        controls2.append(
          buildGrandSectorPicker({
            selectedKey: deptSector.key,
            onSelect: (key) => { appState.deptSector = key; renderActiveViews(); },
          }),
          buildHorizonSwitch(deptHorizon.key, (key) => { appState.deptHorizon = key; renderActiveViews(); }),
          buildColorModeSwitch(appState.deptColorMode, (key) => { appState.deptColorMode = key; renderActiveViews(); })
        );
        head2.append(title2, controls2);
        panel2.append(head2);

        const splitClass = variantId === 2 ? "trar-split-grid trar-split-grid--46-54"
          : variantId === 3 ? "trar-split-grid trar-split-grid--48-52"
          : variantId === 4 ? "trar-split-grid trar-split-grid--44-56"
          : "trar-split-grid";
        const splitGrid = el("div", splitClass);

        // LEFT COLUMN : MAP + LEGEND + (PODIUM OR LEADERBOARD)
        const mapCol = el("div", "trar-map-column");
        if (biggestDept && Number.isFinite(biggestDept.value)) {
          const maxChip = el("div", "trar-max-chip");
          maxChip.append(
            el("span", "trar-max-chip-dot"),
            document.createTextNode(
              appState.deptColorMode === "annual" && Number.isFinite(biggestDept.change)
                ? `Plus forte tension : ${biggestDept.name} (${biggestDept.code}) · ${formatTrarChange(biggestDept.change)}`
                : `Plus fort taux : ${biggestDept.name} (${biggestDept.code}) · ${formatTrarPercent(biggestDept.value)}`
            )
          );
          mapCol.append(maxChip);
        }

        const onSelectDept = (code) => {
          setActiveDeptCode(code);
          renderActiveViews();
        };

        mapCol.append(
          renderDeptMapOrTreemap({
            entries,
            activeCode: activeDeptCode,
            onSelectDept,
            showFullLabels: variantId === 3,
          }),
          renderConjonctureLegend(snapshot, appState.deptColorMode === "annual", entries)
        );

        if (variantId === 2) {
          const podium = el("div", "v2-podium");
          const sorted = [...entries].filter((d) => d.hasHistory && Number.isFinite(d.value))
            .sort((a, b) => b.value - a.value).slice(0, 8);
          sorted.forEach((d, idx) => {
            const btn = el("button", `v2-podium-btn${d.code === activeDeptCode ? " is-active" : ""}`);
            btn.type = "button";
            const dot = el("span", "v2-podium-dot");
            dot.style.backgroundColor = d.fill;
            btn.append(dot, document.createTextNode(`#${idx + 1} ${d.name} · ${formatTrarPercent(d.value)}`));
            btn.addEventListener("click", () => onSelectDept(d.code));
            podium.append(btn);
          });
          mapCol.append(podium);
        } else if (variantId === 4) {
          const board = el("div", "v4-leaderboard");
          const sorted = [...entries].filter((d) => d.hasHistory && Number.isFinite(d.value))
            .sort((a, b) => b.value - a.value);
          sorted.forEach((d, idx) => {
            const row = el("button", `v4-leader-row${d.code === activeDeptCode ? " is-active" : ""}`);
            row.type = "button";
            const dot = el("span", "v2-podium-dot");
            dot.style.backgroundColor = d.fill;
            row.append(
              el("span", "v4-leader-rank", String(idx + 1)),
              dot,
              el("span", "v4-leader-name", `${d.name} (${d.code})`),
              el("span", "v4-leader-val", formatTrarPercent(d.value))
            );
            row.addEventListener("click", () => onSelectDept(d.code));
            board.append(row);
          });
          mapCol.append(board);
        }

        // RIGHT COLUMN : CUSTOM DEPT PICKER + MINI KPIs + HISTORICAL CHART
        const histCol = el("div", "trar-history-column");
        const deptSeriesObj = activeDept ? getTrarSeries(TRAR.departments[activeDept.code]?.[deptSector.key]) : { points: [], latest: {} };
        let deptPoints = deptSeriesObj.points;
        if (variantId === 2 && appState.v2Window === "since2022") {
          deptPoints = deptPoints.filter((p) => p.date >= "2022-01-01");
        }

        const histHead = el("div", "trar-history-head");
        const histMeta = el("div", "trar-history-meta");
        histMeta.append(
          el("h5", "", activeDept ? `Historique · ${activeDept.name} (${activeDept.code})` : "Historique départemental"),
          el("span", "", `${deptSector.label} · ${deptHorizon.label}${deptPoints.length ? ` · depuis ${monthLabel(deptPoints[0].date)}` : ""}`)
        );
        histHead.append(
          histMeta,
          buildDepartmentPicker({
            entries,
            selectedCode: activeDeptCode,
            onSelect: onSelectDept,
          })
        );
        histCol.append(histHead);

        // Department Mini KPI Strip
        if (activeDept) {
          const avgRegionPts = getRegionalAverageForDept(deptSector.key, deptHorizon.key, appState.scope);
          const avgLast = [...avgRegionPts].reverse().find((p) => Number.isFinite(p[deptHorizon.key]))?.[deptHorizon.key];
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
        const deptSvg = svgEl("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": "Historique du département sélectionné" });
        const deptTip = el("div", "employment-tooltip");
        deptTip.setAttribute("aria-hidden", "true");
        deptTip.append(el("div", "tooltip-overline"), el("div", "tooltip-body"));
        deptChartShell.append(deptSvg, deptTip);
        histCol.append(deptChartShell);

        const deptLegend = el("div", "legend-row");
        if (variantId === 3) {
          deptLegend.append(
            (() => { const c = el("span", "legend-chip"); c.append(el("i", "employment-swatch employment-swatch-negative"), document.createTextNode("Hausse annuelle (pt)")); return c; })(),
            (() => { const c = el("span", "legend-chip"); c.append(el("i", "employment-swatch employment-swatch-positive"), document.createTextNode("Repli annuel (pt)")); return c; })(),
            (() => { const c = el("span", "legend-chip"); const l = el("i", "trar-line-sample"); l.style.borderColor = "#0B1D3A"; c.append(l, document.createTextNode(activeDept ? activeDept.name : "Département")); return c; })()
          );
        } else {
          const c1 = el("span", "legend-chip");
          const l1 = el("i", "trar-line-sample");
          l1.style.borderColor = deptHorizon.color;
          c1.append(l1, document.createTextNode(`${activeDept ? activeDept.name : "Département"} (${deptHorizon.shortLabel})`));
          deptLegend.append(c1);
          if (variantId === 2 || variantId === 5) {
            const c2 = el("span", "legend-chip");
            const l2 = el("i", "trar-line-sample");
            l2.style.borderColor = "#64748B";
            l2.style.borderTopStyle = "dashed";
            c2.append(l2, document.createTextNode(isNational ? "Moyenne nationale (Tous secteurs)" : `Moyenne ${currentScopeLabel()} (Tous secteurs)`));
            deptLegend.append(c2);
          }
        }
        histCol.append(deptLegend);

        splitGrid.append(mapCol, histCol);
        panel2.append(splitGrid);
        block2.append(panel2);
        stack.append(block2);
        mountNode.append(stack);

        // Draw Block 2 Chart
        const deptBench = (variantId === 2 || variantId === 5)
          ? getRegionalAverageForDept(deptSector.key, deptHorizon.key, appState.scope)
          : null;
        if (variantId === 3) {
          drawConjonctureComboChart({
            svgNode: deptSvg,
            tooltipNode: deptTip,
            points: deptPoints,
            horizon: deptHorizon,
            scopeLabelText: activeDept ? `${activeDept.name} (${activeDept.code})` : "",
            viewBoxWidth: 640,
            compactHeight: 360,
          });
        } else {
          drawSingleLineChart({
            svgNode: deptSvg,
            tooltipNode: deptTip,
            points: deptPoints,
            horizon: deptHorizon,
            scopeLabelText: activeDept ? `${activeDept.name} (${activeDept.code})` : "",
            benchmarkPoints: deptBench,
            benchmarkLabel: isNational ? "France entière" : currentScopeLabel(),
            showArea: variantId === 1 || variantId === 2,
            showMeanLine: variantId === 4,
            showExtrema: variantId === 2,
            viewBoxWidth: 640,
            compactHeight: 360,
          });
        }
      }

      /* ====================================================================
         MONTAGE DES FRAMES & STUDIO SWITCHER
         ==================================================================== */
      const root = document.getElementById("variantsRoot");
      const variantFrames = new Map();

      VARIANTS.forEach((v) => {
        const frame = el("section", `variant-frame${v.id === appState.variant ? " is-visible" : ""}`);
        frame.dataset.variantPanel = String(v.id);

        const banner = el("div", "variant-banner");
        const main = el("div", "variant-banner-main");
        main.append(el("span", "variant-num", `0${v.id}`));
        const copy = el("div");
        copy.append(el("h2", "", v.title), el("p", "", v.desc));
        main.append(copy);

        const tags = el("div", "variant-tags");
        v.tags.forEach((t) => tags.append(el("span", "variant-tag", t)));
        banner.append(main, tags);

        const body = el("div", "variant-body");
        frame.append(banner, body);
        root.append(frame);
        variantFrames.set(v.id, { frame, body });
      });

      function renderActiveViews() {
        if (appState.showcase) {
          VARIANTS.forEach((v) => renderVariant(v.id, variantFrames.get(v.id).body));
        } else {
          renderVariant(appState.variant, variantFrames.get(appState.variant).body);
        }
      }

      function syncStudioUI() {
        document.body.classList.toggle("is-showcase", appState.showcase);
        document.querySelectorAll(".studio-tab").forEach((tab) => {
          const active = !appState.showcase && Number(tab.dataset.variant) === appState.variant;
          tab.classList.toggle("is-active", active);
          tab.setAttribute("aria-selected", String(active));
        });
        variantFrames.forEach(({ frame }, id) => {
          frame.classList.toggle("is-visible", appState.showcase || id === appState.variant);
        });
        const scBtn = document.getElementById("toggleShowcaseBtn");
        scBtn.classList.toggle("is-active", appState.showcase);
        scBtn.textContent = appState.showcase ? "Mode Focus" : "Comparer les 5";
      }

      document.querySelectorAll(".studio-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          appState.showcase = false;
          appState.variant = Number(tab.dataset.variant);
          syncStudioUI();
          renderActiveViews();
        });
      });

      document.getElementById("toggleShowcaseBtn").addEventListener("click", () => {
        appState.showcase = !appState.showcase;
        syncStudioUI();
        renderActiveViews();
      });

      document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT") return;
        if (["1", "2", "3", "4", "5"].includes(e.key)) {
          appState.showcase = false;
          appState.variant = Number(e.key);
          syncStudioUI();
          renderActiveViews();
        }
      });

      initGeoControl();
      syncStudioUI();
      renderActiveViews();
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
