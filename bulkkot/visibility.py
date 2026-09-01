"""가시성 엔진.

핵심 개념은 **최소 가시 고도(MVA, minimum visible altitude)** 하나다.

    "이 자리에서는 발사면 기준 몇 m 위에서 터져야 눈에 들어오는가?"

그늘 계산이 '태양 방향으로 광선을 쏴서 건물에 막히는지' 보는 것이라면,
여기서는 반대로 '관람자에서 발사 지점 상공으로 광선을 쏴서, 어느 높이부터
막히지 않는지'를 본다. 광원이 무한히 먼 태양이 아니라 2~8km 앞 유한 거리의
점이라는 것, 그리고 그 점이 시간에 따라 고도를 바꾼다는 것만 다르다.

MVA는 이분 탐색 없이 닫힌 해로 구한다. 불꽃은 발사 지점 '바로 위'에서
터지므로 수평거리 D가 고정되고, 시선 높이는 도착 표고에 대해 선형이다.
따라서 각 장애물이 요구하는 최소 도착 표고를 구해 그 최댓값을 취하면 된다.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Iterable, Sequence

from . import geo
from .model import Blocker, LaunchSite, Obstacle, Sight, Viewpoint

# 곡률에 의한 지면 차폐를 확인할 때 시선을 몇 등분해서 볼지.
_GROUND_SAMPLES = 48

# 관람자가 딛고 선 능선/둔덕은 시야를 막지 않는다. 이 거리 안의 교차는 무시한다.
_UNDERFOOT_M = 30.0

# 지형 표본 간격과, 관람자 발밑을 건너뛰는 거리.
# 발밑을 건너뛰지 않으면 자기가 선 지면이 시선을 수직으로 막는 것으로 계산된다.
_TERRAIN_STEP_M = 25.0
_TERRAIN_SKIP_M = 60.0
_TERRAIN_MAX_SAMPLES = 400


class ObstacleField:
    """장애물 집합 + 시선 질의를 위한 균일 격자 색인."""

    def __init__(
        self,
        obstacles: Iterable[Obstacle],
        ref: tuple[float, float] | None = None,
        cell_m: float = 300.0,
    ) -> None:
        self.obstacles: list[Obstacle] = list(obstacles)
        if ref is None:
            ref = _centroid(self.obstacles)
        self.ref = ref
        self.cell_m = cell_m

        self._local: list[list[tuple[float, float]]] = []
        self._bounds: list[tuple[float, float, float]] = []  # (cx, cy, radius)
        self._index: dict[tuple[int, int], list[int]] = defaultdict(list)
        self._extent = (
            float("inf"), float("inf"), float("-inf"), float("-inf")
        )  # 로컬 좌표 (min_x, min_y, max_x, max_y)

        for idx, obs in enumerate(self.obstacles):
            pts = [geo.enu(lat, lon, ref[0], ref[1]) for lat, lon in obs.outline]
            self._local.append(pts)
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            mid_x = (min(xs) + max(xs)) / 2.0
            mid_y = (min(ys) + max(ys)) / 2.0
            self._bounds.append(
                (mid_x, mid_y, math.hypot(max(xs) - mid_x, max(ys) - mid_y))
            )
            self._extent = (
                min(self._extent[0], min(xs)),
                min(self._extent[1], min(ys)),
                max(self._extent[2], max(xs)),
                max(self._extent[3], max(ys)),
            )
            for cx in range(_cell(min(xs), cell_m), _cell(max(xs), cell_m) + 1):
                for cy in range(_cell(min(ys), cell_m), _cell(max(ys), cell_m) + 1):
                    self._index[(cx, cy)].append(idx)

    def candidates(self, p0: tuple[float, float], p1: tuple[float, float]) -> list[int]:
        """선분이 지나는 격자 칸에 걸친 장애물 인덱스 (중복 제거)."""
        seen: set[int] = set()
        for cell in _cells_along(p0, p1, self.cell_m):
            for idx in self._index.get(cell, ()):
                seen.add(idx)
        return sorted(seen)

    def blockers(
        self,
        viewer: Viewpoint,
        site: LaunchSite,
    ) -> tuple[list[Blocker], float, int]:
        """시선 위 장애물 목록, 요구되는 최소 도착 표고(m), 검사한 후보 수.

        반환하는 표고는 해발 기준이다. 발사면 기준 고도로 바꾸는 것은 호출자 몫.
        검사한 후보 수는 '이 시선에 데이터가 얼마나 깔려 있었나'를 알려주는
        진단값이다. 0에 가까우면 결과가 좋아서가 아니라 데이터가 없어서일 수 있다.
        """
        ref = self.ref
        p_view = geo.enu(viewer.lat, viewer.lon, ref[0], ref[1])
        p_site = geo.enu(site.lat, site.lon, ref[0], ref[1])
        total = math.hypot(p_site[0] - p_view[0], p_site[1] - p_view[1])
        z_eye = viewer.eye_elev_m

        found: list[Blocker] = []
        required = float("-inf")
        checked = 0

        if total <= 0.0:
            return found, z_eye, checked

        # 높은 것부터 본다. 앞에서 세운 기준이 높을수록 뒤의 후보가 빨리 걸러진다.
        candidates = sorted(
            self.candidates(p_view, p_site),
            key=lambda i: self.obstacles[i].top_elev_m,
            reverse=True,
        )
        for idx in candidates:
            obs = self.obstacles[idx]

            if obs.top_elev_m <= z_eye:
                # 눈높이보다 낮은 것은 하늘을 가릴 수 없다. 정렬해 두었으니 이후는 볼 것도 없다.
                break

            # 이 장애물이 최선을 다해도 지금 기준을 못 넘으면 교차 검사가 낭비다.
            # 시선 위 점은 중심에서 반경 안에 있으므로 s >= |눈→중심| - 반경.
            mid_x, mid_y, radius = self._bounds[idx]
            s_min = math.hypot(mid_x - p_view[0], mid_y - p_view[1]) - radius
            if s_min > 0.0 and required > float("-inf"):
                best = geo.required_z_end(s_min, total, z_eye, obs.top_elev_m)
                if best <= required:
                    continue

            checked += 1
            poly = self._local[idx]
            hits = geo.segment_intersections(p_view, p_site, poly)
            lower = _UNDERFOOT_M if obs.is_ridge else 0.0
            hits = [h for h in hits if lower < h < total]
            if not hits:
                if not obs.is_ridge and geo.point_in_polygon(p_view, poly):
                    # 건물 안(또는 자기보다 높은 구조물 발치)에 서 있는 경우.
                    found.append(Blocker(obs.id, obs.name, 0.0, obs.top_elev_m, float("inf")))
                    required = float("inf")
                continue

            # 시선은 관람자(낮음)에서 불꽃(높음)으로 올라가므로, 같은 높이의
            # 장애물이라면 가까울수록 더 높은 고도를 요구한다. 첫 교차점이 결정적.
            s = hits[0]
            need = geo.required_z_end(s, total, z_eye, obs.top_elev_m)
            found.append(Blocker(obs.id, obs.name, s, obs.top_elev_m, need))
            required = max(required, need)

        return found, required, checked

    def coverage(self, p0: tuple[float, float], p1: tuple[float, float]) -> float:
        """시선 중 장애물 데이터가 존재하는 영역 안에 들어 있는 구간의 비율.

        '안 막힌다'는 결론이 정말 트여서인지, 그냥 그 구간이 데이터 범위 밖이라
        아무것도 못 봤기 때문인지 구분한다. 강 위처럼 데이터 범위 안이지만
        건물이 없는 구간은 정상적으로 1로 센다 — 그건 정말 트인 것이다.
        """
        min_x, min_y, max_x, max_y = self._extent
        if min_x > max_x:
            return 0.0
        samples = 64
        inside = 0
        for i in range(samples + 1):
            t = i / samples
            x = p0[0] + (p1[0] - p0[0]) * t
            y = p0[1] + (p1[1] - p0[1]) * t
            if min_x <= x <= max_x and min_y <= y <= max_y:
                inside += 1
        return inside / (samples + 1)

    def obstacle_density(self, p0: tuple[float, float], p1: tuple[float, float]) -> float:
        """시선이 지나는 격자 칸 중 장애물이 실제로 들어 있는 칸의 비율(참고값)."""
        cells = list(_cells_line(p0, p1, self.cell_m))
        if not cells:
            return 0.0
        return sum(1 for c in cells if c in self._index) / len(cells)

    def bbox(self) -> tuple[float, float, float, float]:
        lats = [p[0] for obs in self.obstacles for p in obs.outline]
        lons = [p[1] for obs in self.obstacles for p in obs.outline]
        if not lats:
            return (0.0, 0.0, 0.0, 0.0)
        return (min(lats), min(lons), max(lats), max(lons))


def ground_horizon_requirement(
    viewer: Viewpoint, site: LaunchSite, ground_elev_m: float | None = None
) -> float:
    """건물이 하나도 없어도 지구가 둥글어서 생기는 하한.

    관람자와 발사 지점 사이가 표고 ground_elev_m의 평지라고 볼 때,
    그 평지 위로 시선이 나오려면 필요한 최소 도착 표고.
    """
    total = geo.distance_m(viewer.latlon, site.latlon)
    if total <= 0.0:
        return float("-inf")
    if ground_elev_m is None:
        ground_elev_m = min(viewer.ground_elev_m, site.base_elev_m)
    z_eye = viewer.eye_elev_m
    best = float("-inf")
    for i in range(1, _GROUND_SAMPLES):
        s = total * i / _GROUND_SAMPLES
        best = max(best, geo.required_z_end(s, total, z_eye, ground_elev_m))
    return best


def terrain_requirement(
    viewer: Viewpoint,
    site: LaunchSite,
    terrain,
    step_m: float = _TERRAIN_STEP_M,
    skip_m: float = _TERRAIN_SKIP_M,
) -> Blocker | None:
    """지형 자체가 요구하는 최소 도착 표고.

    수치표고모델이 있으면 언덕은 두 가지로 작용한다. 관람자를 들어올리기도 하고,
    앞을 가로막기도 한다. 후자가 여기서 계산된다 — 시선을 따라 지반고를 훑으며
    건물과 똑같은 공식을 적용한다.

    관람자 발밑 skip_m 안쪽은 건너뛴다. 자기가 딛고 선 지면은 시야를 막지 않고,
    그 구간을 넣으면 DEM 잡음 하나가 결과 전체를 뒤집는다.
    """
    total = geo.distance_m(viewer.latlon, site.latlon)
    if total <= skip_m:
        return None
    z_eye = viewer.eye_elev_m
    count = min(_TERRAIN_MAX_SAMPLES, max(2, int((total - skip_m) / step_m)))

    best: Blocker | None = None
    for i in range(count + 1):
        s = skip_m + (total - skip_m) * i / count
        if s >= total:
            break
        t = s / total
        lat = viewer.lat + (site.lat - viewer.lat) * t
        lon = viewer.lon + (site.lon - viewer.lon) * t
        elev = terrain.elevation(lat, lon)
        if elev <= z_eye:
            continue
        need = geo.required_z_end(s, total, z_eye, elev)
        if best is None or need > best.required_elev_m:
            best = Blocker("terrain", "지형", s, elev, need)
    return best


def sight(
    viewer: Viewpoint,
    site: LaunchSite,
    field: ObstacleField,
    ground_elev_m: float | None = None,
    terrain=None,
) -> Sight:
    """한 후보지 → 한 발사 지점의 가시 기하."""
    distance = geo.distance_m(viewer.latlon, site.latlon)
    bearing = geo.bearing_deg(viewer.latlon, site.latlon)
    blockers, required, checked = field.blockers(viewer, site)
    coverage = field.coverage(
        geo.enu(viewer.lat, viewer.lon, field.ref[0], field.ref[1]),
        geo.enu(site.lat, site.lon, field.ref[0], field.ref[1]),
    )

    if terrain is not None:
        ground = terrain_requirement(viewer, site, terrain)
        if ground is not None:
            blockers.append(ground)
            required = max(required, ground.required_elev_m)

    horizon = ground_horizon_requirement(viewer, site, ground_elev_m)
    limiting: Blocker | None = None
    if blockers:
        limiting = max(blockers, key=lambda b: b.required_elev_m)
        if limiting.required_elev_m < horizon:
            limiting = None

    required = max(required, horizon)
    min_alt = max(0.0, required - site.base_elev_m) if required > float("-inf") else 0.0

    blockers.sort(key=lambda b: b.required_elev_m, reverse=True)
    return Sight(
        viewpoint_id=viewer.id,
        site_id=site.id,
        distance_m=distance,
        bearing_deg=bearing,
        min_visible_alt_m=min_alt,
        limiting=limiting,
        blockers=blockers[:8],
        checked_obstacles=checked,
        coverage=coverage,
    )


def sight_profile(
    viewer: Viewpoint,
    site: LaunchSite,
    field: ObstacleField,
    samples: int = 160,
    terrain=None,
) -> list[tuple[float, float]]:
    """시선 단면도용 (수평거리, 차폐 표고) 시퀀스.

    '무엇이 막는지'를 그림으로 보여줄 때 쓴다. 질의 구간에 걸친 장애물만
    확인하므로 후보지 하나를 설명할 때만 호출하는 것을 전제로 한다.
    """
    ref = field.ref
    p_view = geo.enu(viewer.lat, viewer.lon, ref[0], ref[1])
    p_site = geo.enu(site.lat, site.lon, ref[0], ref[1])
    total = math.hypot(p_site[0] - p_view[0], p_site[1] - p_view[1])
    if total <= 0.0:
        return []

    idxs = field.candidates(p_view, p_site)
    spans: list[tuple[float, float, float]] = []
    for idx in idxs:
        obs = field.obstacles[idx]
        poly = field._local[idx]
        hits = [h for h in geo.segment_intersections(p_view, p_site, poly) if 0.0 <= h <= total]
        if not hits:
            continue
        if obs.is_ridge:
            for h in hits:
                spans.append((h - 15.0, h + 15.0, obs.top_elev_m))
        else:
            for i in range(0, len(hits) - 1, 2):
                spans.append((hits[i], hits[i + 1], obs.top_elev_m))

    profile: list[tuple[float, float]] = []
    for i in range(samples + 1):
        s = total * i / samples
        top = min(viewer.ground_elev_m, 0.0)
        if terrain is not None:
            t = s / total if total else 0.0
            top = max(
                top,
                terrain.elevation(
                    viewer.lat + (site.lat - viewer.lat) * t,
                    viewer.lon + (site.lon - viewer.lon) * t,
                ),
            )
        for lo, hi, z in spans:
            if lo <= s <= hi and z > top:
                top = z
        profile.append((s, top))
    return profile


def _cell(v: float, size: float) -> int:
    return int(math.floor(v / size))


def _cells_line(
    p0: tuple[float, float], p1: tuple[float, float], size: float
) -> Iterable[tuple[int, int]]:
    """선분이 실제로 지나는 격자 칸만 (여유 없이)."""
    length = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    steps = max(1, int(length / (size * 0.5)) + 1)
    seen: set[tuple[int, int]] = set()
    for i in range(steps + 1):
        t = i / steps
        cell = (
            _cell(p0[0] + (p1[0] - p0[0]) * t, size),
            _cell(p0[1] + (p1[1] - p0[1]) * t, size),
        )
        if cell not in seen:
            seen.add(cell)
            yield cell


def _cells_along(
    p0: tuple[float, float], p1: tuple[float, float], size: float
) -> Iterable[tuple[int, int]]:
    """선분이 지나는 격자 칸을 정확히 훑는다 (Amanatides–Woo).

    장애물은 자기 bbox 가 걸친 모든 칸에 색인되어 있으므로, 선분이 실제로
    지나는 칸만 보면 놓치는 것이 없다. 표본을 찍고 주변 3x3을 훑던 이전
    방식은 후보를 아홉 배로 부풀렸다.
    """
    x0, y0 = p0
    x1, y1 = p1
    cx, cy = _cell(x0, size), _cell(y0, size)
    cx1, cy1 = _cell(x1, size), _cell(y1, size)
    yield (cx, cy)
    if (cx, cy) == (cx1, cy1):
        return

    dx, dy = x1 - x0, y1 - y0
    step_x = 1 if dx > 0 else (-1 if dx < 0 else 0)
    step_y = 1 if dy > 0 else (-1 if dy < 0 else 0)
    inf = float("inf")
    t_max_x = ((cx + (1 if step_x > 0 else 0)) * size - x0) / dx if dx else inf
    t_max_y = ((cy + (1 if step_y > 0 else 0)) * size - y0) / dy if dy else inf
    t_delta_x = abs(size / dx) if dx else inf
    t_delta_y = abs(size / dy) if dy else inf

    # 부동소수 오차로 목적지 칸을 지나치는 경우를 대비한 상한
    guard = abs(cx1 - cx) + abs(cy1 - cy) + 4
    while guard > 0 and (cx, cy) != (cx1, cy1):
        guard -= 1
        if t_max_x < t_max_y:
            cx += step_x
            t_max_x += t_delta_x
        else:
            cy += step_y
            t_max_y += t_delta_y
        yield (cx, cy)


def _centroid(obstacles: Sequence[Obstacle]) -> tuple[float, float]:
    pts = [p for obs in obstacles for p in obs.outline]
    if not pts:
        return (37.5203, 126.9470)
    return (
        sum(p[0] for p in pts) / len(pts),
        sum(p[1] for p in pts) / len(pts),
    )
