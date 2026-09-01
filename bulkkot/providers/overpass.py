"""OpenStreetMap Overpass API 에서 건물을 받아온다.

가장 손쉬운 경로지만, OSM 의 한국 건물 높이 속성은 채워지지 않은 곳이 많다.
높이가 없으면 층수로, 층수도 없으면 기본값으로 떨어지므로,
정확도가 필요하면 국토교통부 건물통합정보를 쓰는 편이 낫다.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any, Sequence

from ..model import Obstacle

ENDPOINT = "https://overpass-api.de/api/interpreter"
METERS_PER_LEVEL = 3.3


def overpass_query(bbox: tuple[float, float, float, float], timeout: int = 90) -> str:
    """bbox = (min_lat, min_lon, max_lat, max_lon)."""
    s, w, n, e = bbox
    return (
        f"[out:json][timeout:{timeout}];"
        f'(way["building"]({s},{w},{n},{e});'
        f'relation["building"]({s},{w},{n},{e}););'
        "out geom;"
    )


def fetch_overpass(
    bbox: tuple[float, float, float, float],
    endpoint: str = ENDPOINT,
    timeout: int = 120,
    default_height_m: float = 12.0,
) -> list[Obstacle]:
    """bbox 안의 건물을 받아 Obstacle 목록으로. 네트워크가 필요하다."""
    query = overpass_query(bbox)
    req = urllib.request.Request(
        endpoint,
        data=urllib.parse.urlencode({"data": query}).encode(),
        headers={"User-Agent": "bulkkot/0.1 (fireworks visibility)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.load(resp)
    return parse_overpass(payload, default_height_m=default_height_m)


def parse_overpass(payload: dict[str, Any], default_height_m: float = 12.0) -> list[Obstacle]:
    """Overpass 응답(out geom)을 Obstacle 목록으로. 네트워크 없이 검증 가능."""
    out: list[Obstacle] = []
    for el in payload.get("elements", []):
        tags = el.get("tags") or {}
        geometry = el.get("geometry")
        rings: list[list[tuple[float, float]]] = []
        if geometry:
            rings.append([(float(p["lat"]), float(p["lon"])) for p in geometry])
        else:
            for member in el.get("members", []):
                if member.get("role") == "outer" and member.get("geometry"):
                    rings.append(
                        [(float(p["lat"]), float(p["lon"])) for p in member["geometry"]]
                    )
        if not rings:
            continue
        height = _number(tags.get("height")) or _number(tags.get("building:height"))
        if height is None:
            levels = _number(tags.get("building:levels"))
            height = levels * METERS_PER_LEVEL if levels else default_height_m
        base = _number(tags.get("ele")) or 0.0
        name = tags.get("name") or tags.get("building") or f"osm/{el.get('id')}"
        for j, ring in enumerate(rings):
            if len(ring) < 3:
                continue
            out.append(
                Obstacle(
                    id=f"osm{el.get('id')}_{j}",
                    name=str(name),
                    outline=ring,
                    top_elev_m=base + height,
                    kind="building",
                    source="overpass",
                )
            )
    return out


def _number(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace("m", "").strip())
    except ValueError:
        return None


def to_obstacles_json(obstacles: Sequence[Obstacle], note: str = "") -> dict[str, Any]:
    """받아온 결과를 datasets 가 읽는 형식으로."""
    return {
        "meta": {"name": "건물 데이터", "confidence": "sourced", "note": note},
        "buildings": [
            {
                "id": o.id,
                "name": o.name,
                "outline": [[lat, lon] for lat, lon in o.outline],
                "top_elev_m": o.top_elev_m,
                "source": o.source,
            }
            for o in obstacles
            if not o.is_ridge
        ],
        "ridges": [
            {
                "id": o.id,
                "name": o.name,
                "polyline": [[lat, lon] for lat, lon in o.outline],
                "top_elev_m": o.top_elev_m,
            }
            for o in obstacles
            if o.is_ridge
        ],
    }
