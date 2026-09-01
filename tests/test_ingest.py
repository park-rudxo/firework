import json

import pytest

from bulkkot import datasets, ingest


def _feature(lat, lon, props, size=0.0003):
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [lon - size, lat - size], [lon + size, lat - size],
                [lon + size, lat + size], [lon - size, lat + size],
                [lon - size, lat - size],
            ]],
        },
    }


def _write_seq(path, features):
    path.write_text(
        "\n".join(json.dumps(f, ensure_ascii=False) for f in features), encoding="utf-8"
    )
    return path


BBOX = (37.4923, 126.8773, 37.5745, 127.0382)


def test_height_field_wins_over_levels(tmp_path):
    src = _write_seq(tmp_path / "a.geojsonl", [
        _feature(37.5259, 126.9270, {"HEIGHT": 318, "GRND_FLR": 69, "BLD_NM": "파크원"}),
    ])
    obstacles, rep = ingest.ingest([src], bbox=BBOX)
    assert rep.from_height == 1 and rep.from_levels == 0
    assert rep.height_key == "HEIGHT"
    assert obstacles[0].top_elev_m == 318.0


def test_levels_are_converted_when_height_is_missing(tmp_path):
    src = _write_seq(tmp_path / "a.geojsonl", [
        _feature(37.5259, 126.9270, {"GRND_FLR": 20, "BLD_NM": "아파트"}),
    ])
    obstacles, rep = ingest.ingest([src], bbox=BBOX)
    assert rep.from_levels == 1 and rep.level_key == "GRND_FLR"
    assert obstacles[0].top_elev_m == pytest.approx(20 * ingest.METERS_PER_LEVEL)


def test_zero_height_falls_through_to_levels(tmp_path):
    """높이 필드가 0으로 채워진 데이터가 흔하다. 0을 실측으로 믿으면 안 된다."""
    src = _write_seq(tmp_path / "a.geojsonl", [
        _feature(37.5259, 126.9270, {"HEIGHT": 0, "GRND_FLR": 10, "BLD_NM": "x"}),
    ])
    _, rep = ingest.ingest([src], bbox=BBOX)
    assert rep.from_height == 0 and rep.from_levels == 1


def test_bbox_filters_out_distant_buildings(tmp_path):
    src = _write_seq(tmp_path / "a.geojsonl", [
        _feature(37.5259, 126.9270, {"HEIGHT": 30}),
        _feature(35.1000, 129.0000, {"HEIGHT": 30}),  # 부산
    ])
    obstacles, rep = ingest.ingest([src], bbox=BBOX)
    assert rep.kept == 1 and rep.outside_bbox == 1
    assert len(obstacles) == 1


def test_warns_when_most_buildings_have_no_height(tmp_path):
    src = _write_seq(tmp_path / "a.geojsonl", [
        _feature(37.52 + i * 0.001, 126.93, {"BLD_NM": f"b{i}"}) for i in range(10)
    ])
    _, rep = ingest.ingest([src], bbox=BBOX)
    assert rep.from_default == 10
    joined = " ".join(rep.warnings())
    assert "기본값으로 채워졌습니다" in joined
    assert "가장 높은 건물" in joined  # 최대 높이가 낮다는 경고도 함께


def test_written_dataset_loads_back(tmp_path):
    src = _write_seq(tmp_path / "a.geojsonl", [
        _feature(37.5259, 126.9270, {"HEIGHT": 318, "BLD_NM": "파크원"}),
    ])
    obstacles, _ = ingest.ingest([src], bbox=BBOX)
    out = tmp_path / "mydata"
    ingest.write_dataset(obstacles, out, note="테스트")

    for name in ingest.CARRY_OVER:
        assert (out / name).exists()
    loaded = datasets.load_obstacles(out)
    names = {o.name for o in loaded}
    assert "파크원" in names
    # 능선은 씨드에서 이어받는다
    assert any(o.is_ridge for o in loaded)

    sites, obs, spots, show, field = datasets.load_all(out)
    assert obs and spots and sites


def test_no_ridges_drops_the_seed_ridges(tmp_path):
    src = _write_seq(tmp_path / "a.geojsonl", [_feature(37.5259, 126.9270, {"HEIGHT": 100})])
    obstacles, _ = ingest.ingest([src], bbox=BBOX)
    out = tmp_path / "mydata"
    ingest.write_dataset(obstacles, out, note="t", keep_ridges=False)
    assert not any(o.is_ridge for o in datasets.load_obstacles(out))


def test_plain_geojson_also_works(tmp_path):
    path = tmp_path / "a.geojson"
    path.write_text(json.dumps({
        "type": "FeatureCollection",
        "features": [_feature(37.5259, 126.9270, {"HEIGHT": 55, "BLD_NM": "평범"})],
    }, ensure_ascii=False), encoding="utf-8")
    obstacles, rep = ingest.ingest([path], bbox=BBOX)
    assert rep.kept == 1 and obstacles[0].name == "평범"
