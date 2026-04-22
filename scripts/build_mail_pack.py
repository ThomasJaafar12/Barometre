from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_HTML = ROOT / "barometre.html"
DEFAULT_OUTPUT_DIR = ROOT / "dist" / "mail_pack"
DEFAULT_EXCLUDED_PREFIXES = (
    Path("Assets/MapScene"),
    Path("Assets/premium-map-pack"),
)

LOCAL_ASSET_PATTERN = re.compile(r"Assets/[A-Za-z0-9._/\-]+")
REMOTE_URL_PATTERN = re.compile(r"https://[^\s\"'()<>]+")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a lightweight pack with barometre.html and only the local assets it references.",
    )
    parser.add_argument(
        "--html",
        type=Path,
        default=DEFAULT_HTML,
        help="Path to the generated HTML file to package.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where the mail pack folder will be created.",
    )
    parser.add_argument(
        "--zip",
        action="store_true",
        help="Also create a .zip archive next to the output folder.",
    )
    parser.add_argument(
        "--include-map-scene",
        action="store_true",
        help="Include Assets/MapScene files referenced by the HTML.",
    )
    parser.add_argument(
        "--include-premium-pack",
        action="store_true",
        help="Include Assets/premium-map-pack files referenced by the HTML.",
    )
    return parser.parse_args()


def normalize_path(path: Path) -> Path:
    return path if path.is_absolute() else (ROOT / path)


def extract_local_assets(html_text: str) -> list[Path]:
    assets = sorted({Path(match) for match in LOCAL_ASSET_PATTERN.findall(html_text)})
    return assets


def extract_remote_urls(html_text: str) -> list[str]:
    return sorted(set(REMOTE_URL_PATTERN.findall(html_text)))


def should_exclude_asset(path: Path, args: argparse.Namespace) -> bool:
    posix_path = path.as_posix()
    if posix_path.startswith("Assets/MapScene") and not args.include_map_scene:
        return True
    if posix_path.startswith("Assets/premium-map-pack") and not args.include_premium_pack:
        return True
    return False


def copy_pack(html_path: Path, output_dir: Path, args: argparse.Namespace) -> tuple[list[Path], list[Path], list[Path]]:
    html_text = html_path.read_text(encoding="utf-8")
    referenced_assets = extract_local_assets(html_text)
    local_assets = [asset for asset in referenced_assets if not should_exclude_asset(asset, args)]
    excluded_assets = [asset for asset in referenced_assets if should_exclude_asset(asset, args)]
    output_dir.mkdir(parents=True, exist_ok=True)

    copied_files: list[Path] = []
    missing_files: list[Path] = []

    target_html = output_dir / html_path.name
    shutil.copy2(html_path, target_html)
    copied_files.append(target_html.relative_to(output_dir))

    for asset_rel in local_assets:
        source = ROOT / asset_rel
        target = output_dir / asset_rel
        if not source.exists():
            missing_files.append(asset_rel)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied_files.append(target.relative_to(output_dir))

    manifest = {
        "html": html_path.name,
        "localAssets": [path.as_posix() for path in local_assets],
        "excludedAssets": [path.as_posix() for path in excluded_assets],
        "missingLocalAssets": [path.as_posix() for path in missing_files],
        "remoteDependencies": extract_remote_urls(html_text),
    }
    manifest_path = output_dir / "mail_pack_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    copied_files.append(manifest_path.relative_to(output_dir))
    return copied_files, missing_files, excluded_assets


def create_zip(output_dir: Path) -> Path:
    archive_path = output_dir.with_suffix(".zip")
    with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(output_dir.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(output_dir))
    return archive_path


def main() -> None:
    args = parse_args()
    html_path = normalize_path(args.html)
    output_dir = normalize_path(args.output_dir)

    if not html_path.exists():
        raise SystemExit(f"HTML file not found: {html_path}")

    if output_dir.exists():
        shutil.rmtree(output_dir)

    copied_files, missing_files, excluded_assets = copy_pack(html_path, output_dir, args)
    archive_path = create_zip(output_dir) if args.zip else None

    print(f"Mail pack created in: {output_dir}")
    print(f"Copied files: {len(copied_files)}")
    print(f"Excluded assets: {len(excluded_assets)}")
    for path in excluded_assets:
        print(f"  - {path.as_posix()}")
    if missing_files:
        print("Missing local assets:")
        for path in missing_files:
            print(f"  - {path.as_posix()}")
    else:
        print("Missing local assets: none")

    manifest = json.loads((output_dir / "mail_pack_manifest.json").read_text(encoding="utf-8"))
    print(f"Remote dependencies: {len(manifest['remoteDependencies'])}")
    for url in manifest["remoteDependencies"]:
        print(f"  - {url}")

    if archive_path:
        print(f"Zip archive: {archive_path}")


if __name__ == "__main__":
    main()
