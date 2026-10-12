"""Encodage contextualisé et politique de sécurité des fichiers statiques."""
from __future__ import annotations

import base64
import hashlib
from html import escape
from html.parser import HTMLParser
import re
from urllib.parse import unquote, urlsplit

from .dependencies import PAGE_DEPENDENCIES, SCRIPTS
from .utils import dump_json


def script_json(value: object) -> str:
    return (dump_json(value).replace("&", "\\u0026").replace("<", "\\u003c")
            .replace(">", "\\u003e").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


def local_asset_url(value: str) -> str:
    decoded = unquote(value)
    parsed = urlsplit(decoded)
    parts = decoded.split("/")
    if (parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or "\\" in decoded
            or not decoded.startswith("Assets/") or any(part in {"", ".", ".."} for part in parts)
            or any(char in decoded for char in "<>\"'`%")
            or any(ord(char) < 32 for char in decoded)):
        raise ValueError("Le chemin d’une ressource locale est invalide.")
    return decoded


def dependency_guard(names: tuple[str, ...]) -> str:
    condition = " && ".join(f"window.{SCRIPTS[name].global_name}" for name in names) or "true"
    return f"""<script>
    function barometreDependenciesAvailable() {{
      if ({condition}) return true;
      const message = document.getElementById('dependencyError');
      if (message) message.hidden = false;
      return false;
    }}
    barometreDependenciesAvailable();
  </script>"""


ERROR_NOTICE = '<p id="dependencyError" role="alert" hidden>Les graphiques ne peuvent pas être chargés. Vérifiez votre connexion puis rechargez la page.</p>'


def secure_html(html: str, page_name: str) -> str:
    """Calculer les empreintes sur les octets finaux, avant toute écriture."""
    hashes = []
    for match in re.finditer(r"<script\b([^>]*)>(.*?)</script\s*>", html, flags=re.S | re.I):
        if not re.search(r"\bsrc\s*=", match[1], re.I):
            digest = base64.b64encode(hashlib.sha256(match[2].encode("utf-8")).digest()).decode("ascii")
            hashes.append(f"'sha256-{digest}'")
    hashes.extend(f"'{SCRIPTS[name].integrity}'" for name in PAGE_DEPENDENCIES[page_name])
    policy = "; ".join([
        "default-src 'none'",
        "script-src " + (" ".join(hashes) if hashes else "'none'"),
        "script-src-attr 'none'",
        "style-src 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "media-src 'self'",
        "connect-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-src 'none'",
    ])
    meta = f'<meta http-equiv="Content-Security-Policy" content="{escape(policy, quote=True)}">\n  <meta name="referrer" content="no-referrer">'
    return html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n  ' + meta, 1)


class PageValidator(HTMLParser):
    def __init__(self, page_name: str):
        super().__init__()
        self.page_name = page_name
        self.scripts: list[str] = []
        self.has_policy = False
        self.is_french = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        fields = dict(attrs)
        if any(name.lower().startswith("on") for name in fields):
            raise ValueError("Un gestionnaire JavaScript inline non autorisé a été trouvé.")
        if tag == "html":
            self.is_french = fields.get("lang") == "fr"
        if tag == "meta" and fields.get("http-equiv", "").lower() == "content-security-policy":
            self.has_policy = True
        for field in ("src", "href"):
            value = fields.get(field)
            if value and value.startswith("Assets/"):
                local_asset_url(value)
            if value and urlsplit(value).scheme.lower() in {"javascript", "vbscript"}:
                raise ValueError("Une URL exécutable non autorisée a été trouvée.")
        if tag == "script" and fields.get("src"):
            expected = {SCRIPTS[name].url: SCRIPTS[name] for name in PAGE_DEPENDENCIES[self.page_name]}
            dependency = expected.get(fields["src"])
            if not dependency or fields.get("integrity") != dependency.integrity or fields.get("crossorigin") != "anonymous":
                raise ValueError("Une dépendance JavaScript n’a pas été vérifiée.")
            self.scripts.append(fields["src"])


def validate_html(html: str, page_name: str) -> None:
    validator = PageValidator(page_name)
    validator.feed(html)
    if not validator.is_french or not validator.has_policy:
        raise ValueError(f"La page {page_name} doit être en français et posséder une politique de sécurité.")
    if re.search(r"__[A-Z][A-Z0-9_]*__", html):
        raise ValueError(f"La page {page_name} contient un emplacement non remplacé.")
    expected = [SCRIPTS[name].url for name in PAGE_DEPENDENCIES[page_name]]
    if validator.scripts != expected:
        raise ValueError(f"Les dépendances de la page {page_name} sont incomplètes.")
