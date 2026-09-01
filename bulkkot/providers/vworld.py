"""VWorld(국토교통부 공간정보 오픈플랫폼) 건물 데이터 어댑터.

VWorld 데이터 API 는 키가 필요하다(무료 발급). 응답이 GeoJSON 형식이므로
받은 뒤에는 local_geojson 의 변환기를 그대로 쓴다.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any

from ..model import Obstacle
from .local_geojson import from_geojson

ENDPOINT = "https://api.vworld.kr/req/data"
BUILDING_LAYER = "LT_C_BLDINFO"  # 건물 정보 (높이/층수 속성 포함)


def fetch_vworld(
    bbox: tuple[float, float, float, float],
    api_key: str,
    layer: str = BUILDING_LAYER,
    size: int = 1000,
    page: int = 1,
    timeout: int = 60,
) -> list[Obstacle]:
    """bbox = (min_lat, min_lon, max_lat, max_lon). 네트워크와 API 키가 필요하다."""
    s, w, n, e = bbox
    params = {
        "service": "data",
        "request": "GetFeature",
        "data": layer,
        "key": api_key,
        "format": "json",
        "geometry": "true",
        "crs": "EPSG:4326",
        "geomFilter": f"BOX({w},{s},{e},{n})",
        "size": str(size),
        "page": str(page),
    }
    url = f"{ENDPOINT}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        payload: dict[str, Any] = json.load(resp)
    collection = (
        payload.get("response", {}).get("result", {}).get("featureCollection")
    )
    if not collection:
        raise RuntimeError(
            f"VWorld 응답에 featureCollection 이 없습니다: {payload.get('response', {}).get('status')}"
        )
    return from_geojson(collection, source="vworld")
