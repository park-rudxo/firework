"""지반고 모델.

격자 탐색으로 '아무도 모르는 자리'를 찾으려면, 후보 격자점의 지반고를 알아야
한다. 씨드 데이터에는 DEM이 없으므로 기본값은 평지이고, 국토지리정보원
수치표고모델을 ESRI ASCII 격자(.asc)로 변환해 넣으면 그대로 쓰인다.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Protocol


class Terrain(Protocol):
    def elevation(self, lat: float, lon: float) -> float: ...


class FlatTerrain:
    """모든 곳이 같은 표고. DEM이 없을 때의 정직한 기본값."""

    def __init__(self, elev_m: float = 10.0) -> None:
        self.elev_m = elev_m

    def elevation(self, lat: float, lon: float) -> float:
        return self.elev_m


class RidgeTerrain:
    """능선 데이터만 있을 때의 절충안.

    가까운 능선 정점의 표고를 거리 감쇠로 섞는다. DEM 대체물이 아니라,
    '고지대 근처는 높다'는 정도만 반영하는 거친 근사다.
    """

    def __init__(self, ridges, base_elev_m: float = 12.0, falloff_m: float = 400.0) -> None:
        self.points: list[tuple[float, float, float]] = [
            (lat, lon, obs.top_elev_m) for obs in ridges for lat, lon in obs.outline
        ]
        self.base = base_elev_m
        self.falloff = falloff_m

    def elevation(self, lat: float, lon: float) -> float:
        from . import geo

        best = self.base
        for plat, plon, elev in self.points:
            d = geo.distance_m((lat, lon), (plat, plon))
            if d >= self.falloff:
                continue
            blended = self.base + (elev - self.base) * (1.0 - d / self.falloff) ** 2
            best = max(best, blended)
        return best


class AsciiGridTerrain:
    """ESRI ASCII 격자(.asc) DEM. WGS84 경위도 격자를 가정한다.

    국토지리정보원 수치표고모델이나 SRTM을 gdal_translate -of AAIGrid 로
    변환해 넣으면 된다. 의존성 없이 표준 라이브러리만 쓴다.
    """

    def __init__(
        self,
        values: list[list[float]],
        xll: float,
        yll: float,
        cellsize: float,
        nodata: float = -9999.0,
        fallback: float = 0.0,
    ) -> None:
        self.values = values
        self.nrows = len(values)
        self.ncols = len(values[0]) if values else 0
        self.xll = xll
        self.yll = yll
        self.cellsize = cellsize
        self.nodata = nodata
        self.fallback = fallback

    @classmethod
    def from_file(cls, path: str | Path, fallback: float = 0.0) -> "AsciiGridTerrain":
        header: dict[str, float] = {}
        rows: list[list[float]] = []
        with Path(path).open(encoding="utf-8") as fh:
            for line in fh:
                parts = line.split()
                if not parts:
                    continue
                key = parts[0].lower()
                if key in {
                    "ncols", "nrows", "xllcorner", "yllcorner",
                    "xllcenter", "yllcenter", "cellsize", "nodata_value",
                } and len(parts) == 2:
                    header[key] = float(parts[1])
                else:
                    rows.append([float(v) for v in parts])
        xll = header.get("xllcorner", header.get("xllcenter", 0.0))
        yll = header.get("yllcorner", header.get("yllcenter", 0.0))
        return cls(
            rows,
            xll,
            yll,
            header.get("cellsize", 1.0),
            header.get("nodata_value", -9999.0),
            fallback,
        )

    def elevation(self, lat: float, lon: float) -> float:
        if self.ncols == 0:
            return self.fallback
        col = (lon - self.xll) / self.cellsize
        row = (self.yll + self.nrows * self.cellsize - lat) / self.cellsize
        if not (0 <= col < self.ncols - 1 and 0 <= row < self.nrows - 1):
            return self.fallback
        c0, r0 = int(math.floor(col)), int(math.floor(row))
        fc, fr = col - c0, row - r0
        corners = [
            self.values[r0][c0], self.values[r0][c0 + 1],
            self.values[r0 + 1][c0], self.values[r0 + 1][c0 + 1],
        ]
        if any(abs(v - self.nodata) < 1e-6 for v in corners):
            return self.fallback
        top = corners[0] * (1 - fc) + corners[1] * fc
        bottom = corners[2] * (1 - fc) + corners[3] * fc
        return top * (1 - fr) + bottom * fr
