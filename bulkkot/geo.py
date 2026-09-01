"""로컬 평면 좌표 변환과 시선(line of sight) 기하 계산.

도시 규모(수십 km)에서는 등거리원통도법(equirectangular) 근사로 충분하다.
기준점 주변에서 오차는 1km당 수 cm 수준이라 건물 폭보다 훨씬 작다.
"""

from __future__ import annotations

import math
from typing import Iterable, Sequence, Tuple

EARTH_R = 6_378_137.0

# 대기 굴절 계수. 표준 대기에서 0.13 내외이며, 유효 지구 반지름을 키워
# 지구 곡률에 의한 시선 하강량을 줄인다.
REFRACTION_K = 0.13
EFFECTIVE_R = EARTH_R / (1.0 - REFRACTION_K)

LatLon = Tuple[float, float]


def enu(lat: float, lon: float, ref_lat: float, ref_lon: float) -> Tuple[float, float]:
    """(lat, lon)을 기준점 기준 로컬 평면 (east_m, north_m)으로."""
    cos_ref = math.cos(math.radians(ref_lat))
    east = math.radians(lon - ref_lon) * EARTH_R * cos_ref
    north = math.radians(lat - ref_lat) * EARTH_R
    return east, north


def from_enu(east: float, north: float, ref_lat: float, ref_lon: float) -> LatLon:
    """enu()의 역변환."""
    lat = ref_lat + math.degrees(north / EARTH_R)
    cos_ref = math.cos(math.radians(ref_lat))
    lon = ref_lon + math.degrees(east / (EARTH_R * cos_ref))
    return lat, lon


def distance_m(a: LatLon, b: LatLon) -> float:
    """두 좌표 사이 수평 거리(m)."""
    east, north = enu(b[0], b[1], a[0], a[1])
    return math.hypot(east, north)


def bearing_deg(a: LatLon, b: LatLon) -> float:
    """a에서 b를 바라보는 방위각(북=0, 시계방향, 0~360)."""
    east, north = enu(b[0], b[1], a[0], a[1])
    return math.degrees(math.atan2(east, north)) % 360.0


def compass_16(bearing: float) -> str:
    """방위각을 16방위 한글 표기로."""
    names = [
        "북", "북북동", "북동", "동북동", "동", "동남동", "남동", "남남동",
        "남", "남남서", "남서", "서남서", "서", "서북서", "북서", "북북서",
    ]
    return names[int((bearing % 360.0) / 22.5 + 0.5) % 16]


def curvature_drop(s: float, total: float) -> float:
    """지구 곡률 + 굴절로 인해 시선이 평면 대비 낮아지는 양(m).

    시선의 양 끝(s=0, s=total)에서 0이고 중간에서 최대가 되는 포물선 근사.
    한강 규모(<10km)에서는 1~3m지만, 강 건너 저고도 연출의 가시 여부를
    가르는 경계에서는 무시할 수 없다.
    """
    if total <= 0.0:
        return 0.0
    return s * (total - s) / (2.0 * EFFECTIVE_R)


def ray_elevation(s: float, total: float, z_start: float, z_end: float) -> float:
    """시선이 수평거리 s 지점에서 갖는 표고(m). 곡률 보정 포함."""
    if total <= 0.0:
        return max(z_start, z_end)
    return z_start + (z_end - z_start) * (s / total) - curvature_drop(s, total)


def required_z_end(s: float, total: float, z_start: float, z_obstacle: float) -> float:
    """수평거리 s에 표고 z_obstacle의 장애물이 있을 때,
    그것을 아슬아슬하게 넘어가려면 도착점(터지는 지점)이 가져야 할 최소 표고.

    ray_elevation(s, ...) >= z_obstacle 을 z_end 에 대해 푼 닫힌 해.
    이분 탐색 없이 한 번에 '최소 가시 고도'를 얻는 근거가 된다.
    """
    if s <= 0.0:
        return float("-inf") if z_obstacle <= z_start else float("inf")
    needed = z_obstacle + curvature_drop(s, total) - z_start
    return z_start + needed * (total / s)


def elevation_angle_deg(distance: float, dz: float) -> float:
    """수평거리와 고도차로부터 올려다보는 각도(도)."""
    if distance <= 0.0:
        return 90.0 if dz > 0 else 0.0
    return math.degrees(math.atan2(dz, distance))


def angular_size_deg(size_m: float, distance: float) -> float:
    """거리 distance에서 지름 size_m인 물체가 차지하는 시각(도)."""
    if distance <= 0.0:
        return 180.0
    return math.degrees(2.0 * math.atan2(size_m / 2.0, distance))


def segment_intersections(
    p0: Tuple[float, float],
    p1: Tuple[float, float],
    polygon: Sequence[Tuple[float, float]],
) -> list[float]:
    """선분 p0->p1 과 닫힌 폴리곤 경계의 교차 지점을, p0로부터의 거리 목록으로.

    좌표는 로컬 평면(m). 결과는 정렬된 거리값이며 접점(t 중복)은 제거한다.
    """
    dx = p1[0] - p0[0]
    dy = p1[1] - p0[1]
    seg_len = math.hypot(dx, dy)
    if seg_len == 0.0:
        return []

    hits: list[float] = []
    n = len(polygon)
    for i in range(n):
        ax, ay = polygon[i]
        bx, by = polygon[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        denom = dx * ey - dy * ex
        if abs(denom) < 1e-12:
            continue  # 평행
        t = ((ax - p0[0]) * ey - (ay - p0[1]) * ex) / denom
        u = ((ax - p0[0]) * dy - (ay - p0[1]) * dx) / denom
        if 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0:
            hits.append(t * seg_len)
    hits.sort()
    deduped: list[float] = []
    for h in hits:
        if not deduped or h - deduped[-1] > 1e-6:
            deduped.append(h)
    return deduped


def point_in_polygon(pt: Tuple[float, float], polygon: Sequence[Tuple[float, float]]) -> bool:
    """레이 캐스팅 방식 내부 판정 (로컬 평면 좌표)."""
    x, y = pt
    inside = False
    n = len(polygon)
    for i in range(n):
        ax, ay = polygon[i]
        bx, by = polygon[(i + 1) % n]
        if (ay > y) != (by > y):
            x_cross = ax + (y - ay) * (bx - ax) / (by - ay)
            if x_cross > x:
                inside = not inside
    return inside


def polygon_bbox(polygon: Iterable[LatLon]) -> Tuple[float, float, float, float]:
    """(min_lat, min_lon, max_lat, max_lon)."""
    lats = [p[0] for p in polygon]
    lons = [p[1] for p in polygon]
    return min(lats), min(lons), max(lats), max(lons)
