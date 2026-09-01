#!/usr/bin/env python3
"""연습용 가짜 수치표고모델을 만든다.

실제 DEM을 받기 전에 --dem 경로가 제대로 도는지 확인하려고 쓴다.
능선 데이터의 마루 표고를 가우시안 언덕으로 부풀린 것이라, 지형의 '모양'은
그럴듯해도 실제 표고가 아니다. 진짜 판단에는 국토지리정보원 DEM을 쓸 것.

    python tools/make_synthetic_dem.py seoul-fake.asc
    python -m bulkkot dem seoul-fake.asc
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bulkkot import datasets, geo  # noqa: E402

BBOX = (37.4923, 126.8773, 37.5745, 127.0382)  # bulkkot.cli.NEEDED_BBOX
CELL_DEG = 0.00018  # 남북 약 20m
BASE_ELEV = 12.0
RIVER_ELEV = 3.0
HILL_SIGMA_M = 420.0
RIVER_HALF_WIDTH_M = 500.0


def main(out_path: str) -> None:
    obstacles = datasets.load_obstacles()
    hills = [
        (lat, lon, obs.top_elev_m)
        for obs in obstacles
        if obs.is_ridge
        for lat, lon in obs.outline
    ]
    river = datasets.load_json(datasets.DATA_DIR / "hangang.json")["centerline"]

    min_lat, min_lon, max_lat, max_lon = BBOX
    nrows = int((max_lat - min_lat) / CELL_DEG)
    ncols = int((max_lon - min_lon) / CELL_DEG)
    print(f"{ncols} × {nrows} = {ncols*nrows:,} 칸", file=sys.stderr)

    lines = [
        f"ncols {ncols}",
        f"nrows {nrows}",
        f"xllcorner {min_lon}",
        f"yllcorner {min_lat}",
        f"cellsize {CELL_DEG}",
        "NODATA_value -9999",
    ]

    for r in range(nrows):
        lat = min_lat + (nrows - 1 - r) * CELL_DEG  # ASCII 격자는 북쪽부터
        row = []
        for c in range(ncols):
            lon = min_lon + c * CELL_DEG
            elev = BASE_ELEV
            for hlat, hlon, htop in hills:
                d = geo.distance_m((lat, lon), (hlat, hlon))
                if d < HILL_SIGMA_M * 2.5:
                    elev = max(elev, BASE_ELEV + (htop - BASE_ELEV) * math.exp(-(d * d) / (2 * HILL_SIGMA_M**2)))
            for i in range(len(river) - 1):
                if _near_segment((lat, lon), river[i], river[i + 1], RIVER_HALF_WIDTH_M):
                    elev = RIVER_ELEV
                    break
            row.append(f"{elev:.1f}")
        lines.append(" ".join(row))
        if r % 50 == 0:
            print(f"  {r}/{nrows}", file=sys.stderr)

    Path(out_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{out_path} 를 썼습니다", file=sys.stderr)


def _near_segment(p, a, b, half_width_m: float) -> bool:
    ax, ay = geo.enu(a[0], a[1], p[0], p[1])
    bx, by = geo.enu(b[0], b[1], p[0], p[1])
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 == 0.0:
        return math.hypot(ax, ay) < half_width_m
    t = max(0.0, min(1.0, -(ax * dx + ay * dy) / L2))
    return math.hypot(ax + dx * t, ay + dy * t) < half_width_m


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "seoul-fake.asc")
