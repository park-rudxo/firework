import json

from bulkkot import datasets, report, scoring


def test_payload_and_html_are_self_contained(tmp_path):
    sites, obstacles, spots, show, field = datasets.load_all()
    scores = scoring.rank(spots, sites, show, field)[:5]
    payload = report.build_payload(scores, sites, obstacles, show, field, data_note="테스트")
    assert payload["spots"] and payload["spots"][0]["profile"]["points"]
    json.dumps(payload)  # 직렬화 가능해야 한다

    out = report.write(tmp_path / "r.html", payload)
    html = out.read_text(encoding="utf-8")
    assert "<title>한강 불꽃 관측도</title>" in html
    assert "/*__PAYLOAD__*/null" not in html
    # 폰트를 제외하면 외부 자원을 부르지 않는다
    for marker in ("cdnjs", "unpkg", "tile.openstreetmap", "<script src"):
        assert marker not in html


def test_provider_roundtrip_produces_loadable_obstacles(tmp_path):
    from bulkkot.providers.overpass import parse_overpass, to_obstacles_json

    payload = {
        "elements": [
            {
                "type": "way", "id": 7,
                "tags": {"building": "yes", "height": "120", "name": "타워"},
                "geometry": [
                    {"lat": 37.520, "lon": 126.940}, {"lat": 37.521, "lon": 126.940},
                    {"lat": 37.521, "lon": 126.941}, {"lat": 37.520, "lon": 126.941},
                ],
            }
        ]
    }
    obstacles = parse_overpass(payload)
    assert obstacles[0].top_elev_m == 120.0

    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "obstacles.json").write_text(
        json.dumps(to_obstacles_json(obstacles), ensure_ascii=False), encoding="utf-8"
    )
    for name in ("launch_sites.json", "spots.json", "show_2026.json", "hangang.json"):
        (data_dir / name).write_text(
            (datasets.DATA_DIR / name).read_text(encoding="utf-8"), encoding="utf-8"
        )
    loaded = datasets.load_obstacles(data_dir)
    assert loaded[0].name == "타워"
