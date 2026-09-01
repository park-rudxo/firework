# 받아야 할 데이터

우선순위 순으로 적는다. **1번만 있어도 결과가 완전히 달라진다.** 2번까지 넣으면
언덕이 살아나고, 3번은 매년 갱신해야 하는 값이다. 4번 이하는 있으면 좋은 것.

포털의 메뉴 구조는 자주 바뀐다. 경로가 안 맞으면 **따옴표 안의 데이터셋 이름으로
검색**하면 나온다.

---

## 1. 건물 (필수) — 결과의 8할을 결정한다

시선을 막는 것이 곧 답이므로, 이게 없으면 나머지는 의미가 없다.
셋 중 **하나만** 고르면 된다. 위에서부터 정확도 순이다.

### ① 국가공간정보포털 — "GIS건물통합정보" ★ 권장

- 사이트: `nsdi.go.kr` → 열린마켓 / 국가중점데이터
- 검색어: **GIS건물통합정보** (또는 건물통합정보마스터)
- 받을 범위: 서울특별시. 시군구 단위로 쪼개져 있으면
  **영등포구·용산구·동작구·마포구·중구·서대문구** 6개면 충분하다.
- 형식: Shapefile (`.shp` + `.dbf` + `.shx` + `.prj`)
- 왜 이게 최선인가: **건물 높이(m)가 실측으로 들어 있다.** 층수만 있는 데이터는
  층고를 3.3m로 가정해야 하는데, 여의도 파크원(318m) 같은 초고층에서 그 가정이
  수십 m씩 틀어진다.
- 확인할 속성 이름: `HEIGHT`(높이 m), `GRND_FLR`(지상층수), `BLD_NM`(건물명)
- 좌표계 주의: 보통 **EPSG:5186** (중부원점)이다. WGS84로 변환해서 넘겨야 한다.

변환:
```bash
# shapefile → WGS84 GeoJSON
ogr2ogr -f GeoJSON -t_srs EPSG:4326 seoul_buildings.geojson F_FAC_BUILDING_11.shp
```

넣기:
```python
from bulkkot.providers import load_geojson, from_geojson
from bulkkot.providers.overpass import to_obstacles_json
import json

obstacles = from_geojson(load_geojson("seoul_buildings.geojson"))
json.dump(to_obstacles_json(obstacles, "국가공간정보포털 GIS건물통합정보"),
          open("mydata/obstacles.json", "w"), ensure_ascii=False)
```

### ② VWorld 데이터 API — 키만 받으면 바로 코드로

- 사이트: `vworld.kr` → 오픈API → 인증키 발급 (무료, 즉시)
- 장점: 다운로드·변환 없이 bbox로 바로 받는다. 응답이 이미 WGS84 GeoJSON.
- 단점: 한 번에 받는 개수 제한이 있어 페이지를 돌려야 하고, 레이어 이름이
  개편될 때가 있다. **레이어 목록에서 건물 레이어 id를 한 번 확인**하고
  `bulkkot/providers/vworld.py` 의 `BUILDING_LAYER` 를 맞춰라.

```python
from bulkkot.providers import fetch_vworld
obstacles = fetch_vworld((37.49, 126.88, 37.58, 127.05), api_key="발급받은키")
```

### ③ OpenStreetMap Overpass — 키도 가입도 필요 없음

- 코드만 돌리면 된다. 대신 **한국 건물의 높이 속성 결측이 심하다.**
  높이가 없으면 층수×3.3m, 층수도 없으면 기본값 12m로 떨어진다.
- 급할 때 형태만 보는 용도. 최종 판단에는 ①을 써라.

```python
from bulkkot.providers import fetch_overpass
obstacles = fetch_overpass((37.49, 126.88, 37.58, 127.05))
```

---

## 2. 지형 (중요) — 언덕은 관람자를 들어올리고, 동시에 앞을 가로막는다

응봉산·국사봉·서달산·하늘공원처럼 **지반고 자체가 무기**인 자리들은 DEM 없이는
평지로 취급된다. 지금 `obstacles.json` 의 `ridges` 는 손으로 넣은 임시 능선이다.

DEM을 넣으면 두 가지가 한꺼번에 바뀐다.

- **들어올린다** — 격자 탐색의 후보지 지반고가 실측이 된다. 179m 국사봉이
  12m 평지로 계산되던 것이 제자리를 찾는다.
- **가로막는다** — 시선을 따라 지반고를 훑어, 건물과 똑같은 공식으로 차폐를
  계산한다. 강 건너 언덕 뒤에 있는 자리가 정직하게 걸러진다.

`--dem` 을 넘긴 경우에만 두 번째가 켜진다. 그때는 `obstacles.json` 의 `ridges`
항목을 지워도 된다 — 실측 지형과 이중으로 계산되기 때문이다.

### 필요한 것

| 항목 | 값 |
| --- | --- |
| 범위 | 위도 **37.4923 ~ 37.5745**, 경도 **126.8773 ~ 127.0382** |
| 좌표계 | **WGS84 경위도 (EPSG:4326)** — 투영 좌표계는 그대로 못 쓴다 |
| 해상도 | **10~20m 권장** (5m는 과하다. 아래 설명) |
| 형식 | ESRI ASCII 격자 `.asc` |

범위는 내장 후보지들의 시선이 실제로 지나는 구간에 여유 500m를 더한 값이다.

### 경로 A — SRTM 30m (10분, 여기서 시작할 것)

가입·심사 없이 bbox만 지정해 받을 수 있고, **이미 WGS84라 재투영이 필요 없다.**
언덕의 높이를 재는 데는 30m로 충분하다 — 이 도구가 가르는 것은 "이 언덕이
50m냐 180m냐"이지 "178m냐 179m냐"가 아니다.

- `opentopography.org` → SRTM GL1 (30m) → 위 bbox 지정 → GeoTIFF
- 또는 `earthexplorer.usgs.gov` → Digital Elevation → SRTM

```bash
gdal_translate -of AAIGrid \
  -projwin 126.8773 37.5745 127.0382 37.4923 \
  srtm.tif seoul.asc
```

한 가지 감안할 점: SRTM은 지표면(DSM)에 가까워 30m 격자 안의 건물·수목 높이가
조금 섞여 있다. 언덕 판단에는 문제없지만, 시가지 한복판의 표고는 실제 지면보다
몇 m 높게 나올 수 있다.

### 경로 B — 국토지리정보원 5m DEM (정확하지만 손이 간다)

- 사이트: 국토정보플랫폼 `map.ngii.go.kr`
- 경로: 국토정보맵 → 자료실 / 다운로드 (메뉴가 개편되면 **"수치표고모델"** 로 검색)
- 도엽 단위로 나뉘어 있다. 서울 중심부는 대략 **35606, 35607, 35608, 36601** 도엽
  근처인데, 지도에서 위 bbox를 덮는 도엽을 눈으로 골라 담는 편이 확실하다.
- 나라지도(`map.ngii.go.kr`)에서 받으면 보통 **EPSG:5186(중부원점)** 이다.
  **반드시 재투영해야 한다.**

```bash
# 1) 여러 도엽을 하나로 + WGS84로 재투영 + 20m로 리샘플
gdalwarp -t_srs EPSG:4326 \
  -te 126.8773 37.4923 127.0382 37.5745 \
  -tr 0.0002 0.0002 -r bilinear \
  dem_35606.tif dem_35607.tif dem_35608.tif seoul-wgs84.tif

# 2) ASCII 격자로
gdal_translate -of AAIGrid seoul-wgs84.tif seoul.asc
```

`-tr 0.0002 0.0002` 가 셀 크기(도)다. 위도 0.0002° ≈ 22m 정도로, 이 도구에는
그 정도면 충분하다.

GDAL을 안 쓴다면 QGIS로도 된다: 래스터 불러오기 → 마우스 우클릭 → 내보내기 →
다른 이름으로 저장 → 형식 `AAIGrid`, CRS `EPSG:4326`, 해상도 0.0002.

### 왜 5m를 권하지 않나

`.asc` 는 텍스트라 셀 하나가 수 바이트씩 먹고, 이 도구는 의존성을 없애려고
파이썬 리스트에 통째로 올린다.

| 셀 크기 | 칸 수 | 파일 | 메모리 |
| --- | --- | --- | --- |
| 5m | 약 570만 | 40~60MB | 400MB 이상 |
| 20m | 약 36만 | 2~3MB | 30MB 남짓 |

정확도 차이는 거의 없는데 부담은 스무 배 가까이 난다. 정밀한 5m가 손에 있어도
`gdalwarp -tr 0.0002 0.0002` 로 줄여서 쓰는 편이 낫다.

### 받았으면 확인

```bash
python -m bulkkot dem seoul.asc
```

셀 크기·범위·표고 최대/최소를 찍고, 필요한 범위를 덮는지 판정한다.
투영 좌표계 파일을 넣으면 조용히 어긋난 답을 내는 대신 여기서 막고
변환 명령을 알려준다. **표고 최대가 150m 미만이면** 남산(≈262m)이 범위 밖이니
다시 잘라 받아야 한다.

```bash
python -m bulkkot rank    --dem seoul.asc
python -m bulkkot explain eungbong --dem seoul.asc
python -m bulkkot scan    --dem seoul.asc --step 150 --exclude-known
```

`explain` 의 "시선을 막는 것"에 **지형**이 뜨기 시작하면 제대로 물린 것이다.

### 진짜 DEM 없이 먼저 굴려보고 싶다면

```bash
python tools/make_synthetic_dem.py seoul-fake.asc
python -m bulkkot dem seoul-fake.asc
```

능선 데이터를 가우시안 언덕으로 부풀린 가짜 지형이다. 경로가 도는지 확인하는
용도이지, 판단에 쓸 값이 아니다.

## 3. 축제 정보 (매년 갱신) — "시각에 따라 달라진다"의 핵심

이 두 값이 타임라인 전체를 결정한다. 건물 데이터가 아무리 정확해도 발사
지점이 500m 틀리면 근거리 자리의 순위가 뒤집힌다.

| 무엇 | 어디서 | 넣을 곳 |
| --- | --- | --- |
| 바지선/발사대 배치도, 발사 지점 좌표 | 한화 서울세계불꽃축제 공식 사이트, 서울시 보도자료, 영등포구·용산구 교통통제 공고 | `launch_sites.json` |
| 프로그램 큐시트 (팀별 순서, 시간) | 공식 사이트 프로그램 안내 | `show_*.json` 의 `start_min`/`end_min` |
| 연출 고도 대역 | 공개되지 않는다 — 전년도 사진·영상에서 63빌딩(249m)을 자로 삼아 추정하는 게 현실적 | `show_*.json` 의 `alt_min_m`/`alt_max_m` |
| 통제 구역 | 서울시·경찰 교통통제 공고 | `spots.json` 의 `access`, `note` |

고도 대역 추정 요령: 63빌딩이 프레임에 같이 잡힌 사진을 찾아, 건물 높이(249m)
대비 불꽃 정점의 화면상 비율로 환산한다. 오차 ±50m면 충분하다 — 이 도구가
가르는 것은 "50m냐 300m냐"지 "280m냐 300m냐"가 아니다.

---

## 4. 있으면 좋은 것

| 데이터 | 어디서 | 무엇이 좋아지나 |
| --- | --- | --- |
| **바람 (풍향·풍속)** | 공공데이터포털 `data.go.kr` → "기상청_단기예보 조회서비스" | 연기가 관람자 쪽으로 흐르는지. 후반부 만족도를 가장 크게 좌우하는 미계산 변수 |
| **가로수** | 서울 열린데이터광장 `data.seoul.go.kr` → "서울시 가로수 위치정보" | 강변 관람의 실질 차폐물. 그늘로가 그림자에 쓰는 바로 그 데이터 |
| **하천 폴리곤** | 국가공간정보포털 → "하천 공간정보" | 수면 반사 보너스, 그리고 지도가 진짜 지도처럼 보인다 |
| **한강공원 시설·출입구** | 서울 열린데이터광장 | 접근성(`access`) 점수를 손이 아니라 데이터로 |
| **인구 유동** | SKT/KT 유동인구, 서울생활이동 데이터 | 인파(`crowd`) 점수를 작년 같은 날 실측으로 |

---

## 넣고 나서

```bash
mkdir mydata
# obstacles.json 은 새로 만든 것으로, 나머지 4개는 씨드에서 복사해 고쳐 쓴다
cp bulkkot/data/{launch_sites.json,spots.json,show_2026.json,hangang.json,landmarks.json} mydata/

python -m bulkkot rank --data mydata --dem seoul.asc
python -m bulkkot report --data mydata --dem seoul.asc --scan -o 관측도.html
```

`데이터 밖` 경고가 사라지고 `massing_` 근사 블록이 없어지면 제대로 들어간 것이다.
