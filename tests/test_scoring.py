import pytest

from bulkkot import datasets, scan, scoring
from bulkkot.model import Effect, LaunchSite, Show, Viewpoint
from bulkkot.visibility import ObstacleField

SITE = LaunchSite(id="s", name="바지선", lat=37.5210, lon=126.9470, base_elev_m=3.0)


def _show(*bands):
    return Show(
        id="t",
        name="테스트",
        date="2026-10-03",
        start_time="19:20",
        effects=tuple(
            Effect(
                id=f"e{i}", name=f"연출{i}", site_id="s",
                start_min=i * 10, end_min=i * 10 + 10,
                alt_min_m=lo, alt_max_m=hi,
            )
            for i, (lo, hi) in enumerate(bands)
        ),
    )


def test_effect_visible_fraction_is_the_share_of_the_band_above_the_cutoff():
    e = Effect(id="e", name="n", site_id="s", start_min=0, end_min=1, alt_min_m=100, alt_max_m=300)
    assert e.visible_fraction(0) == 1.0
    assert e.visible_fraction(100) == 1.0
    assert e.visible_fraction(200) == pytest.approx(0.5)
    assert e.visible_fraction(300) == 0.0
    assert e.visible_fraction(400) == 0.0


def test_trapezoid_edges():
    assert scoring.trapezoid(0, 1, 5, 10, 20) == 0.0
    assert scoring.trapezoid(7, 1, 5, 10, 20) == 1.0
    assert scoring.trapezoid(3, 1, 5, 10, 20) == pytest.approx(0.5)
    assert scoring.trapezoid(25, 1, 5, 10, 20) == 0.0


def test_blocked_low_effects_drop_out_of_the_timeline():
    viewer = Viewpoint(id="v", name="v", lat=37.5300, lon=126.9470, ground_elev_m=10.0)
    mid_lat = (viewer.lat + SITE.lat) / 2
    wall = datasets.rect_outline(mid_lat, 126.9470, 300.0, 4.0)
    from bulkkot.model import Obstacle

    field = ObstacleField(
        [Obstacle(id="w", name="벽", outline=wall, top_elev_m=80.0)], ref=(SITE.lat, SITE.lon)
    )
    show = _show((0, 40), (300, 400))
    score = scoring.evaluate(viewer, [SITE], show, field)
    low, high = score.timeline
    assert low.fraction == 0.0
    assert high.fraction == 1.0
    assert 0.0 < score.parts["sky"] < 1.0


def test_calm_and_access_come_straight_from_the_viewpoint():
    field = ObstacleField([], ref=(SITE.lat, SITE.lon))
    viewer = Viewpoint(
        id="v", name="v", lat=37.5300, lon=126.9470, ground_elev_m=10.0, crowd=0.8, access=0.3
    )
    score = scoring.evaluate(viewer, [SITE], _show((100, 300)), field)
    assert score.parts["calm"] == pytest.approx(0.2)
    assert score.parts["access"] == pytest.approx(0.3)


def test_rank_is_sorted_by_total():
    field = ObstacleField([], ref=(SITE.lat, SITE.lon))
    spots = [
        Viewpoint(id="a", name="a", lat=37.5300, lon=126.9470, ground_elev_m=10.0, crowd=0.9),
        Viewpoint(id="b", name="b", lat=37.5300, lon=126.9470, ground_elev_m=10.0, crowd=0.1),
    ]
    ranked = scoring.rank(spots, [SITE], _show((100, 300)), field)
    assert [r.viewpoint.id for r in ranked] == ["b", "a"]


def test_seed_dataset_loads_and_ranks():
    sites, obstacles, spots, show, field = datasets.load_all()
    assert sites and obstacles and spots and show.effects
    ranked = scoring.rank(spots, sites, show, field)
    assert len(ranked) == len(spots)
    assert all(0.0 <= r.total <= 1.0 for r in ranked)
    assert ranked == sorted(ranked, key=lambda r: r.total, reverse=True)


def test_scan_thins_out_neighbours_and_drops_known_spots():
    sites, obstacles, spots, show, field = datasets.load_all()
    results = scan.scan((37.515, 126.930, 37.535, 126.960), 400.0, sites, show, field)
    assert results
    thinned = scan.thin_out(results, 600.0)
    assert len(thinned) < len(results)
    from bulkkot import geo

    for i, a in enumerate(thinned):
        for b in thinned[i + 1:]:
            assert geo.distance_m(a.viewpoint.latlon, b.viewpoint.latlon) >= 600.0
    famous = [s for s in spots if s.famous]
    dropped = scan.drop_near(results, spots, 500.0)
    for r in dropped:
        assert all(geo.distance_m(r.viewpoint.latlon, f.latlon) >= 500.0 for f in famous)
