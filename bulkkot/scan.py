"""격자 탐색 — 아무도 이름 붙이지 않은 자리를 찾는다.

후보지 목록을 사람이 채우면 결국 '이미 아는 곳' 안에서만 고르게 된다.
숨은 스팟을 찾으려면 지도를 격자로 훑어야 한다. 각 격자점을 관람자로 두고
같은 가시성 계산을 돌린 뒤, 이미 유명한 곳 주변을 걷어낸다.
"""

from __future__ import annotations

from typing import Sequence

from . import geo
from .model import LaunchSite, Show, Viewpoint
from .scoring import HIDDEN_WEIGHTS, SpotScore, evaluate
from .terrain import FlatTerrain, Terrain
from .visibility import ObstacleField


def grid_points(
    bbox: tuple[float, float, float, float], step_m: float
) -> list[tuple[float, float]]:
    """(min_lat, min_lon, max_lat, max_lon) 안을 step_m 간격으로."""
    min_lat, min_lon, max_lat, max_lon = bbox
    height = geo.distance_m((min_lat, min_lon), (max_lat, min_lon))
    width = geo.distance_m((min_lat, min_lon), (min_lat, max_lon))
    rows = max(1, int(height / step_m))
    cols = max(1, int(width / step_m))
    out = []
    for i in range(rows + 1):
        lat = min_lat + (max_lat - min_lat) * i / rows
        for j in range(cols + 1):
            lon = min_lon + (max_lon - min_lon) * j / cols
            out.append((lat, lon))
    return out


def scan(
    bbox: tuple[float, float, float, float],
    step_m: float,
    sites: Sequence[LaunchSite],
    show: Show,
    field: ObstacleField,
    terrain: Terrain | None = None,
    exclude_inside_buildings: bool = True,
    eye_height_m: float = 1.6,
) -> list[SpotScore]:
    """격자 전체를 평가해 점수 순으로 돌려준다.

    crowd/access는 알 수 없으므로 중립값(0.5)으로 두고, 기하 점수만으로
    줄을 세운다. 즉 여기서 나오는 순위는 '사람이 얼마나 몰리는지'를 뺀
    순수한 '보이느냐'의 순위다.
    """
    terrain = terrain or FlatTerrain()
    results: list[SpotScore] = []
    for idx, (lat, lon) in enumerate(grid_points(bbox, step_m)):
        if exclude_inside_buildings and _inside_building(field, lat, lon):
            continue
        vp = Viewpoint(
            id=f"grid_{idx}",
            name=f"{lat:.5f}, {lon:.5f}",
            lat=lat,
            lon=lon,
            ground_elev_m=terrain.elevation(lat, lon),
            eye_height_m=eye_height_m,
            crowd=0.5,
            access=0.5,
        )
        results.append(evaluate(vp, sites, show, field, HIDDEN_WEIGHTS))
    results.sort(key=lambda s: s.total, reverse=True)
    return results


def drop_near(
    results: Sequence[SpotScore],
    known: Sequence[Viewpoint],
    radius_m: float = 400.0,
    famous_only: bool = True,
) -> list[SpotScore]:
    """이미 알려진 명당 반경 안의 격자점을 걷어낸다. 남는 것이 '숨은' 후보."""
    anchors = [v for v in known if v.famous or not famous_only]
    out = []
    for r in results:
        if any(
            geo.distance_m(r.viewpoint.latlon, a.latlon) < radius_m for a in anchors
        ):
            continue
        out.append(r)
    return out


def thin_out(results: Sequence[SpotScore], min_gap_m: float = 500.0) -> list[SpotScore]:
    """같은 언덕에서 격자점 수십 개가 줄줄이 올라오는 것을 막는다.

    점수 높은 순으로 훑으면서 이미 뽑은 지점과 min_gap_m 안이면 버린다.
    """
    kept: list[SpotScore] = []
    for r in results:
        if any(
            geo.distance_m(r.viewpoint.latlon, k.viewpoint.latlon) < min_gap_m
            for k in kept
        ):
            continue
        kept.append(r)
    return kept


def _inside_building(field: ObstacleField, lat: float, lon: float) -> bool:
    pt = geo.enu(lat, lon, field.ref[0], field.ref[1])
    for idx in field.candidates(pt, pt):
        obs = field.obstacles[idx]
        if obs.is_ridge:
            continue
        if geo.point_in_polygon(pt, field._local[idx]):
            return True
    return False
