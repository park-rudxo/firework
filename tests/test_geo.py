import math

import pytest

from bulkkot import geo


def test_enu_roundtrip():
    lat, lon = 37.5265, 126.9337
    e, n = geo.enu(lat, lon, 37.5210, 126.9470)
    back = geo.from_enu(e, n, 37.5210, 126.9470)
    assert back[0] == pytest.approx(lat, abs=1e-9)
    assert back[1] == pytest.approx(lon, abs=1e-9)


def test_distance_matches_haversine_closely():
    a, b = (37.5210, 126.9470), (37.5468, 127.0325)
    # 등거리원통도법 근사 vs 정확한 대권거리: 도시 규모에서 0.1% 이내여야 한다
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    exact = 2 * geo.EARTH_R * math.asin(math.sqrt(h))
    assert geo.distance_m(a, b) == pytest.approx(exact, rel=1e-3)


def test_bearing_cardinals():
    origin = (37.5200, 126.9400)
    assert geo.bearing_deg(origin, (37.5300, 126.9400)) == pytest.approx(0, abs=0.5)
    assert geo.bearing_deg(origin, (37.5200, 126.9500)) == pytest.approx(90, abs=0.5)
    assert geo.compass_16(180.0) == "남"


def test_curvature_drop_is_zero_at_ends_and_peaks_in_middle():
    assert geo.curvature_drop(0, 8000) == 0.0
    assert geo.curvature_drop(8000, 8000) == pytest.approx(0.0, abs=1e-9)
    mid = geo.curvature_drop(4000, 8000)
    assert 0.5 < mid < 2.0  # 8km 시선의 중앙에서 1m 남짓
    assert mid > geo.curvature_drop(1000, 8000)


def test_required_z_end_inverts_ray_elevation():
    total, s, z_start, top = 3000.0, 900.0, 50.0, 120.0
    needed = geo.required_z_end(s, total, z_start, top)
    assert geo.ray_elevation(s, total, z_start, needed) == pytest.approx(top, abs=1e-6)


def test_closer_obstacle_of_same_height_demands_more():
    total, z_start, top = 3000.0, 10.0, 80.0
    near = geo.required_z_end(300.0, total, z_start, top)
    far = geo.required_z_end(2000.0, total, z_start, top)
    assert near > far


def test_segment_intersections_finds_entry_and_exit():
    square = [(-50.0, -50.0), (50.0, -50.0), (50.0, 50.0), (-50.0, 50.0)]
    hits = geo.segment_intersections((-200.0, 0.0), (200.0, 0.0), square)
    assert len(hits) == 2
    assert hits[0] == pytest.approx(150.0)
    assert hits[1] == pytest.approx(250.0)


def test_point_in_polygon():
    square = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
    assert geo.point_in_polygon((5.0, 5.0), square)
    assert not geo.point_in_polygon((15.0, 5.0), square)


def test_angular_size_shrinks_with_distance():
    assert geo.angular_size_deg(200, 1000) > geo.angular_size_deg(200, 5000)
