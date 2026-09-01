# 데이터 교체 안내

이 디렉터리의 JSON은 **엔진을 굴려보기 위한 씨드 데이터**다. 좌표와 높이는
근사치이고, 프로그램 큐시트는 역대 진행 방식을 본뜬 모델이다. 순위를 그대로
믿지 말고, 아래 출처로 갈아끼운 뒤에 읽어야 한다. 스키마만 맞으면
`--data <디렉터리>` 로 통째로 대체된다.

## obstacles.json — 시선을 막는 것

가장 결과를 크게 바꾸는 파일이다. 셋 중 하나를 쓴다.

| 출처 | 특징 | 받는 법 |
| --- | --- | --- |
| 국토교통부 건물통합정보 | 전국 건물의 높이·층수·지반고. 가장 정확 | 국가공간정보포털에서 shapefile 내려받아 GeoJSON 변환 후 `providers.local_geojson.from_geojson` |
| VWorld 데이터 API | 무료 키, GeoJSON 응답 | `providers.vworld.fetch_vworld(bbox, api_key)` |
| OpenStreetMap Overpass | 키 불필요, 대신 높이 속성 결측 많음 | `providers.overpass.fetch_overpass(bbox)` |

높이 속성이 비어 있으면 층수 × 3.3m 로 환산하고, 그것도 없으면 기본값으로
떨어진다. 여의도·용산처럼 초고층이 섞인 곳에서 기본값은 결과를 크게 망친다.

`id`가 `massing_`으로 시작하는 항목은 개별 건물이 아니라 시가지를 한 덩어리로
뭉갠 근사 블록이다. 실제 건물 데이터를 넣으면 반드시 지워야 한다.

## 지형

능선은 `ridges` 로 손수 넣어 두었지만, 제대로 하려면 수치표고모델이 필요하다.
국토지리정보원 DEM 또는 SRTM 을 ESRI ASCII 격자로 변환해
`--dem seoul.asc` 로 넘기면 격자 탐색의 지반고가 실측으로 바뀐다.

```
gdal_translate -of AAIGrid dem.tif seoul.asc
```

## launch_sites.json / show_*.json — 발사 지점과 프로그램

매년 바지선 배치와 큐시트가 바뀐다. 주최 측이 공개하는 배치도·프로그램이
나오면 좌표와 시간·고도 대역을 고쳐 넣는다. 이 두 파일이 "시각에 따라 무엇이
보이는가"를 결정하므로, 정확도가 가장 크게 체감되는 곳이다.

## spots.json — 후보지

`crowd`(인파)와 `access`(접근성)는 계산되는 값이 아니라 사람이 넣는 값이다.
0~1 사이로 자기 기준을 적으면 된다. 좌표와 `ground_elev_m` 만 정확하면
기하 계산은 제 몫을 한다.
