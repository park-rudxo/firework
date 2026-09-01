"""실제 건물 데이터를 끌어오는 어댑터.

내장 씨드 데이터는 엔진을 굴려보기 위한 것이고, 쓸 만한 답을 얻으려면
실제 건물 높이가 필요하다. 어느 provider를 쓰든 결과는 같은 형식의
obstacles.json 이므로, 받아서 --data 디렉터리에 넣으면 그대로 계산에 쓰인다.
"""

from .local_geojson import from_geojson, load_geojson
from .overpass import fetch_overpass, overpass_query, parse_overpass
from .vworld import fetch_vworld

__all__ = [
    "fetch_overpass",
    "fetch_vworld",
    "from_geojson",
    "load_geojson",
    "overpass_query",
    "parse_overpass",
]
