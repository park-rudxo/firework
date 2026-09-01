import pytest

from bulkkot import datasets, geo
from bulkkot.model import LaunchSite, Obstacle, Viewpoint
from bulkkot.visibility import ObstacleField, ground_horizon_requirement, sight

SITE = LaunchSite(id="s", name="바지선", lat=37.5210, lon=126.9470, base_elev_m=3.0)


def _viewer(lat, lon, ground=10.0, eye=1.6, vid="v"):
    return Viewpoint(id=vid, name=vid, lat=lat, lon=lon, ground_elev_m=ground, eye_height_m=eye)


def _wall(lat, lon, top, width=300.0, depth=60.0, oid="w"):
    return Obstacle(
        id=oid,
        name=oid,
        outline=datasets.rect_outline(lat, lon, width, depth),
        top_elev_m=top,
    )


def test_open_sightline_sees_everything():
    field = ObstacleField([], ref=(SITE.lat, SITE.lon))
    st = sight(_viewer(37.5300, 126.9470), SITE, field)
    assert st.min_visible_alt_m == 0.0
    assert st.limiting is None


def test_wall_sets_minimum_visible_altitude():
    # 관람자 1km 북쪽, 그 사이 정확히 절반 지점에 상단 80m 의 얇은 벽
    viewer = _viewer(37.5300, 126.9470)
    mid_lat = (viewer.lat + SITE.lat) / 2
    field = ObstacleField(
        [_wall(mid_lat, 126.9470, 80.0, depth=4.0)], ref=(SITE.lat, SITE.lon)
    )
    st = sight(viewer, SITE, field)
    assert st.limiting is not None
    # 시선 중간의 장애물은 '눈높이에서 장애물까지의 높이차'만큼을 한 번 더 요구한다
    expected_elev = viewer.eye_elev_m + (80.0 - viewer.eye_elev_m) * 2
    assert st.min_visible_alt_m + SITE.base_elev_m == pytest.approx(expected_elev, rel=0.02)


def test_taller_wall_hides_more():
    viewer = _viewer(37.5300, 126.9470)
    mid_lat = (viewer.lat + SITE.lat) / 2
    low = ObstacleField([_wall(mid_lat, 126.9470, 60.0)], ref=(SITE.lat, SITE.lon))
    high = ObstacleField([_wall(mid_lat, 126.9470, 120.0)], ref=(SITE.lat, SITE.lon))
    assert sight(viewer, SITE, high).min_visible_alt_m > sight(viewer, SITE, low).min_visible_alt_m


def test_nearer_wall_hides_more_than_far_wall_of_same_height():
    viewer = _viewer(37.5300, 126.9470)
    near_lat = viewer.lat - (viewer.lat - SITE.lat) * 0.15
    far_lat = viewer.lat - (viewer.lat - SITE.lat) * 0.85
    near = ObstacleField([_wall(near_lat, 126.9470, 70.0)], ref=(SITE.lat, SITE.lon))
    far = ObstacleField([_wall(far_lat, 126.9470, 70.0)], ref=(SITE.lat, SITE.lon))
    assert sight(viewer, SITE, near).min_visible_alt_m > sight(viewer, SITE, far).min_visible_alt_m


def test_wall_beside_the_sightline_does_not_block():
    viewer = _viewer(37.5300, 126.9470)
    aside = _wall(37.5255, 126.9600, 200.0)  # 시선에서 한참 동쪽
    field = ObstacleField([aside], ref=(SITE.lat, SITE.lon))
    assert sight(viewer, SITE, field).min_visible_alt_m == 0.0


def test_wall_lower_than_eye_never_blocks():
    viewer = _viewer(37.5300, 126.9470, ground=90.0)
    mid_lat = (viewer.lat + SITE.lat) / 2
    field = ObstacleField([_wall(mid_lat, 126.9470, 40.0)], ref=(SITE.lat, SITE.lon))
    assert sight(viewer, SITE, field).min_visible_alt_m == 0.0


def test_standing_on_a_ridge_is_not_blocked_by_it():
    viewer = _viewer(37.5150, 126.9470, ground=58.0)
    ridge = Obstacle(
        id="r",
        name="능선",
        outline=[(37.5152, 126.9400), (37.5150, 126.9470), (37.5148, 126.9540)],
        top_elev_m=60.0,
        kind="ridge",
    )
    field = ObstacleField([ridge], ref=(SITE.lat, SITE.lon))
    assert sight(viewer, SITE, field).min_visible_alt_m == 0.0


def test_horizon_requirement_grows_with_distance():
    near = ground_horizon_requirement(_viewer(37.5240, 126.9470, ground=0.0, eye=1.6), SITE, 0.0)
    far = ground_horizon_requirement(_viewer(37.7000, 126.9470, ground=0.0, eye=1.6), SITE, 0.0)
    assert far > near


def test_limiting_blocker_is_the_most_demanding_one():
    viewer = _viewer(37.5300, 126.9470)
    near_lat = viewer.lat - (viewer.lat - SITE.lat) * 0.2
    far_lat = viewer.lat - (viewer.lat - SITE.lat) * 0.8
    field = ObstacleField(
        [_wall(near_lat, 126.9470, 60.0, oid="near"), _wall(far_lat, 126.9470, 60.0, oid="far")],
        ref=(SITE.lat, SITE.lon),
    )
    st = sight(viewer, SITE, field)
    assert st.limiting.obstacle_id == "near"


def test_coverage_drops_outside_the_data_extent():
    field = ObstacleField([_wall(37.5250, 126.9470, 50.0)], ref=(SITE.lat, SITE.lon))
    inside = sight(_viewer(37.5252, 126.9470), SITE, field)
    outside = sight(_viewer(37.7000, 127.3000), SITE, field)
    assert inside.coverage > outside.coverage
    assert outside.data_thin
