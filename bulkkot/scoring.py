"""점수 모델.

가시성(기하)만으로는 '꿀스팟'이 되지 않는다. 다 보여도 너무 멀면 좁쌀만 하고,
너무 가까우면 목이 아프고, 아무리 좋아도 못 들어가면 소용없다.
그래서 기하 점수(sky/size/angle)에 현장 점수(calm/access)를 얹는다.

기하 점수는 데이터에서 계산되고, 현장 점수는 사람이 채운 값이다.
둘을 섞되 어느 쪽이 얼마나 기여했는지는 항상 분해해서 보여준다.
"""

from __future__ import annotations

from dataclasses import dataclass, field as dc_field
from typing import Any, Iterable, Sequence

from . import geo
from .model import Effect, LaunchSite, Show, Sight, Viewpoint
from .visibility import ObstacleField, sight

DEFAULT_WEIGHTS: dict[str, float] = {
    "sky": 0.45,  # 프로그램 중 실제로 보이는 비중
    "size": 0.15,  # 화면을 채우는 정도
    "angle": 0.10,  # 올려다보는 각도의 편안함
    "calm": 0.20,  # 인파
    "access": 0.10,  # 접근성
}

HIDDEN_WEIGHTS: dict[str, float] = {
    "sky": 0.40,
    "size": 0.12,
    "angle": 0.08,
    "calm": 0.32,
    "access": 0.08,
}


@dataclass
class EffectVisibility:
    effect_id: str
    name: str
    start_min: int
    end_min: int
    fraction: float
    min_visible_alt_m: float
    elevation_angle_deg: float


@dataclass
class SpotScore:
    viewpoint: Viewpoint
    total: float
    parts: dict[str, float]
    sights: dict[str, Sight]
    timeline: list[EffectVisibility] = dc_field(default_factory=list)
    distance_m: float = 0.0
    bearing_deg: float = 0.0
    apex_angle_deg: float = 0.0
    worst_blocker: str | None = None

    @property
    def visible_pct(self) -> float:
        return 100.0 * self.parts.get("sky", 0.0)

    def to_dict(self) -> dict[str, Any]:
        vp = self.viewpoint
        return {
            "id": vp.id,
            "name": vp.name,
            "lat": vp.lat,
            "lon": vp.lon,
            "ground_elev_m": vp.ground_elev_m,
            "famous": vp.famous,
            "tags": list(vp.tags),
            "note": vp.note,
            "total": round(self.total, 3),
            "parts": {k: round(v, 3) for k, v in self.parts.items()},
            "distance_m": round(self.distance_m),
            "bearing_deg": round(self.bearing_deg, 1),
            "compass": geo.compass_16(self.bearing_deg),
            "apex_angle_deg": round(self.apex_angle_deg, 1),
            "worst_blocker": self.worst_blocker,
            "sights": {k: v.to_dict() for k, v in self.sights.items()},
            "timeline": [
                {
                    "id": t.effect_id,
                    "name": t.name,
                    "start_min": t.start_min,
                    "end_min": t.end_min,
                    "fraction": round(t.fraction, 3),
                    "min_visible_alt_m": round(t.min_visible_alt_m, 1),
                    "elevation_angle_deg": round(t.elevation_angle_deg, 1),
                }
                for t in self.timeline
            ],
        }


def trapezoid(x: float, zero_lo: float, good_lo: float, good_hi: float, zero_hi: float) -> float:
    """[good_lo, good_hi]에서 1, [zero_lo, zero_hi] 밖에서 0인 사다리꼴 점수."""
    if x <= zero_lo or x >= zero_hi:
        return 0.0
    if x < good_lo:
        return (x - zero_lo) / max(good_lo - zero_lo, 1e-9)
    if x > good_hi:
        return (zero_hi - x) / max(zero_hi - good_hi, 1e-9)
    return 1.0


def size_score(angular_deg: float) -> float:
    """전개 지름이 시야에서 차지하는 각도로 매기는 '스케일' 점수.

    2도 아래는 밤하늘의 작은 점, 6~22도가 사진과 눈 모두에 좋은 대역,
    50도를 넘으면 화면 밖으로 넘쳐 고개를 젖혀야 한다.
    """
    return trapezoid(angular_deg, 1.0, 6.0, 22.0, 55.0)


def angle_score(elev_deg: float) -> float:
    """올려다보는 각도. 너무 낮으면 지평선 근처 미세먼지·건물,
    너무 높으면 목이 꺾인다."""
    return trapezoid(elev_deg, 1.0, 7.0, 30.0, 60.0)


def evaluate(
    viewer: Viewpoint,
    sites: Sequence[LaunchSite],
    show: Show,
    field: ObstacleField,
    weights: dict[str, float] | None = None,
    terrain=None,
) -> SpotScore:
    """후보지 하나를 평가한다."""
    w = dict(weights or DEFAULT_WEIGHTS)
    site_by_id = {s.id: s for s in sites}
    sights = {s.id: sight(viewer, s, field, terrain=terrain) for s in sites}

    timeline: list[EffectVisibility] = []
    sky_num = 0.0
    sky_den = 0.0
    size_num = 0.0
    angle_num = 0.0
    seen_weight = 0.0
    dist_num = 0.0
    bear_e = 0.0
    bear_n = 0.0

    for eff in show.effects:
        st = sights.get(eff.site_id)
        site = site_by_id.get(eff.site_id)
        if st is None or site is None:
            continue
        frac = eff.visible_fraction(st.min_visible_alt_m)
        sky_num += eff.weight * frac
        sky_den += eff.weight

        # 보이는 부분의 대표 고도 = 가시 대역의 중앙값
        lo = max(eff.alt_min_m, st.min_visible_alt_m)
        hi = max(eff.alt_max_m, lo)
        mid_alt = (lo + hi) / 2.0
        dz = (site.base_elev_m + mid_alt) - viewer.eye_elev_m
        elev = geo.elevation_angle_deg(st.distance_m, dz)
        timeline.append(
            EffectVisibility(
                effect_id=eff.id,
                name=eff.name,
                start_min=eff.start_min,
                end_min=eff.end_min,
                fraction=frac,
                min_visible_alt_m=st.min_visible_alt_m,
                elevation_angle_deg=elev,
            )
        )

        if frac > 0.0:
            seen = eff.weight * frac
            seen_weight += seen
            size_num += seen * size_score(geo.angular_size_deg(eff.spread_m, st.distance_m))
            angle_num += seen * angle_score(elev)
            dist_num += seen * st.distance_m
            rad = st.bearing_deg
            bear_e += seen * _sin(rad)
            bear_n += seen * _cos(rad)

    sky = sky_num / sky_den if sky_den else 0.0
    size = size_num / seen_weight if seen_weight else 0.0
    angle = angle_num / seen_weight if seen_weight else 0.0
    distance = dist_num / seen_weight if seen_weight else _mean(
        [st.distance_m for st in sights.values()]
    )
    bearing = _atan2_deg(bear_e, bear_n) if seen_weight else (
        next(iter(sights.values())).bearing_deg if sights else 0.0
    )

    parts = {
        "sky": sky,
        "size": size,
        "angle": angle,
        "calm": 1.0 - viewer.crowd,
        "access": viewer.access,
    }
    total = sum(w.get(k, 0.0) * v for k, v in parts.items())

    apex_alt = max((e.alt_max_m for e in show.effects), default=0.0)
    main = _busiest_site(show, sights)
    apex_angle = 0.0
    worst = None
    if main is not None:
        site = site_by_id[main.site_id]
        apex_angle = geo.elevation_angle_deg(
            main.distance_m, site.base_elev_m + apex_alt - viewer.eye_elev_m
        )
        worst = main.limiting.obstacle_name if main.limiting else None

    return SpotScore(
        viewpoint=viewer,
        total=total,
        parts=parts,
        sights=sights,
        timeline=timeline,
        distance_m=distance,
        bearing_deg=bearing,
        apex_angle_deg=apex_angle,
        worst_blocker=worst,
    )


def rank(
    viewers: Iterable[Viewpoint],
    sites: Sequence[LaunchSite],
    show: Show,
    field: ObstacleField,
    weights: dict[str, float] | None = None,
    terrain=None,
) -> list[SpotScore]:
    scores = [evaluate(v, sites, show, field, weights, terrain) for v in viewers]
    scores.sort(key=lambda s: s.total, reverse=True)
    return scores


def _busiest_site(show: Show, sights: dict[str, Sight]) -> Sight | None:
    """연출 가중치가 가장 큰 발사 지점의 시선."""
    weight: dict[str, float] = {}
    for eff in show.effects:
        weight[eff.site_id] = weight.get(eff.site_id, 0.0) + eff.weight
    for site_id, _ in sorted(weight.items(), key=lambda kv: kv[1], reverse=True):
        if site_id in sights:
            return sights[site_id]
    return None


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _sin(deg: float) -> float:
    import math

    return math.sin(math.radians(deg))


def _cos(deg: float) -> float:
    import math

    return math.cos(math.radians(deg))


def _atan2_deg(e: float, n: float) -> float:
    import math

    return math.degrees(math.atan2(e, n)) % 360.0
