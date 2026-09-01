"""GeoJSON 건물 폴리곤 → obstacles.

국토교통부 건물통합정보나 VWorld에서 받은 shapefile을 GeoJSON으로 변환해
넣는 경로. 높이 속성 이름이 출처마다 다르므로 후보를 순서대로 찾는다.
층수만 있으면 층당 높이로 환산한다.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

from ..model import Obstacle

# 높이(m)가 들어 있을 법한 속성 이름들. 앞에 있는 것이 우선.
HEIGHT_KEYS = ("height", "HEIGHT", "hght", "BLDG_HG", "높이", "buildingHeight")
LEVEL_KEYS = ("building:levels", "levels", "GRND_FLR", "층수", "floors")
NAME_KEYS = ("name", "NAME", "bldNm", "건물명", "BLD_NM")

METERS_PER_LEVEL = 3.3


def load_geojson(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as fh:
        return json.load(fh)


# 줄 단위 GeoJSON(GeoJSONSeq). 서울 전체 건물처럼 큰 파일을 통째로 메모리에
# 올리지 않으려면 이쪽이 필요하다. ogr2ogr -f GeoJSONSeq 로 만들 수 있다.
SEQ_SUFFIXES = {".geojsonl", ".jsonl", ".geojsons", ".ndjson", ".geojsonseq"}


def iter_features(path: str | Path) -> Iterator[dict[str, Any]]:
    """GeoJSON 또는 줄 단위 GeoJSON에서 피처를 하나씩 흘려보낸다."""
    path = Path(path)
    if path.suffix.lower() in SEQ_SUFFIXES:
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip().lstrip("\x1e")  # RFC 8142 레코드 구분자
                if not line or line in {"[", "]"}:
                    continue
                yield json.loads(line.rstrip(","))
        return
    yield from load_geojson(path).get("features", [])


def from_geojson(
    geojson: dict[str, Any],
    ground_elev_m: float | Sequence[float] | None = None,
    default_height_m: float = 12.0,
    source: str = "geojson",
) -> list[Obstacle]:
    """FeatureCollection 을 Obstacle 목록으로.

    ground_elev_m 에 숫자를 주면 모든 건물의 지반고로 쓰고, 생략하면 0으로 둔다.
    지반고가 중요한 지역(언덕 위 아파트)이라면 DEM에서 뽑아 속성에 미리 넣어라.
    """
    return from_features(
        geojson.get("features", []), ground_elev_m, default_height_m, source
    )


def from_features(
    features: Iterable[dict[str, Any]],
    ground_elev_m: float | Sequence[float] | None = None,
    default_height_m: float = 12.0,
    source: str = "geojson",
) -> list[Obstacle]:
    """피처 시퀀스를 Obstacle 목록으로."""
    out: list[Obstacle] = []
    for i, feat in enumerate(features):
        props = feat.get("properties") or {}
        geom = feat.get("geometry") or {}
        rings = _rings(geom)
        if not rings:
            continue
        height = _first_number(props, HEIGHT_KEYS)
        if height is None:
            levels = _first_number(props, LEVEL_KEYS)
            height = levels * METERS_PER_LEVEL if levels else default_height_m
        base = _first_number(props, ("ground_elev_m", "base_elev_m")) or (
            float(ground_elev_m) if isinstance(ground_elev_m, (int, float)) else 0.0
        )
        name = next((str(props[k]) for k in NAME_KEYS if props.get(k)), f"건물 {i}")
        for j, ring in enumerate(rings):
            out.append(
                Obstacle(
                    id=f"{props.get('id', props.get('@id', f'gj{i}'))}_{j}",
                    name=name,
                    outline=ring,
                    top_elev_m=base + height,
                    kind="building",
                    source=source,
                )
            )
    return out


def _rings(geom: dict[str, Any]) -> list[list[tuple[float, float]]]:
    """GeoJSON 은 [lon, lat] 순서다. 내부 좌표계는 (lat, lon) 이라 뒤집는다."""
    t = geom.get("type")
    coords = geom.get("coordinates") or []
    if t == "Polygon":
        return [_ring(coords[0])] if coords else []
    if t == "MultiPolygon":
        return [_ring(poly[0]) for poly in coords if poly]
    return []


def _ring(ring: Iterable[Sequence[float]]) -> list[tuple[float, float]]:
    return [(float(pt[1]), float(pt[0])) for pt in ring]


def _first_number(props: dict[str, Any], keys: Sequence[str]) -> float | None:
    for k in keys:
        v = props.get(k)
        if v in (None, ""):
            continue
        try:
            return float(v)
        except (TypeError, ValueError):
            continue
    return None
