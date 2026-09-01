"""JSON 데이터셋 로딩.

내장 씨드 데이터는 엔진을 굴려보기 위한 근사치다. --data 로 다른 디렉터리를
지정하면 같은 스키마의 실제 데이터(국토부 건물통합정보, VWorld 3D 건물,
수치표고모델에서 뽑은 능선 등)로 통째로 갈아끼울 수 있다.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Iterable, Sequence

from . import geo
from .model import Effect, LaunchSite, Obstacle, Show, Viewpoint
from .visibility import ObstacleField

DATA_DIR = Path(__file__).parent / "data"


def rect_outline(
    lat: float, lon: float, width_m: float, depth_m: float, rotation_deg: float = 0.0
) -> list[tuple[float, float]]:
    """중심·폭·깊이로 사각형 외곽선을 만든다. 손으로 씨드 데이터를 적을 때 쓴다."""
    hw, hd = width_m / 2.0, depth_m / 2.0
    corners = [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd)]
    rot = math.radians(rotation_deg)
    cos_r, sin_r = math.cos(rot), math.sin(rot)
    out = []
    for ex, ny in corners:
        rx = ex * cos_r - ny * sin_r
        ry = ex * sin_r + ny * cos_r
        out.append(geo.from_enu(rx, ry, lat, lon))
    return out


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_launch_sites(data_dir: Path = DATA_DIR) -> list[LaunchSite]:
    raw = load_json(data_dir / "launch_sites.json")
    return [
        LaunchSite(
            id=s["id"],
            name=s["name"],
            lat=float(s["lat"]),
            lon=float(s["lon"]),
            base_elev_m=float(s.get("base_elev_m", 0.0)),
            kind=s.get("kind", "barge"),
            note=s.get("note", ""),
        )
        for s in raw["sites"]
    ]


def load_obstacles(data_dir: Path = DATA_DIR) -> list[Obstacle]:
    raw = load_json(data_dir / "obstacles.json")
    out: list[Obstacle] = []
    for b in raw.get("buildings", []):
        outline = _outline_of(b)
        top = b.get("top_elev_m")
        if top is None:
            top = float(b.get("ground_elev_m", 0.0)) + float(b.get("height_m", 0.0))
        out.append(
            Obstacle(
                id=b["id"],
                name=b.get("name", b["id"]),
                outline=outline,
                top_elev_m=float(top),
                kind="building",
                source=b.get("source", raw.get("meta", {}).get("confidence", "seed")),
            )
        )
    for r in raw.get("ridges", []):
        out.append(
            Obstacle(
                id=r["id"],
                name=r.get("name", r["id"]),
                outline=[(float(p[0]), float(p[1])) for p in r["polyline"]],
                top_elev_m=float(r["top_elev_m"]),
                kind="ridge",
                source=r.get("source", raw.get("meta", {}).get("confidence", "seed")),
            )
        )
    return out


def _outline_of(entry: dict[str, Any]) -> list[tuple[float, float]]:
    if "outline" in entry:
        return [(float(p[0]), float(p[1])) for p in entry["outline"]]
    rect = entry["rect"]
    return rect_outline(
        float(rect["lat"]),
        float(rect["lon"]),
        float(rect["width_m"]),
        float(rect["depth_m"]),
        float(rect.get("rotation_deg", 0.0)),
    )


def load_spots(data_dir: Path = DATA_DIR) -> list[Viewpoint]:
    raw = load_json(data_dir / "spots.json")
    return [
        Viewpoint(
            id=s["id"],
            name=s["name"],
            lat=float(s["lat"]),
            lon=float(s["lon"]),
            ground_elev_m=float(s.get("ground_elev_m", 0.0)),
            eye_height_m=float(s.get("eye_height_m", 1.6)),
            crowd=float(s.get("crowd", 0.5)),
            access=float(s.get("access", 0.5)),
            famous=bool(s.get("famous", False)),
            tags=tuple(s.get("tags", ())),
            note=s.get("note", ""),
        )
        for s in raw["spots"]
    ]


def load_show(data_dir: Path = DATA_DIR, filename: str = "show_2026.json") -> Show:
    raw = load_json(data_dir / filename)
    effects = tuple(
        Effect(
            id=e["id"],
            name=e["name"],
            site_id=e["site_id"],
            start_min=int(e["start_min"]),
            end_min=int(e["end_min"]),
            alt_min_m=float(e["alt_min_m"]),
            alt_max_m=float(e["alt_max_m"]),
            weight=float(e.get("weight", 1.0)),
            spread_m=float(e.get("spread_m", 150.0)),
        )
        for e in raw["effects"]
    )
    return Show(
        id=raw["id"],
        name=raw["name"],
        date=raw.get("date", ""),
        start_time=raw.get("start_time", "19:20"),
        effects=effects,
    )


def build_field(obstacles: Iterable[Obstacle], sites: Sequence[LaunchSite]) -> ObstacleField:
    """발사 지점 중심을 기준점으로 잡은 장애물 색인."""
    if sites:
        ref = (
            sum(s.lat for s in sites) / len(sites),
            sum(s.lon for s in sites) / len(sites),
        )
    else:
        ref = None
    return ObstacleField(obstacles, ref=ref)


def load_all(data_dir: Path = DATA_DIR, show_file: str = "show_2026.json"):
    """(sites, obstacles, spots, show, field) 한 번에."""
    sites = load_launch_sites(data_dir)
    obstacles = load_obstacles(data_dir)
    spots = load_spots(data_dir)
    show = load_show(data_dir, show_file)
    return sites, obstacles, spots, show, build_field(obstacles, sites)
