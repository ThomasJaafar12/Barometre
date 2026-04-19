from __future__ import annotations

from copy import deepcopy
from typing import Any

from .config import DOM_REGION_CODES, EXPERIENCE_REGION_CODES, GEOMETRY_OPTIMIZATION, REGION_GEOJSON_PATH
from .io import ensure_department_geojson
from .palettes import DEFAULT_REGION_THEMES
from .utils import load_json, normalize_code, normalize_department_code, slugify


def trim_region_geojson() -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    source = load_json(REGION_GEOJSON_PATH)
    features = []
    region_meta: dict[str, dict[str, Any]] = {}
    ordered = sorted(
        [feature for feature in source["features"] if feature["properties"]["code"] in EXPERIENCE_REGION_CODES],
        key=lambda feature: EXPERIENCE_REGION_CODES.index(feature["properties"]["code"]),
    )
    for index, feature in enumerate(ordered):
        code = feature["properties"]["code"]
        name = feature["properties"]["nom"]
        features.append(
            {
                "type": feature["type"],
                "geometry": feature["geometry"],
                "properties": {
                    "code": code,
                    "nom": name,
                    "slug": slugify(name),
                    "group": "dom" if code in DOM_REGION_CODES else "mainland",
                },
            }
        )
        region_meta[code] = {
            "code": code,
            "name": name,
            "slug": slugify(name),
            "group": "dom" if code in DOM_REGION_CODES else "mainland",
            "theme": DEFAULT_REGION_THEMES[index],
        }
    return {"type": "FeatureCollection", "features": features}, region_meta


def trim_department_geojson(raw_geojson: dict[str, Any]) -> dict[str, Any]:
    features = []
    for feature in raw_geojson["features"]:
        properties = feature.get("properties", {})
        region_code = normalize_code(properties.get("region"))
        if region_code not in EXPERIENCE_REGION_CODES:
            continue
        features.append(
            {
                "type": feature["type"],
                "geometry": feature["geometry"],
                "properties": {
                    "code": normalize_department_code(properties.get("code")),
                    "nom": properties.get("nom"),
                    "region": region_code,
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def round_point(point: list[float], precision: int) -> list[float]:
    return [round(point[0], precision), round(point[1], precision)]


def quantize_coordinates(coords: Any, precision: int) -> Any:
    if not coords:
        return coords
    if isinstance(coords[0], (int, float)):
        return round_point(coords, precision)
    return [quantize_coordinates(child, precision) for child in coords]


def perpendicular_distance_squared(point: list[float], start: list[float], end: list[float]) -> float:
    sx, sy = start
    ex, ey = end
    px, py = point
    dx = ex - sx
    dy = ey - sy
    denominator = dx * dx + dy * dy
    if denominator == 0:
        return (px - sx) ** 2 + (py - sy) ** 2
    ratio = ((px - sx) * dx + (py - sy) * dy) / denominator
    projected_x = sx + ratio * dx
    projected_y = sy + ratio * dy
    return (px - projected_x) ** 2 + (py - projected_y) ** 2


def simplify_line(points: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(points) <= 2:
        return points
    start = points[0]
    end = points[-1]
    max_distance = -1.0
    max_index = 0
    for index in range(1, len(points) - 1):
        distance = perpendicular_distance_squared(points[index], start, end)
        if distance > max_distance:
            max_distance = distance
            max_index = index
    if max_distance > tolerance * tolerance:
        left = simplify_line(points[: max_index + 1], tolerance)
        right = simplify_line(points[max_index:], tolerance)
        return left[:-1] + right
    return [start, end]


def simplify_ring(ring: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(ring) <= 4:
        return ring
    is_closed = ring[0] == ring[-1]
    work = ring[:-1] if is_closed else ring[:]
    simplified = simplify_line(work, tolerance)
    if len(simplified) < 3:
        simplified = work[:3]
    if is_closed:
        simplified.append(simplified[0])
    return simplified


def simplify_geometry(geometry: dict[str, Any], tolerance: float, precision: int) -> dict[str, Any]:
    geometry_type = geometry["type"]
    coordinates = geometry["coordinates"]
    if geometry_type == "Polygon":
        simplified = [simplify_ring(ring, tolerance) for ring in coordinates]
    elif geometry_type == "MultiPolygon":
        simplified = [[simplify_ring(ring, tolerance) for ring in polygon] for polygon in coordinates]
    else:
        simplified = coordinates
    return {"type": geometry_type, "coordinates": quantize_coordinates(simplified, precision)}


def simplify_feature_collection(feature_collection: dict[str, Any], tolerance: float) -> dict[str, Any]:
    optimized = deepcopy(feature_collection)
    for feature in optimized["features"]:
        feature["geometry"] = simplify_geometry(
            feature["geometry"],
            tolerance=tolerance,
            precision=GEOMETRY_OPTIMIZATION.coordinate_precision,
        )
    return optimized


def build_geographies() -> tuple[dict[str, Any], dict[str, Any], dict[str, dict[str, Any]]]:
    regions_geojson, region_meta = trim_region_geojson()
    departments_geojson = trim_department_geojson(ensure_department_geojson())
    return (
        simplify_feature_collection(regions_geojson, GEOMETRY_OPTIMIZATION.region_tolerance),
        simplify_feature_collection(departments_geojson, GEOMETRY_OPTIMIZATION.department_tolerance),
        region_meta,
    )
