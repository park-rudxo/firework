"""명령줄 인터페이스."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import datasets, report, scan as scan_mod, scoring
from .model import Viewpoint
from .terrain import AsciiGridTerrain, FlatTerrain, RidgeTerrain
from .visibility import sight_profile

SEOUL_BBOX = (37.4900, 126.8800, 37.5750, 127.0400)

# 내장 후보지의 시선이 실제로 지나는 범위 + 여유 500m.
# 건물·지형 데이터를 잘라 받을 때 이 범위를 기준으로 하면 된다.
NEEDED_BBOX = (37.4923, 126.8773, 37.5745, 127.0382)


def _load(args):
    data_dir = Path(args.data) if args.data else datasets.DATA_DIR
    return datasets.load_all(data_dir, args.show)


def _data_note(args) -> str:
    data_dir = Path(args.data) if args.data else datasets.DATA_DIR
    meta = datasets.load_json(data_dir / "obstacles.json").get("meta", {})
    if meta.get("confidence") in {"approx", "seed", None}:
        return (
            "내장 씨드 데이터로 계산한 결과입니다. 좌표·건물 높이·프로그램 고도가 모두 근사치라 "
            "순위는 방법을 보여주는 예시일 뿐입니다. 실제 판단에는 국토교통부 건물통합정보와 "
            "주최 측 배치도로 데이터를 교체하세요."
        )
    return meta.get("note", "")


def _terrain(args, obstacles):
    """격자점의 지반고를 정하는 모델. 실측이 아니어도 쓸모가 있다."""
    if args.dem:
        return AsciiGridTerrain.from_file(args.dem, fallback=args.base_elev)
    if args.ridge_terrain:
        return RidgeTerrain([o for o in obstacles if o.is_ridge], base_elev_m=args.base_elev)
    return FlatTerrain(args.base_elev)


def _occluder(args, obstacles):
    """시선을 가로막는 지형. 실측 DEM일 때만 쓴다.

    능선 근사를 여기에 넘기면 obstacles.json 의 능선과 이중으로 계산된다.
    """
    return AsciiGridTerrain.from_file(args.dem, fallback=args.base_elev) if args.dem else None


def _main_site_id(show) -> str:
    """연출 가중치가 가장 큰 발사 지점. 대표값을 하나만 보여줘야 할 때 쓴다."""
    weight: dict[str, float] = {}
    for e in show.effects:
        weight[e.site_id] = weight.get(e.site_id, 0.0) + e.weight
    return max(weight, key=weight.get) if weight else ""


def _bar(value: float, width: int = 12) -> str:
    filled = int(round(max(0.0, min(1.0, value)) * width))
    return "█" * filled + "·" * (width - filled)


def cmd_rank(args) -> int:
    sites, obstacles, spots, show, field = _load(args)
    terrain = _occluder(args, obstacles)
    weights = scoring.HIDDEN_WEIGHTS if args.hidden else scoring.DEFAULT_WEIGHTS
    if args.hidden:
        spots = [s for s in spots if not s.famous]
    results = scoring.rank(spots, sites, show, field, weights, terrain)[: args.top]

    if args.json:
        print(json.dumps([r.to_dict() for r in results], ensure_ascii=False, indent=2))
        return 0

    print(f"\n{show.name} — {show.date} {show.start_time} 시작, {show.duration_min}분")
    print(f"{'':2s} {'자리':<22s} {'점수':>5s}  {'보임':<14s} {'거리':>7s} {'최소고도':>7s}  막는 것")
    print("─" * 96)
    main_id = _main_site_id(show)
    for i, r in enumerate(results, 1):
        mva = r.sights[main_id].min_visible_alt_m if main_id in r.sights else 0.0
        thin = " ⚠" if any(s.data_thin for s in r.sights.values()) else "  "
        print(
            f"{i:2d} {r.viewpoint.name[:22]:<22s} {r.total*100:5.1f}  "
            f"{_bar(r.parts['sky'])} {r.visible_pct:3.0f}% "
            f"{r.distance_m/1000:6.2f}km {mva:6.0f}m{thin} {r.worst_blocker or '—'}"
        )
    print()
    print(_data_note(args))
    return 0


def cmd_explain(args) -> int:
    sites, obstacles, spots, show, field = _load(args)
    match = [s for s in spots if s.id == args.spot or args.spot in s.name]
    if not match:
        print(f"'{args.spot}' 에 해당하는 자리가 없습니다. `bulkkot spots` 로 목록을 보세요.", file=sys.stderr)
        return 1
    vp = match[0]
    terrain = _occluder(args, obstacles)
    score = scoring.evaluate(vp, sites, show, field, terrain=terrain)

    print(f"\n■ {vp.name}  ({vp.lat:.5f}, {vp.lon:.5f}, 지반고 {vp.ground_elev_m:.0f}m, 눈높이 {vp.eye_height_m:.1f}m)")
    if vp.note:
        print(f"  {vp.note}")
    print(f"\n  종합 {score.total*100:.1f}점")
    labels = {"sky": "보이는 비중", "size": "화면 채움", "angle": "올려각", "calm": "한산함", "access": "접근성"}
    for key, value in score.parts.items():
        print(f"    {labels[key]:<7s} {_bar(value)} {value*100:5.1f}")

    print("\n  발사 지점별 시선")
    for site in sites:
        st = score.sights[site.id]
        flag = "  ⚠데이터 범위 밖" if st.data_thin else ""
        print(
            f"    {site.name[:22]:<24s} {st.distance_m/1000:5.2f}km "
            f"{st.min_visible_alt_m:6.0f}m 이상  ← {st.limiting.obstacle_name if st.limiting else '트임'}{flag}"
        )

    print("\n  프로그램 진행에 따른 가시율")
    for tl in score.timeline:
        print(
            f"    {tl.start_min:3d}~{tl.end_min:3d}분  {tl.name[:20]:<22s} "
            f"{_bar(tl.fraction)} {tl.fraction*100:3.0f}%  올려각 {tl.elevation_angle_deg:4.1f}°"
        )

    main_site = max(sites, key=lambda s: sum(e.weight for e in show.effects if e.site_id == s.id))
    profile = sight_profile(vp, main_site, field, samples=64, terrain=terrain)
    if profile:
        print(f"\n  {main_site.name} 방향 시선 단면 (세로 = 표고)")
        _ascii_profile(profile, vp, main_site, score.sights[main_site.id].min_visible_alt_m)
    print()
    print(_data_note(args))
    return 0


def _ascii_profile(profile, vp, site, mva, rows: int = 12) -> None:
    total = profile[-1][0]
    z_end = site.base_elev_m + mva
    top = max(max(z for _, z in profile), z_end, vp.eye_elev_m) * 1.1 + 5
    cols = len(profile)
    grid = [[" "] * cols for _ in range(rows)]
    for i, (s, z) in enumerate(profile):
        ground_row = rows - 1 - int(max(0.0, z) / top * (rows - 1))
        for r in range(ground_row, rows):
            grid[r][i] = "▓"
        ray_z = vp.eye_elev_m + (z_end - vp.eye_elev_m) * (s / total if total else 0)
        ray_row = rows - 1 - int(max(0.0, ray_z) / top * (rows - 1))
        if 0 <= ray_row < rows and grid[ray_row][i] == " ":
            grid[ray_row][i] = "·"
    for r, line in enumerate(grid):
        label = f"{top * (rows - 1 - r) / (rows - 1):6.0f}m "
        print("    " + label + "".join(line))
    print("    " + " " * 7 + f"0 ─────── {total/1000:.2f}km ──────→ {site.name}")


def cmd_check(args) -> int:
    sites, obstacles, spots, show, field = _load(args)
    terrain = _terrain(args, obstacles)
    elev = args.elev if args.elev is not None else terrain.elevation(args.lat, args.lon)
    vp = Viewpoint(
        id="adhoc",
        name=args.name or f"{args.lat:.5f}, {args.lon:.5f}",
        lat=args.lat,
        lon=args.lon,
        ground_elev_m=elev,
        eye_height_m=args.eye,
        crowd=args.crowd,
        access=args.access,
    )
    score = scoring.evaluate(vp, sites, show, field, terrain=_occluder(args, obstacles))
    print(f"\n■ {vp.name} (지반고 {elev:.0f}m, 눈높이 {args.eye:.1f}m)")
    print(f"  종합 {score.total*100:.1f}점 · 프로그램의 {score.visible_pct:.0f}% 가 보임")
    for site in sites:
        st = score.sights[site.id]
        print(
            f"    {site.name[:22]:<24s} {st.distance_m/1000:5.2f}km  "
            f"{st.min_visible_alt_m:6.0f}m 이상  ← {st.limiting.obstacle_name if st.limiting else '트임'}"
        )
    print()
    print(_data_note(args))
    return 0


def cmd_scan(args) -> int:
    sites, obstacles, spots, show, field = _load(args)
    terrain = _terrain(args, obstacles)
    bbox = tuple(args.bbox) if args.bbox else SEOUL_BBOX
    results = scan_mod.scan(
        bbox, args.step, sites, show, field, terrain,
        eye_height_m=args.eye, occluder=_occluder(args, obstacles),
    )
    if args.exclude_known:
        results = scan_mod.drop_near(results, spots, args.exclude_radius, famous_only=not args.all_known)
    results = scan_mod.thin_out(results, args.min_gap)[: args.top]

    print(f"\n격자 탐색 — {bbox} · {args.step:.0f}m 간격 · 인파/접근성은 빼고 기하만 봄")
    print(f"{'':2s} {'좌표':<24s} {'점수':>5s}  {'보임':<14s} {'지반고':>6s} {'거리':>7s}  막는 것")
    print("─" * 96)
    for i, r in enumerate(results, 1):
        print(
            f"{i:2d} {r.viewpoint.name:<24s} {r.total*100:5.1f}  "
            f"{_bar(r.parts['sky'])} {r.visible_pct:3.0f}% "
            f"{r.viewpoint.ground_elev_m:5.0f}m {r.distance_m/1000:6.2f}km  {r.worst_blocker or '—'}"
        )
    print()
    print(_data_note(args))
    if isinstance(terrain, FlatTerrain):
        print("※ DEM 없이 평지로 가정했습니다. --dem 으로 수치표고모델을 넣으면 언덕이 결과에 반영됩니다.")
    return 0


def cmd_report(args) -> int:
    sites, obstacles, spots, show, field = _load(args)
    terrain = _terrain(args, obstacles)
    occluder = _occluder(args, obstacles)
    scores = scoring.rank(spots, sites, show, field, terrain=occluder)
    grid: list = []
    if args.scan:
        raw = scan_mod.scan(
            SEOUL_BBOX, args.step, sites, show, field, terrain,
            eye_height_m=args.eye, occluder=occluder,
        )
        grid = scan_mod.thin_out(raw, 250)[:400]
    payload = report.build_payload(
        scores, sites, obstacles, show, field, grid=grid, data_note=_data_note(args),
        terrain=occluder,
    )
    out = report.write(args.out, payload)
    print(f"{out} 를 썼습니다 ({out.stat().st_size/1024:.0f} KB). 브라우저에서 바로 열립니다.")
    return 0


def cmd_dem(args) -> int:
    """받은 수치표고모델이 쓸 만한지 확인한다."""
    terrain = AsciiGridTerrain.from_file(args.path)
    info = terrain.summary()
    print(f"\n■ {args.path}")
    for key, value in info.items():
        print(f"  {key:<16s} {value}")

    lat_lo, lat_hi = (float(v) for v in str(info["위도 범위"]).split(" ~ "))
    lon_lo, lon_hi = (float(v) for v in str(info["경도 범위"]).split(" ~ "))
    need = NEEDED_BBOX
    # 가장자리 한두 칸 모자란 것은 문제가 아니다
    tol = max(float(info["셀 크기(도)"]) * 2.0, 5e-4)
    covered = (
        lat_lo <= need[0] + tol and lon_lo <= need[1] + tol
        and lat_hi >= need[2] - tol and lon_hi >= need[3] - tol
    )
    print()
    print(f"  필요한 범위 {need[0]:.4f},{need[1]:.4f} ~ {need[2]:.4f},{need[3]:.4f}")
    print("  " + ("범위를 모두 덮습니다." if covered else "⚠ 필요한 범위를 다 덮지 못합니다. 다시 잘라 받으세요."))

    cell_m = float(info["셀 크기(m, 남북)"])
    cells = int(info["유효 셀"]) + int(info["결측 셀"])
    if cell_m < 8:
        print(f"  ⚠ 셀 {cell_m:.1f}m, {cells:,}칸. 이 도구에는 과합니다 — 10~20m로 줄이면 훨씬 빠릅니다.")
    if float(info["표고 최대"]) < 150:
        print("  ⚠ 최고 표고가 150m 미만입니다. 남산(≈262m)이 범위에 들었는지 확인하세요.")
    print()
    return 0


def cmd_spots(args) -> int:
    _, _, spots, _, _ = _load(args)
    for s in spots:
        tag = " [알려진 명당]" if s.famous else ""
        print(f"{s.id:<18s} {s.name}{tag}")
    return 0


def cmd_sites(args) -> int:
    sites, _, _, show, _ = _load(args)
    for s in sites:
        print(f"{s.id:<16s} {s.name}  ({s.lat:.5f}, {s.lon:.5f}) 발사면 {s.base_elev_m:.0f}m")
    print()
    for e in show.effects:
        print(f"  {e.start_min:3d}~{e.end_min:3d}분  {e.name:<22s} {e.site_id:<14s} 고도 {e.alt_min_m:.0f}~{e.alt_max_m:.0f}m")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="bulkkot",
        description="한강 불꽃축제가 실제로 보이는 자리를, 발사 고도와 건물·능선 높이로 계산한다.",
    )
    p.add_argument("--data", help="데이터 디렉터리 (기본: 내장 씨드 데이터)")
    p.add_argument("--show", default="show_2026.json", help="프로그램 파일 이름")
    sub = p.add_subparsers(dest="cmd", required=True)

    def add_terrain_opts(sp):
        sp.add_argument("--dem", help="ESRI ASCII 격자(.asc) 수치표고모델")
        sp.add_argument("--ridge-terrain", action="store_true", help="능선 데이터로 지반고를 거칠게 추정")
        sp.add_argument("--base-elev", type=float, default=12.0, help="DEM이 없을 때의 기본 지반고(m)")
        sp.add_argument("--eye", type=float, default=1.6, help="눈높이(m). 옥상·전망대면 올려 잡는다")

    r = sub.add_parser("rank", help="후보지 순위")
    r.add_argument("--hidden", action="store_true", help="이미 유명한 명당은 빼고, 한산함에 가중치")
    r.add_argument("--top", type=int, default=20)
    r.add_argument("--json", action="store_true")
    add_terrain_opts(r)
    r.set_defaults(func=cmd_rank)

    e = sub.add_parser("explain", help="한 자리를 뜯어보기")
    e.add_argument("spot", help="후보지 id 또는 이름 일부")
    add_terrain_opts(e)
    e.set_defaults(func=cmd_explain)

    c = sub.add_parser("check", help="임의 좌표 확인")
    c.add_argument("lat", type=float)
    c.add_argument("lon", type=float)
    c.add_argument("--name")
    c.add_argument("--elev", type=float, help="지반고(m). 생략하면 지형 모델에서 가져온다")
    c.add_argument("--crowd", type=float, default=0.5)
    c.add_argument("--access", type=float, default=0.5)
    add_terrain_opts(c)
    c.set_defaults(func=cmd_check)

    s = sub.add_parser("scan", help="격자 탐색으로 이름 없는 자리 찾기")
    s.add_argument("--step", type=float, default=250.0, help="격자 간격(m)")
    s.add_argument("--bbox", type=float, nargs=4, metavar=("MIN_LAT", "MIN_LON", "MAX_LAT", "MAX_LON"))
    s.add_argument("--top", type=int, default=25)
    s.add_argument("--min-gap", type=float, default=600.0, help="상위 결과 사이 최소 간격(m)")
    s.add_argument("--exclude-known", action="store_true", help="알려진 명당 주변은 제외")
    s.add_argument("--exclude-radius", type=float, default=500.0)
    s.add_argument("--all-known", action="store_true", help="유명하지 않은 후보지 주변도 제외")
    add_terrain_opts(s)
    s.set_defaults(func=cmd_scan)

    rep = sub.add_parser("report", help="자립형 HTML 관측도 생성")
    rep.add_argument("-o", "--out", default="hangang-fireworks.html")
    rep.add_argument("--scan", action="store_true", help="격자 탐색 결과도 겹쳐 그린다")
    rep.add_argument("--step", type=float, default=250.0)
    add_terrain_opts(rep)
    rep.set_defaults(func=cmd_report)

    d = sub.add_parser("dem", help="받은 수치표고모델 점검")
    d.add_argument("path", help="ESRI ASCII 격자(.asc) 파일")
    d.set_defaults(func=cmd_dem)

    sub.add_parser("spots", help="후보지 목록").set_defaults(func=cmd_spots)
    sub.add_parser("sites", help="발사 지점과 프로그램").set_defaults(func=cmd_sites)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
