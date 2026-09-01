import pytest

from bulkkot.model import LaunchSite, Viewpoint
from bulkkot.terrain import AsciiGridTerrain, FlatTerrain, RidgeTerrain
from bulkkot.visibility import ObstacleField, sight, terrain_requirement

SITE = LaunchSite(id="s", name="바지선", lat=37.5210, lon=126.9470, base_elev_m=3.0)
EMPTY = ObstacleField([], ref=(SITE.lat, SITE.lon))


def _viewer(lat=37.5300, lon=126.9470, ground=10.0):
    return Viewpoint(id="v", name="v", lat=lat, lon=lon, ground_elev_m=ground)


class Bump:
    """관람자와 발사 지점 사이 특정 지점만 높은 가짜 지형."""

    def __init__(self, lat, lon, height, radius_deg=0.0009, base=5.0):
        self.lat, self.lon, self.height = lat, lon, height
        self.radius, self.base = radius_deg, base

    def elevation(self, lat, lon):
        if abs(lat - self.lat) < self.radius and abs(lon - self.lon) < self.radius:
            return self.height
        return self.base


def test_flat_low_terrain_does_not_block():
    assert terrain_requirement(_viewer(), SITE, FlatTerrain(5.0)) is None


def test_hill_between_viewer_and_launch_blocks():
    mid_lat = (_viewer().lat + SITE.lat) / 2
    blocker = terrain_requirement(_viewer(), SITE, Bump(mid_lat, 126.9470, 90.0))
    assert blocker is not None
    assert blocker.obstacle_id == "terrain"
    assert blocker.top_elev_m == 90.0


def test_terrain_raises_the_minimum_visible_altitude():
    viewer = _viewer()
    mid_lat = (viewer.lat + SITE.lat) / 2
    flat = sight(viewer, SITE, EMPTY, terrain=FlatTerrain(5.0))
    hilly = sight(viewer, SITE, EMPTY, terrain=Bump(mid_lat, 126.9470, 90.0))
    assert flat.min_visible_alt_m == 0.0
    assert hilly.min_visible_alt_m > 100.0
    assert hilly.limiting is not None and hilly.limiting.obstacle_name == "지형"


def test_ground_underfoot_is_skipped():
    """자기가 딛고 선 지면이 시선을 막는 것으로 계산되면 안 된다."""
    viewer = _viewer(ground=80.0)
    underfoot = Bump(viewer.lat, viewer.lon, 80.0, radius_deg=0.0002)
    assert terrain_requirement(viewer, SITE, underfoot) is None


def test_terrain_and_buildings_take_the_stricter_one():
    from bulkkot import datasets
    from bulkkot.model import Obstacle

    viewer = _viewer()
    mid_lat = (viewer.lat + SITE.lat) / 2
    field = ObstacleField(
        [
            Obstacle(
                id="w", name="벽",
                outline=datasets.rect_outline(mid_lat, 126.9470, 300.0, 4.0),
                top_elev_m=40.0,
            )
        ],
        ref=(SITE.lat, SITE.lon),
    )
    st = sight(viewer, SITE, field, terrain=Bump(mid_lat, 126.9470, 90.0))
    assert st.limiting.obstacle_name == "지형"  # 90m 지형이 40m 벽보다 세다


ASC = """ncols 3
nrows 3
xllcorner 126.9000
yllcorner 37.5000
cellsize 0.0010
NODATA_value -9999
10 20 30
40 50 60
70 80 90
"""


def test_ascii_grid_reads_and_interpolates(tmp_path):
    path = tmp_path / "d.asc"
    path.write_text(ASC, encoding="utf-8")
    dem = AsciiGridTerrain.from_file(path)
    assert dem.ncols == 3 and dem.nrows == 3
    # 격자 가장 북서쪽 셀 = 첫 줄 첫 값
    assert dem.elevation(37.5030, 126.9000) == pytest.approx(10.0, abs=1e-6)
    # 셀 사이는 겹선형 보간
    mid = dem.elevation(37.5025, 126.9005)
    assert 10.0 < mid < 50.0


def test_ascii_grid_rejects_projected_coordinates(tmp_path):
    path = tmp_path / "p.asc"
    path.write_text(
        ASC.replace("xllcorner 126.9000", "xllcorner 195000.0")
        .replace("yllcorner 37.5000", "yllcorner 545000.0")
        .replace("cellsize 0.0010", "cellsize 5.0"),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="경위도 격자가 아닌"):
        AsciiGridTerrain.from_file(path)


def test_ascii_grid_summary_reports_extent_and_range(tmp_path):
    path = tmp_path / "d.asc"
    path.write_text(ASC, encoding="utf-8")
    info = AsciiGridTerrain.from_file(path).summary()
    assert info["표고 최소"] == 10.0
    assert info["표고 최대"] == 90.0
    assert info["결측 셀"] == 0
    assert "37.50000" in str(info["위도 범위"])


def test_outside_the_grid_falls_back():
    dem = AsciiGridTerrain([[1.0, 2.0], [3.0, 4.0]], 126.9, 37.5, 0.001, fallback=7.0)
    assert dem.elevation(38.0, 127.5) == 7.0


def test_ridge_terrain_peaks_near_the_crest():
    from bulkkot.model import Obstacle

    ridge = Obstacle(
        id="r", name="능선",
        outline=[(37.5130, 126.9400), (37.5125, 126.9470)],
        top_elev_m=100.0, kind="ridge",
    )
    terrain = RidgeTerrain([ridge], base_elev_m=10.0)
    assert terrain.elevation(37.5130, 126.9400) == pytest.approx(100.0, abs=1e-6)
    assert terrain.elevation(37.5400, 126.9400) == pytest.approx(10.0, abs=1e-6)
