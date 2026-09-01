"""자립형 HTML 관측도 생성.

외부 타일 서버나 CDN 없이 혼자 열리는 파일 하나를 만든다. 지도는 계산에 쓴
바로 그 좌표를 SVG로 그린 것이라, 화면에 보이는 것과 점수가 같은 데이터에서
나온다. 시간 스크러버를 움직이면 프로그램의 각 구간에서 어느 자리가 살아나고
어느 자리가 죽는지가 색으로 바뀐다 — 이 도구의 핵심 주장이 그 움직임이다.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Sequence

from . import datasets, geo
from .model import LaunchSite, Obstacle, Show, Viewpoint
from .scoring import SpotScore
from .visibility import ObstacleField, sight_profile

TITLE = "한강 불꽃 관측도"


def river_polygon(
    centerline: Sequence[Sequence[float]], width_m: float
) -> list[tuple[float, float]]:
    """중심선과 폭으로 강 양안 폴리곤을 만든다.

    각 정점에서 앞뒤 구간의 평균 방향에 수직으로 폭의 절반씩 밀어낸다.
    지도 판독용이라 굽이의 안쪽에서 조금 겹쳐도 상관없다.
    """
    pts = [(float(p[0]), float(p[1])) for p in centerline]
    if len(pts) < 2:
        return []
    ref = pts[0]
    local = [geo.enu(lat, lon, ref[0], ref[1]) for lat, lon in pts]
    half = width_m / 2.0

    left: list[tuple[float, float]] = []
    right: list[tuple[float, float]] = []
    for i, (x, y) in enumerate(local):
        prev = local[max(i - 1, 0)]
        nxt = local[min(i + 1, len(local) - 1)]
        dx, dy = nxt[0] - prev[0], nxt[1] - prev[1]
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        left.append((x + nx * half, y + ny * half))
        right.append((x - nx * half, y - ny * half))

    ring = left + right[::-1]
    return [geo.from_enu(x, y, ref[0], ref[1]) for x, y in ring]


def bridge_span(
    centerline: Sequence[Sequence[float]], lat: float, lon: float, length_m: float
) -> list[tuple[float, float]]:
    """교량을 강 흐름에 수직인 선분으로 놓는다. 다리는 한강에서 가장 강한 이정표다."""
    pts = [(float(p[0]), float(p[1])) for p in centerline]
    if len(pts) < 2:
        return []
    ref = (lat, lon)
    local = [geo.enu(a, b, ref[0], ref[1]) for a, b in pts]

    # 가장 가까운 구간의 방향을 강의 흐름으로 본다
    best_i, best_d = 0, float("inf")
    for i in range(len(local) - 1):
        mx = (local[i][0] + local[i + 1][0]) / 2.0
        my = (local[i][1] + local[i + 1][1]) / 2.0
        d = math.hypot(mx, my)
        if d < best_d:
            best_i, best_d = i, d
    dx = local[best_i + 1][0] - local[best_i][0]
    dy = local[best_i + 1][1] - local[best_i][1]
    length = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / length, dx / length
    half = length_m / 2.0
    return [
        geo.from_enu(nx * half, ny * half, lat, lon),
        geo.from_enu(-nx * half, -ny * half, lat, lon),
    ]


def build_payload(
    scores: Sequence[SpotScore],
    sites: Sequence[LaunchSite],
    obstacles: Sequence[Obstacle],
    show: Show,
    field: ObstacleField,
    profile_site_id: str | None = None,
    grid: Sequence[SpotScore] = (),
    data_note: str = "",
    terrain=None,
) -> dict:
    site_by_id = {s.id: s for s in sites}
    if profile_site_id is None:
        weight: dict[str, float] = {}
        for eff in show.effects:
            weight[eff.site_id] = weight.get(eff.site_id, 0.0) + eff.weight
        profile_site_id = max(weight, key=weight.get) if weight else sites[0].id
    profile_site = site_by_id[profile_site_id]

    spots = []
    for sc in scores:
        entry = sc.to_dict()
        profile = sight_profile(sc.viewpoint, profile_site, field, samples=90, terrain=terrain)
        entry["profile"] = {
            "site_id": profile_site.id,
            "site_name": profile_site.name,
            "base_elev_m": profile_site.base_elev_m,
            "eye_elev_m": round(sc.viewpoint.eye_elev_m, 1),
            "points": [[round(s), round(z, 1)] for s, z in profile],
        }
        spots.append(entry)

    river = datasets.load_json(datasets.DATA_DIR / "hangang.json")
    river["polygon"] = [
        [round(lat, 6), round(lon, 6)]
        for lat, lon in river_polygon(river["centerline"], float(river.get("width_m", 900)))
    ]
    landmarks = datasets.load_json(datasets.DATA_DIR / "landmarks.json")
    for bridge in landmarks.get("bridges", []):
        bridge["span"] = [
            [round(lat, 6), round(lon, 6)]
            for lat, lon in bridge_span(
                river["centerline"], bridge["lat"], bridge["lon"], bridge["length_m"]
            )
        ]

    return {
        "title": TITLE,
        "show": {
            "name": show.name,
            "date": show.date,
            "start_time": show.start_time,
            "duration_min": show.duration_min,
            "effects": [
                {
                    "id": e.id,
                    "name": e.name,
                    "site_id": e.site_id,
                    "start_min": e.start_min,
                    "end_min": e.end_min,
                    "alt_min_m": e.alt_min_m,
                    "alt_max_m": e.alt_max_m,
                    "weight": e.weight,
                    "spread_m": e.spread_m,
                }
                for e in show.effects
            ],
        },
        "sites": [
            {
                "id": s.id, "name": s.name, "lat": s.lat, "lon": s.lon,
                "base_elev_m": s.base_elev_m, "kind": s.kind, "note": s.note,
            }
            for s in sites
        ],
        "obstacles": [
            {
                "id": o.id, "name": o.name, "kind": o.kind,
                "top_elev_m": o.top_elev_m,
                "outline": [[round(p[0], 6), round(p[1], 6)] for p in o.outline],
            }
            for o in obstacles
        ],
        "river": river,
        "landmarks": landmarks,
        "spots": spots,
        "grid": [
            {
                "lat": g.viewpoint.lat, "lon": g.viewpoint.lon,
                "total": round(g.total, 3), "sky": round(g.parts["sky"], 3),
            }
            for g in grid
        ],
        "data_note": data_note,
    }


def render(payload: dict) -> str:
    return _template().replace("/*__PAYLOAD__*/null", json.dumps(payload, ensure_ascii=False))


def write(path: str | Path, payload: dict) -> Path:
    out = Path(path)
    out.write_text(render(payload), encoding="utf-8")
    return out


TEMPLATE_PATH = datasets.DATA_DIR / "template.html"


def _template() -> str:
    return TEMPLATE_PATH.read_text(encoding="utf-8")
