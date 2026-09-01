"""받은 건물 데이터를 이 도구가 읽는 형식으로 옮기고, 쓸 만한지 진단한다.

이 단계에서 사람이 진짜 알고 싶은 것은 "변환이 됐나"가 아니라
**"높이가 제대로 들어왔나"** 다. 국토부 건물통합정보든 OSM이든, 높이 속성이
비어 있으면 조용히 층수나 기본값으로 떨어지고 결과는 그럴듯하게 틀린다.
그래서 변환보다 진단에 더 많은 줄을 쓴다.
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

from . import datasets, geo
from .model import Obstacle
from .providers.local_geojson import (  # noqa: F401
    HEIGHT_KEYS,
    LEVEL_KEYS,
    METERS_PER_LEVEL,
    NAME_KEYS,
    _first_number,
    _rings,
    iter_features,
)

# 이 파일들은 씨드에서 그대로 가져다 쓰면 된다. 고치는 건 나중 일이다.
CARRY_OVER = ("launch_sites.json", "spots.json", "show_2026.json", "hangang.json", "landmarks.json")


@dataclass
class IngestReport:
    read: int = 0
    kept: int = 0
    no_geometry: int = 0
    outside_bbox: int = 0
    from_height: int = 0
    from_levels: int = 0
    from_default: int = 0
    height_key: str | None = None
    level_key: str | None = None
    heights: list[float] = field(default_factory=list)
    tallest: list[tuple[str, float]] = field(default_factory=list)
    keys_seen: dict[str, int] = field(default_factory=dict)
    bbox: tuple[float, float, float, float] | None = None

    def percentile(self, q: float) -> float:
        if not self.heights:
            return 0.0
        ordered = sorted(self.heights)
        return ordered[min(len(ordered) - 1, int(len(ordered) * q))]

    def warnings(self, needed_bbox: Sequence[float] | None = None) -> list[str]:
        out: list[str] = []
        if not self.kept:
            out.append("남은 건물이 하나도 없습니다. bbox가 맞는지, 좌표계가 WGS84인지 확인하세요.")
            return out
        share = self.from_default / self.kept
        if share > 0.5:
            out.append(
                f"건물의 {share*100:.0f}% 가 높이도 층수도 없어 기본값으로 채워졌습니다. "
                "높이 속성이 있는 데이터인지 다시 보세요 — 이 상태로는 결과를 믿을 수 없습니다."
            )
        elif share > 0.15:
            out.append(f"건물의 {share*100:.0f}% 가 기본값입니다. 대체로 쓸 만하지만 낮은 건물 위주로 오차가 납니다.")
        top = max(self.heights)
        if top < 150:
            out.append(
                f"가장 높은 건물이 {top:.0f}m 입니다. 여의도가 범위에 들었다면 파크원(≈318m)·"
                "IFC(≈279m)·63스퀘어(≈249m)가 나와야 합니다. 범위나 높이 속성을 확인하세요."
            )
        if self.height_key is None and self.level_key is not None:
            out.append(
                f"높이(m) 필드는 없고 층수({self.level_key})만 있어 층당 {METERS_PER_LEVEL}m 로 환산했습니다. "
                "초고층에서 수십 m씩 어긋납니다."
            )
        if needed_bbox and self.bbox:
            n, b = needed_bbox, self.bbox
            if b[0] > n[0] + 0.002 or b[1] > n[1] + 0.002 or b[2] < n[2] - 0.002 or b[3] < n[3] - 0.002:
                out.append(
                    f"데이터 범위({b[0]:.4f},{b[1]:.4f} ~ {b[2]:.4f},{b[3]:.4f})가 "
                    f"필요한 범위를 다 덮지 못합니다. 덮이지 않는 방향의 시선은 '데이터 밖'으로 표시됩니다."
                )
        return out


def ingest(
    paths: Iterable[str | Path],
    bbox: Sequence[float] | None = None,
    default_height_m: float = 12.0,
    ground_elev_m: float = 0.0,
    source: str = "국토교통부 GIS건물통합정보",
) -> tuple[list[Obstacle], IngestReport]:
    """GeoJSON(또는 줄 단위 GeoJSON) 파일들을 Obstacle 목록으로 옮기며 진단한다."""
    report = IngestReport()
    obstacles: list[Obstacle] = []
    lat_lo = lon_lo = float("inf")
    lat_hi = lon_hi = float("-inf")

    for path in paths:
        for feat in iter_features(path):
            report.read += 1
            props = feat.get("properties") or {}
            for key in props:
                report.keys_seen[key] = report.keys_seen.get(key, 0) + 1

            rings = _rings(feat.get("geometry") or {})
            if not rings:
                report.no_geometry += 1
                continue

            centroid_lat = sum(p[0] for p in rings[0]) / len(rings[0])
            centroid_lon = sum(p[1] for p in rings[0]) / len(rings[0])
            if bbox and not (
                bbox[0] <= centroid_lat <= bbox[2] and bbox[1] <= centroid_lon <= bbox[3]
            ):
                report.outside_bbox += 1
                continue

            height, origin, key = _height_of(props, default_height_m)
            if origin == "height":
                report.from_height += 1
                report.height_key = report.height_key or key
            elif origin == "levels":
                report.from_levels += 1
                report.level_key = report.level_key or key
            else:
                report.from_default += 1

            base = _first_number(props, ("ground_elev_m", "base_elev_m"))
            base = ground_elev_m if base is None else base
            name = next((str(props[k]) for k in NAME_KEYS if props.get(k)), "")
            name = name or f"건물 {report.kept}"

            for j, ring in enumerate(rings):
                if len(ring) < 3:
                    continue
                obstacles.append(
                    Obstacle(
                        id=f"b{report.kept}_{j}",
                        name=name,
                        outline=ring,
                        top_elev_m=base + height,
                        kind="building",
                        source=source,
                    )
                )
                for lat, lon in ring:
                    lat_lo, lat_hi = min(lat_lo, lat), max(lat_hi, lat)
                    lon_lo, lon_hi = min(lon_lo, lon), max(lon_hi, lon)

            report.kept += 1
            report.heights.append(height)
            report.tallest.append((name, base + height))

    report.tallest = sorted(report.tallest, key=lambda t: t[1], reverse=True)[:10]
    if report.kept:
        report.bbox = (lat_lo, lon_lo, lat_hi, lon_hi)
    return obstacles, report


def _height_of(props: dict[str, Any], default_height_m: float):
    for key in HEIGHT_KEYS:
        value = _first_number(props, (key,))
        if value is not None and value > 0:
            return value, "height", key
    for key in LEVEL_KEYS:
        value = _first_number(props, (key,))
        if value is not None and value > 0:
            return value * METERS_PER_LEVEL, "levels", key
    return default_height_m, "default", None


def write_dataset(
    obstacles: Sequence[Obstacle],
    out_dir: str | Path,
    note: str,
    keep_ridges: bool = True,
) -> Path:
    """obstacles.json 을 쓰고, 나머지 파일은 씨드에서 복사해 채운다.

    능선은 기본적으로 씨드 것을 이어받는다. 실측 DEM(--dem)을 쓸 때만
    빼는 게 맞다 — 그때만 지형이 시선 차폐로 계산되어 중복이 되기 때문이다.
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    ridges: list[dict[str, Any]] = []
    if keep_ridges:
        seed = datasets.load_json(datasets.DATA_DIR / "obstacles.json")
        ridges = seed.get("ridges", [])

    payload = {
        "meta": {
            "name": "건물 데이터",
            "confidence": "sourced",
            "note": note,
            "ridges_note": (
                "능선은 씨드에서 이어받은 임시 값이다. --dem 으로 실측 지형을 넣으면 지워라."
                if ridges
                else "능선 없음 — 지형은 --dem 으로 넣을 것."
            ),
        },
        "buildings": [
            {
                "id": o.id,
                "name": o.name,
                "outline": [[round(lat, 6), round(lon, 6)] for lat, lon in o.outline],
                "top_elev_m": round(o.top_elev_m, 1),
                "source": o.source,
            }
            for o in obstacles
        ],
        "ridges": ridges,
    }
    (out / "obstacles.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )

    for name in CARRY_OVER:
        target = out / name
        if not target.exists():
            shutil.copy(datasets.DATA_DIR / name, target)
    return out / "obstacles.json"
