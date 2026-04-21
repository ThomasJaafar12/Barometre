from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import struct
from typing import Any

from .config import MAP_LAYOUT, MAP_SCENE_EXPERIMENT, MAP_SCENE_MANIFEST_PATH, PREMIUM_MAP_PACK_DIR, PREMIUM_MAP_PACK_MANIFEST_PATH
from .utils import load_json, relative_asset


VISIBLE_PHASES = ["landing", "national"]
LAYOUT_PATH = MAP_SCENE_MANIFEST_PATH.parent / "layout.json"

ASSET_CONTENT_BOXES = {
    "birds-flock": {"x": 428, "y": 261, "width": 651, "height": 500},
    "effect-boat-wake": {"x": 323, "y": 336, "width": 839, "height": 390},
    "effect-water-ripple": {"x": 379, "y": 347, "width": 749, "height": 386},
    "mountains-alps": {"x": 263, "y": 217, "width": 1026, "height": 664},
    "mountains-pyrenees": {"x": 114, "y": 241, "width": 1303, "height": 643},
    "nature-forest-cluster": {"x": 136, "y": 122, "width": 1274, "height": 787},
    "nature-vineyard-patch": {"x": 182, "y": 177, "width": 1272, "height": 731},
    "ocean-atlantic-overlay": {"x": 0, "y": 371, "width": 1506, "height": 394},
    "sea-mediterranean-overlay": {"x": 0, "y": 240, "width": 1536, "height": 784},
    "sprite-bird-bank-b": {"x": 494, "y": 144, "width": 598, "height": 638},
    "sprite-bird-glide-a": {"x": 388, "y": 147, "width": 822, "height": 602},
    "sprite-bird-top-c": {"x": 325, "y": 73, "width": 884, "height": 847},
    "sprite-boat-motor": {"x": 390, "y": 197, "width": 790, "height": 599},
    "sprite-boat-sail": {"x": 567, "y": 96, "width": 453, "height": 761},
}


def _scope_frames(region_meta: dict[str, dict[str, Any]]) -> dict[str, dict[str, float]]:
    frames = {
        "mainland": {
            "x": MAP_LAYOUT["mainlandExtent"][0],
            "y": MAP_LAYOUT["mainlandExtent"][1],
            "width": MAP_LAYOUT["mainlandExtent"][2] - MAP_LAYOUT["mainlandExtent"][0],
            "height": MAP_LAYOUT["mainlandExtent"][3] - MAP_LAYOUT["mainlandExtent"][1],
        }
    }
    for region_code, metadata in region_meta.items():
        if metadata.get("group") == "dom" and region_code in MAP_LAYOUT["domInsets"]:
            inset = MAP_LAYOUT["domInsets"][region_code]
            frames[region_code] = {
                "x": inset["x"],
                "y": inset["y"],
                "width": inset["width"],
                "height": inset["height"],
            }
    return frames


def _png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        signature = handle.read(8)
        if signature != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"Unsupported image format for {path.name}.")
        chunk_length = struct.unpack(">I", handle.read(4))[0]
        chunk_type = handle.read(4)
        if chunk_type != b"IHDR" or chunk_length < 8:
            raise ValueError(f"Invalid PNG header for {path.name}.")
        width, height = struct.unpack(">II", handle.read(8))
    return width, height


def _build_asset_record(
    *,
    asset_id: str,
    asset_path: Path,
    width: int,
    height: int,
    source_id: str,
    role: str | None = None,
    target_region: str | None = None,
    suggested_width_px: int | None = None,
    notes: str | None = None,
    content_box: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": asset_id,
        "src": relative_asset(asset_path),
        "file": asset_path.name,
        "width": width,
        "height": height,
        "aspectRatio": round(width / height, 6) if height else None,
        "contentBox": deepcopy(content_box or {"x": 0, "y": 0, "width": width, "height": height}),
        "role": role,
        "targetRegion": target_region,
        "suggestedWidthPx": suggested_width_px,
        "notes": notes,
        "source": source_id,
    }


def _load_premium_assets() -> dict[str, dict[str, Any]]:
    if not PREMIUM_MAP_PACK_MANIFEST_PATH.exists():
        return {}
    manifest_entries = load_json(PREMIUM_MAP_PACK_MANIFEST_PATH)
    assets: dict[str, dict[str, Any]] = {}
    for entry in manifest_entries:
        file_name = entry["file"]
        asset_path = PREMIUM_MAP_PACK_DIR / file_name
        asset_id = Path(file_name).stem
        width, height = _png_dimensions(asset_path)
        assets[asset_id] = _build_asset_record(
            asset_id=asset_id,
            asset_path=asset_path,
            width=width,
            height=height,
            source_id="premium-pack",
            role=entry.get("role"),
            target_region=entry.get("targetRegion"),
            suggested_width_px=entry.get("suggestedWidthPx"),
            notes=entry.get("notes"),
            content_box=ASSET_CONTENT_BOXES.get(asset_id),
        )
    return assets


def _load_local_scene_assets() -> dict[str, dict[str, Any]]:
    if not MAP_SCENE_MANIFEST_PATH.exists():
        return {}
    manifest = load_json(MAP_SCENE_MANIFEST_PATH)
    assets: dict[str, dict[str, Any]] = {}
    for asset_id, entry in manifest.get("assets", {}).items():
        asset_path = MAP_SCENE_MANIFEST_PATH.parent / entry["src"]
        width = int(entry["width"])
        height = int(entry["height"])
        assets[asset_id] = _build_asset_record(
            asset_id=asset_id,
            asset_path=asset_path,
            width=width,
            height=height,
            source_id="map-scene",
            role=entry.get("role"),
            target_region=entry.get("targetRegion"),
            suggested_width_px=entry.get("suggestedWidthPx"),
            notes=entry.get("notes"),
            content_box=entry.get("contentBox"),
        )
    return assets


def _load_catalog() -> dict[str, Any]:
    catalog_assets = {
        **_load_premium_assets(),
        **_load_local_scene_assets(),
    }
    role_ids = sorted({asset["role"] for asset in catalog_assets.values() if asset.get("role")})
    source_groups = [
        {
            "id": "map-scene",
            "label": "MapScene",
            "assetIds": sorted(asset_id for asset_id, asset in catalog_assets.items() if asset["source"] == "map-scene"),
        },
        {
            "id": "premium-pack",
            "label": "Premium Pack",
            "assetIds": sorted(asset_id for asset_id, asset in catalog_assets.items() if asset["source"] == "premium-pack"),
        },
    ]
    return {
        "assets": catalog_assets,
        "groups": source_groups,
        "roles": role_ids,
    }


def _normalize_phases(phases: Any) -> list[str]:
    if not phases:
        return deepcopy(VISIBLE_PHASES)
    if not isinstance(phases, list) or not all(isinstance(phase, str) for phase in phases):
        raise ValueError("visiblePhases must be a list of strings.")
    return phases


def _validate_crop(crop: Any, *, label: str) -> dict[str, float] | None:
    if crop is None:
        return None
    if not isinstance(crop, dict):
        raise ValueError(f"{label} crop must be an object.")
    values = {}
    for key in ["x", "y", "width", "height"]:
        if key not in crop or not isinstance(crop[key], (int, float)):
            raise ValueError(f"{label} crop.{key} must be numeric.")
        values[key] = float(crop[key])
    if values["width"] <= 0 or values["height"] <= 0:
        raise ValueError(f"{label} crop width and height must be positive.")
    return values


def _validate_motion(motion: Any, *, label: str) -> dict[str, Any] | None:
    if motion is None:
        return None
    if not isinstance(motion, dict):
        raise ValueError(f"{label} motion must be an object.")
    allowed_scalars = {"type", "ease"}
    allowed_numbers = {"dx", "dy", "duration", "delay", "scale", "opacity"}
    allowed_booleans = {"yoyo"}
    validated: dict[str, Any] = {}
    for key, value in motion.items():
        if key in allowed_scalars:
            if not isinstance(value, str):
                raise ValueError(f"{label} motion.{key} must be a string.")
        elif key in allowed_numbers:
            if not isinstance(value, (int, float)):
                raise ValueError(f"{label} motion.{key} must be numeric.")
        elif key in allowed_booleans:
            if not isinstance(value, bool):
                raise ValueError(f"{label} motion.{key} must be boolean.")
        else:
            raise ValueError(f"{label} motion contains unsupported key '{key}'.")
        validated[key] = value
    return validated


def _validate_layout(layout: Any, catalog_assets: dict[str, dict[str, Any]], region_meta: dict[str, dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(layout, dict):
        raise ValueError("Assets/MapScene/layout.json must contain an object.")
    scopes = layout.get("scopes")
    if not isinstance(scopes, dict):
        raise ValueError("Assets/MapScene/layout.json must contain a scopes object.")
    allowed_scope_keys = {"mainland", *[code for code, meta in region_meta.items() if meta.get("group") == "dom"]}
    validated_scopes: dict[str, Any] = {}
    for scope_key, scope in scopes.items():
        if scope_key not in allowed_scope_keys:
            raise ValueError(f"Unsupported scene scope '{scope_key}'.")
        if not isinstance(scope, dict):
            raise ValueError(f"Scope '{scope_key}' must be an object.")
        layers = scope.get("layers")
        objects = scope.get("objects")
        if not isinstance(layers, list) or not isinstance(objects, list):
            raise ValueError(f"Scope '{scope_key}' must contain layers and objects arrays.")
        validated_layers: list[dict[str, Any]] = []
        layer_ids: set[str] = set()
        for index, layer in enumerate(layers):
            if not isinstance(layer, dict):
                raise ValueError(f"Scope '{scope_key}' layer #{index + 1} must be an object.")
            layer_id = layer.get("id")
            if not isinstance(layer_id, str) or not layer_id:
                raise ValueError(f"Scope '{scope_key}' layer #{index + 1} must have a non-empty id.")
            if layer_id in layer_ids:
                raise ValueError(f"Scope '{scope_key}' contains duplicate layer id '{layer_id}'.")
            order = layer.get("order")
            if not isinstance(order, int):
                raise ValueError(f"Scope '{scope_key}' layer '{layer_id}' must have an integer order.")
            label = layer.get("label")
            if not isinstance(label, str) or not label:
                raise ValueError(f"Scope '{scope_key}' layer '{layer_id}' must have a non-empty label.")
            validated_layers.append({"id": layer_id, "label": label, "order": order})
            layer_ids.add(layer_id)
        validated_objects: list[dict[str, Any]] = []
        object_ids: set[str] = set()
        for index, object_config in enumerate(objects):
            if not isinstance(object_config, dict):
                raise ValueError(f"Scope '{scope_key}' object #{index + 1} must be an object.")
            object_id = object_config.get("id")
            if not isinstance(object_id, str) or not object_id:
                raise ValueError(f"Scope '{scope_key}' object #{index + 1} must have a non-empty id.")
            if object_id in object_ids:
                raise ValueError(f"Scope '{scope_key}' contains duplicate object id '{object_id}'.")
            layer_id = object_config.get("layerId")
            if layer_id not in layer_ids:
                raise ValueError(f"Scope '{scope_key}' object '{object_id}' references unknown layer '{layer_id}'.")
            asset_id = object_config.get("assetId")
            placeholder_id = object_config.get("placeholderId")
            if asset_id is None and placeholder_id is None:
                raise ValueError(f"Scope '{scope_key}' object '{object_id}' must define assetId or placeholderId.")
            if asset_id is not None and asset_id not in catalog_assets:
                raise ValueError(f"Scope '{scope_key}' object '{object_id}' references unknown asset '{asset_id}'.")
            order = object_config.get("order")
            if not isinstance(order, int):
                raise ValueError(f"Scope '{scope_key}' object '{object_id}' must have an integer order.")
            role = object_config.get("role")
            if not isinstance(role, str) or not role:
                raise ValueError(f"Scope '{scope_key}' object '{object_id}' must define a non-empty role.")
            normalized_box: dict[str, float] = {}
            for field in ["x", "y", "width", "height"]:
                value = object_config.get(field)
                if not isinstance(value, (int, float)):
                    raise ValueError(f"Scope '{scope_key}' object '{object_id}' field '{field}' must be numeric.")
                normalized_box[field] = float(value)
            if normalized_box["width"] <= 0 or normalized_box["height"] <= 0:
                raise ValueError(f"Scope '{scope_key}' object '{object_id}' width and height must be positive.")
            rotation = float(object_config.get("rotation", 0))
            opacity_value = object_config.get("opacity")
            opacity = float(opacity_value) if isinstance(opacity_value, (int, float)) else None
            if opacity is not None and not 0 <= opacity <= 1:
                raise ValueError(f"Scope '{scope_key}' object '{object_id}' opacity must be between 0 and 1.")
            validated_object = {
                "id": object_id,
                "assetId": asset_id,
                "placeholderId": placeholder_id,
                "layerId": layer_id,
                "order": order,
                "role": role,
                "x": normalized_box["x"],
                "y": normalized_box["y"],
                "width": normalized_box["width"],
                "height": normalized_box["height"],
                "rotation": rotation,
                "visiblePhases": _normalize_phases(object_config.get("visiblePhases")),
                "crop": _validate_crop(object_config.get("crop"), label=f"Object '{object_id}'"),
                "motion": _validate_motion(object_config.get("motion"), label=f"Object '{object_id}'"),
            }
            if opacity is not None:
                validated_object["opacity"] = opacity
            if bool(object_config.get("placeholder")):
                validated_object["placeholder"] = True
            validated_objects.append(validated_object)
            object_ids.add(object_id)
        validated_scopes[scope_key] = {"layers": validated_layers, "objects": validated_objects}
    return {
        "version": str(layout.get("version", "1.0")),
        "scopes": validated_scopes,
    }


def _load_layout(catalog_assets: dict[str, dict[str, Any]], region_meta: dict[str, dict[str, Any]]) -> dict[str, Any]:
    if not LAYOUT_PATH.exists():
        raise RuntimeError("Assets/MapScene/layout.json is missing.")
    return _validate_layout(load_json(LAYOUT_PATH), catalog_assets, region_meta)


def _compile_object(
    scope_key: str,
    object_config: dict[str, Any],
    layer_order_by_id: dict[str, int],
    frames: dict[str, dict[str, float]],
) -> dict[str, Any]:
    frame = frames[scope_key]
    payload: dict[str, Any] = {
        "id": object_config["id"],
        "assetId": object_config.get("assetId"),
        "layerId": object_config["layerId"],
        "layer": object_config["layerId"],
        "order": object_config["order"],
        "role": object_config["role"],
        "x": round(frame["x"] + object_config["x"] * frame["width"], 2),
        "y": round(frame["y"] + object_config["y"] * frame["height"], 2),
        "width": round(object_config["width"] * frame["width"], 2),
        "height": round(object_config["height"] * frame["height"], 2),
        "visiblePhases": deepcopy(object_config["visiblePhases"]),
        "zIndex": layer_order_by_id[object_config["layerId"]] * 100 + object_config["order"],
    }
    if object_config.get("assetId"):
        payload["asset"] = object_config["assetId"]
    if object_config.get("placeholderId"):
        payload["placeholderId"] = object_config["placeholderId"]
    if not object_config.get("assetId") and object_config.get("placeholder"):
        payload["placeholder"] = True
    if object_config.get("crop"):
        payload["crop"] = deepcopy(object_config["crop"])
    if object_config.get("motion"):
        payload["motion"] = deepcopy(object_config["motion"])
    if object_config.get("opacity") is not None:
        payload["opacity"] = object_config["opacity"]
    if object_config.get("rotation"):
        payload["rotation"] = object_config["rotation"]
    return payload


def _compile_scopes(layout: dict[str, Any], region_meta: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    frames = _scope_frames(region_meta)
    scopes: dict[str, dict[str, Any]] = {}
    for scope_key, scope in layout["scopes"].items():
        layer_order_by_id = {layer["id"]: layer["order"] for layer in scope["layers"]}
        compiled_objects = [
            _compile_object(scope_key, object_config, layer_order_by_id, frames)
            for object_config in sorted(scope["objects"], key=lambda object_config: (layer_order_by_id[object_config["layerId"]], object_config["order"], object_config["id"]))
        ]
        scopes[scope_key] = {
            "layers": deepcopy(scope["layers"]),
            "objects": compiled_objects,
        }
    return scopes


def _used_assets(scopes: dict[str, dict[str, Any]]) -> set[str]:
    return {
        object_config["asset"]
        for scope in scopes.values()
        for object_config in scope.get("objects", [])
        if object_config.get("asset")
    }


def build_map_scene(region_meta: dict[str, dict[str, Any]]) -> dict[str, Any]:
    catalog = _load_catalog()
    layout = _load_layout(catalog["assets"], region_meta)
    scopes = _compile_scopes(layout, region_meta)
    used_asset_ids = _used_assets(scopes)
    assets = {
        asset_id: deepcopy(catalog["assets"][asset_id])
        for asset_id in sorted(used_asset_ids)
    }
    return {
        **deepcopy(MAP_SCENE_EXPERIMENT),
        "mode": "premium-raster",
        "catalog": deepcopy(catalog),
        "layout": deepcopy(layout),
        "assets": assets,
        "scopes": scopes,
        "requirements": [],
        "sources": [],
    }
