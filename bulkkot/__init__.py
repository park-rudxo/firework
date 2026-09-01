"""불꽃 — 한강 불꽃축제가 '실제로 보이는' 자리를 기하로 찾는다.

그늘 계산기가 태양 위치와 건물 높이로 그림자를 접듯,
이 패키지는 발사 지점의 고도와 건물·능선 높이로 '보이는 하늘'을 접는다.
"""

from .model import Effect, LaunchSite, Obstacle, Show, Sight, Viewpoint
from .visibility import ObstacleField, sight
from .scoring import evaluate, rank

__all__ = [
    "Effect",
    "LaunchSite",
    "Obstacle",
    "ObstacleField",
    "Show",
    "Sight",
    "Viewpoint",
    "evaluate",
    "rank",
    "sight",
]

__version__ = "0.1.0"
