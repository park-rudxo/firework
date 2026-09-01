"""도메인 모델: 발사 지점, 장애물, 관람 후보지, 연출 프로그램."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Sequence

LatLon = tuple[float, float]


@dataclass(frozen=True)
class LaunchSite:
    """불꽃이 올라가는 지점. 하늘의 '광원'에 해당한다."""

    id: str
    name: str
    lat: float
    lon: float
    base_elev_m: float  # 발사대가 놓인 면의 표고 (수면/교량 상판/지반)
    kind: Literal["barge", "bridge", "ground", "rooftop"] = "barge"
    note: str = ""

    @property
    def latlon(self) -> LatLon:
        return (self.lat, self.lon)


@dataclass(frozen=True)
class Obstacle:
    """시선을 가로막는 것. 건물 동(棟) 또는 능선.

    top_elev_m 은 해발 표고(지반고 + 높이)로 정규화해서 다룬다.
    시선 판정은 '표고 대 표고' 비교가 되어야 지형과 건물을 함께 처리할 수 있다.
    """

    id: str
    name: str
    outline: Sequence[LatLon]  # 건물: 닫힌 폴리곤 / 능선: 열린 폴리라인
    top_elev_m: float
    kind: Literal["building", "ridge"] = "building"
    source: str = "seed"

    @property
    def is_ridge(self) -> bool:
        return self.kind == "ridge"


@dataclass(frozen=True)
class Viewpoint:
    """관람 후보지."""

    id: str
    name: str
    lat: float
    lon: float
    ground_elev_m: float
    eye_height_m: float = 1.6  # 지면 관람 기준. 옥상/전망대는 별도로 올려 잡는다.
    crowd: float = 0.5  # 0=한산, 1=발 디딜 틈 없음 (경험적 지표)
    access: float = 0.5  # 0=접근 곤란, 1=역에서 도보 5분
    famous: bool = False  # 이미 널리 알려진 명당인가 (숨은 스팟 필터용)
    tags: tuple[str, ...] = ()
    note: str = ""

    @property
    def latlon(self) -> LatLon:
        return (self.lat, self.lon)

    @property
    def eye_elev_m(self) -> float:
        return self.ground_elev_m + self.eye_height_m


@dataclass(frozen=True)
class Effect:
    """프로그램 한 구간의 연출. 고도 대역과 가중치를 갖는다.

    태양이 시각에 따라 위치를 바꾸듯, 불꽃은 시각에 따라 '터지는 고도'와
    '발사 지점'을 바꾼다. 그래서 한 장소의 가시성은 하나의 값이 아니라
    프로그램 타임라인 위의 함수다.
    """

    id: str
    name: str
    site_id: str
    start_min: int  # 쇼 시작 이후 경과 분
    end_min: int
    alt_min_m: float  # 이 연출이 차지하는 고도 대역 (발사면 기준)
    alt_max_m: float
    weight: float = 1.0  # 이 연출이 '축제다움'에 기여하는 비중
    spread_m: float = 150.0  # 전형적인 화포 전개 지름 (시각 크기 계산용)

    def band(self) -> tuple[float, float]:
        return (self.alt_min_m, self.alt_max_m)

    def visible_fraction(self, min_visible_alt_m: float) -> float:
        """최소 가시 고도가 주어졌을 때, 이 연출 중 눈에 보이는 비율(0~1)."""
        lo, hi = self.alt_min_m, self.alt_max_m
        if hi <= lo:
            return 1.0 if min_visible_alt_m <= lo else 0.0
        if min_visible_alt_m <= lo:
            return 1.0
        if min_visible_alt_m >= hi:
            return 0.0
        return (hi - min_visible_alt_m) / (hi - lo)


@dataclass(frozen=True)
class Show:
    """축제 하나의 연출 프로그램."""

    id: str
    name: str
    date: str
    start_time: str  # "19:20"
    effects: tuple[Effect, ...]

    def at_minute(self, minute: int) -> tuple[Effect, ...]:
        return tuple(e for e in self.effects if e.start_min <= minute < e.end_min)

    @property
    def duration_min(self) -> int:
        return max((e.end_min for e in self.effects), default=0)

    @property
    def total_weight(self) -> float:
        return sum(e.weight for e in self.effects) or 1.0


@dataclass
class Blocker:
    """시선을 실제로 막고 있는 대상과, 그것이 요구하는 최소 표고."""

    obstacle_id: str
    obstacle_name: str
    distance_m: float
    top_elev_m: float
    required_elev_m: float


@dataclass
class Sight:
    """한 후보지에서 한 발사 지점을 봤을 때의 기하 결과."""

    viewpoint_id: str
    site_id: str
    distance_m: float
    bearing_deg: float
    min_visible_alt_m: float  # 발사면 기준 고도. 0이면 수면 연출까지 다 보임
    limiting: Blocker | None
    blockers: list[Blocker] = field(default_factory=list)
    checked_obstacles: int = 0
    coverage: float = 1.0

    @property
    def data_thin(self) -> bool:
        """시선의 상당 부분이 장애물 데이터 범위 밖을 지난다면, '잘 보인다'는
        결론이 실제로 트여서가 아니라 데이터 부재에서 나온 것일 수 있다."""
        return self.coverage < 0.9

    def elevation_angle_deg(self, alt_m: float) -> float:
        from . import geo

        return geo.elevation_angle_deg(self.distance_m, alt_m)

    def to_dict(self) -> dict[str, Any]:
        return {
            "viewpoint_id": self.viewpoint_id,
            "site_id": self.site_id,
            "distance_m": round(self.distance_m, 1),
            "bearing_deg": round(self.bearing_deg, 1),
            "min_visible_alt_m": round(self.min_visible_alt_m, 1),
            "checked_obstacles": self.checked_obstacles,
            "coverage": round(self.coverage, 3),
            "data_thin": self.data_thin,
            "limiting": None
            if self.limiting is None
            else {
                "id": self.limiting.obstacle_id,
                "name": self.limiting.obstacle_name,
                "distance_m": round(self.limiting.distance_m, 1),
                "top_elev_m": round(self.limiting.top_elev_m, 1),
            },
        }
