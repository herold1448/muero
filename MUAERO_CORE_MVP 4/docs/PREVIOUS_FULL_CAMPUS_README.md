# 무애로 MUAERO v8 — 전남대 OSM 접근성 3D 연구용 앱

## 전체 용봉캠퍼스 자료 확장판 (2026-11-23)

이 ZIP은 이전 정문–도서관 시범판에서 복사해 개발했다. 서버 실행 방법은 아래와 같다. **전체 캠퍼스 완성·현장 검증 버전이 아니다.** 기존 OSM 스냅샷에는 주변 건물도 포함되고, 공식 경계·실제 DEM·자동차도로 면형은 없다. 화면의 `캠퍼스 전체` 버튼은 현재 보유 좌표의 조감도이며 교내만 잘라낸 지도가 아니다. 자료 수량과 누락·출처는 `docs/FULL_CAMPUS_DATA_AUDIT.md`를 보라.

추가 파일: `scripts/build_full_campus.py`, `scripts/plot_full_campus.py`, `scripts/import_dem.py`, `src/terrain.js`, `data/official_campus_catalog.json`, `exports/full_campus_*.geojson`, `exports/full_campus_qa.json`, `exports/official_name_audit.json`, `tests/full-campus-v8.mjs`. 기존 원본 OSM/경로/API 파일 및 시범 자료는 그대로 있다.

```bash
# 기존 ZIP 압축 해제 후 MUAERO_JNU_v8_FullCampus 폴더에서
python3 server.py
# http://127.0.0.1:4173/?v=8 를 Chrome에서 열기

# 개발 검증에만 Python 3 및 Node.js 필요
python3 scripts/build_full_campus.py
for f in tests/*.mjs; do node "$f" || exit 1; done
python3 tests/server_v7.py
```

### 실제 DEM을 별도로 확보한 경우

원본 DEM의 수평 좌표계, 수직 기준면, 라이선스를 먼저 확인한다. 원본 파일을 사용자가 별도 보존하고 아래 명령으로 앱용 격자를 만든다. `rasterio`, `pyproj`, `numpy`는 이 가져오기 절차에만 필요하며 기본 앱 실행에는 필요하지 않다.

```bash
python3 -m pip install rasterio pyproj numpy
python3 scripts/import_dem.py /실제/DEM/파일.img \
  --vertical-datum '자료에 명시된 기준면' \
  --license '자료별 이용조건' \
  --source '원본 발급기관·제품명·제작연도'
python3 server.py
```

`data/terrain/grid.json`을 생성하고 서버를 다시 열면 지형이 자동 적용된다. 업로드 자료와 메타데이터가 맞는지 사람이 별도 확인해야 한다. DEM은 턱·경사로·출입구의 현장 실측값을 대신하지 않는다. 현재 배포 ZIP에는 **DEM 파일도 가상 고도도 없다.**

**현장 검증 전입니다. 계산 경로를 실제 휠체어 이동의 안전 경로로 사용하지 마세요.** 현재 위치는 1회 확인만 지원하며 실시간 GPS 안내는 없습니다.

## Mac 실행

1. ZIP을 압축 해제하고 터미널에서 해당 `MUAERO_JNU_v8` 폴더로 이동합니다. Finder 폴더를 `cd ` 뒤에 드래그해도 됩니다.
2. `python3 server.py` 실행. Python 3 표준 라이브러리만 필요합니다. npm 설치나 네트워크 연결은 필요하지 않습니다.
3. Chrome에서 `http://127.0.0.1:4173/?v=8`을 엽니다. WebGL 2 사용 가능한 브라우저가 필요합니다.
4. 오른쪽 위에 **OSM 좌표 기반**이 나타날 때까지 기다립니다. 기본 출발지 「정문 인근 OSM 경로 시점(좌표 미확인)」과 도착지 중앙도서관을 확인하고 `경로 계산하기`를 누릅니다. `▶ 안내 시작`은 가상 주행 시연입니다.
5. 종료: 터미널에서 Ctrl+C. 기존 포트를 사용 중이면 기존 서버를 먼저 종료하거나 `GILON_PORT=4174 python3 server.py`로 실행합니다.

### 기존 v7에서 생성한 데이터 옮기기

`python3 scripts/migrate_v7.py /기존/GILON_JNU_v7`을 **v8 폴더에서 서버 실행 전에** 한 번 실행합니다. 출입구·관리자 수정·신고·이력·추가 차도 및 변경된 OSM 원본을 옮깁니다. 기존 v8 기록은 덮어쓰지 않습니다. v7에서 수정한 OSM 원본이 있으면 v8 동봉본은 `data/*.v8-bundled-backup`으로 백업하고 가져옵니다. 브라우저 localStorage만 사용했던 이전 기록은 원래 브라우저 프로필에 남을 수 있어 별도 내보내기가 필요합니다.

## v8 통합 내용

- v7의 OSM 파싱, A* 경로, 건물 외곽 근접 접근 후보, 선분별 통행 판정, 미검증 거리, 최소 폭·경사 제한, 제보, 출입구·구간 수정·이력 API를 그대로 사용합니다.
- `src/renderer.js`는 동봉한 Three.js 0.187.0 모듈로 장면·카메라·조명·메시를 구성합니다. 기존 렌더러는 `src/renderer-v7-legacy.js`에 회귀검사용으로 보존했습니다.
- `src/geometry.js`는 OSM 위경도를 경로와 같은 미터 좌표계로 변환하며 중복·자기 교차·면적 오류를 검사합니다. 오목한 건물 지붕은 삼각분할하고 외벽을 생성합니다. 원본 건물 1,422개 모두 코드상의 형태 검사와 삼각분할을 통과했습니다.
- 보행로·횡단·계단·혼용 차도는 제공된 way 중심선 좌표로 렌더링합니다. **인도 실제 양쪽 경계와 차도 전체는 제공되지 않았습니다.** 표면 폭은 태그/관리자 기록이 없으면 시각화용 추정 폭입니다.
- 건물 높이: OSM `height` 태그 30개 사용, `building:levels` 태그는 층당 3.3m로 환산, 나머지는 10m 시각화 추정. 실제 건물 고도·지붕 형태는 확인되지 않았습니다.
- 경사: OSM `incline=up/down` 19개 길은 방향만 표시하며 **고도를 생성하지 않습니다**. 숫자 경사율은 OSM 태그 또는 관리자 입력값을 따릅니다. 입력 출처를 화면과 코드에서 구분합니다. 디지털 지형 고도 자료가 없어 실제 램프 높이나 인접 보행로 연결 고도를 재현하지 못합니다.
- 휠체어 모형은 계산 경로 위에서 실제 누적 거리로 이동하고, 바퀴·방향·추적 카메라가 갱신됩니다. 카메라 및 그리기 성능은 Mac 실제 브라우저에서 아직 확인이 필요합니다.
- 모바일 패널, 데이터 출처 범례, 키보드 초점 표시를 추가했습니다. 실기기 렌더·터치 조작은 미검증입니다.

## 자동 검사

```bash
for f in tests/*.mjs; do node "$f" || break; done
python3 tests/server_v7.py
```

Node.js는 기본 실행에는 필요 없습니다. `tests/renderer-v7-mock.mjs`, `tests/ui*.mjs`는 보존한 v7 렌더러를 사용하는 회귀검사입니다. 새 3D 렌더러는 `tests/geometry-v8.mjs`에서 실제 원본 좌표·삼각분할·높이 출처를 검사합니다.

실제 브라우저 확인을 위해 별도 터미널에서 서버를 실행하고, `npm install --no-save playwright && npx playwright install chromium && node tests/browser_v8.cjs`를 실행할 수 있습니다. 이 명령은 브라우저 바이너리를 설치하며 인터넷 연결이 필요합니다. 본 작업 환경에서 Chromium 시작이 차단돼 이 테스트는 **통과하지 않았습니다**. `TEST_RESULTS.md`에 검증 범위와 실패 사유를 적었습니다.

## 남은 현장 데이터

- 경영대 2호관 → 중앙도서관 첫 경로의 18개 후보 구간 실존·연결 여부, 보행 폭, 경사율, 노면, 공사·장애물
- 양쪽 횡단 연석 높이, 경사로 실제 시작·끝 지점 및 고도, 건물 접근 가능 출입구 위치·문턱·자동문
- 전체 차도와 인도 경계 및 누락 보행로, 건물 높이 1,392개에 대한 신뢰 가능한 수치 또는 층수 환산 검증
- 실제 기기 GPS 정밀도와 휠체어 동행 이동 검증

`surveys/first-route-field-checklist.csv`에서 미확인 칸을 현장에서 채울 수 있습니다. 원본은 © OpenStreetMap contributors, ODbL 1.0. 동봉 Three.js 라이선스는 `vendor/THREE_LICENSE.txt`입니다.

## 2026-11-23 정문 인근 → 도서관 시범 갱신

- 사용자가 제공한 88.8초 네이버 거리뷰 화면 기록을 시간대별로 확인했습니다. 원본 영상/프레임은 ZIP에 복제하지 않습니다. 촬영 시점이 다른 2025년 5월 및 2026년 2월 장면이 섞인 영상이며, 공사 장비를 현재 장애물로 자동 등록하지 않습니다. 상세 관찰: `docs/GATE_TO_LIBRARY_VIDEO_ANALYSIS.md`.
- 정문은 전남대 공식 지도에 E01로 표기되지만 정확한 출입구 좌표를 확보하지 못했습니다. 기본 출발점은 OSM 민주대로(`1120956407`) **남쪽 끝 후보점**입니다. `시범 구간` 버튼으로 다시 지정할 수 있습니다. 후보점의 실제 출입구 대응은 현장 확인이 필요합니다.
- 영상에서 보이는 차로와 OSM `pedestrian` 태그의 대응이 불확실해 시범 경로에서만 이 way를 제외합니다. 결과는 약 821m, 51개 선분이며 **전부 현장 미검증**입니다. 다른 목적지를 선택하면 기존 v7의 경로 정책을 유지합니다.
- `data/gate_library_pilot.geojson`은 원본 WGS84 건물 49개와 길 155개 및 측정값 `null`을 제공합니다. `python3 scripts/build_pilot.py`로 다시 만들 수 있습니다. 보유 원본 데이터는 변경하지 않았습니다. 출처·미확보 목록은 `docs/DATA_PROVENANCE.md`.
- `src/renderer.js`는 동일 좌표 변환을 유지하며 시범 구간 건물에 별도 외관색·창문 모형을 만들고, 경사 방향만으로 ±0.35m를 임의 상승시키던 동작을 제거했습니다. 창문 위치·높이·지붕은 실제 입면을 측량한 것이 아니며 실제 지형은 아직 **평면 모형**입니다.
- 시범 검증: `node tests/pilot-gate-library.mjs`. 실제 GPU 렌더링·Mac Chrome·모바일 실기기 확인은 아직 완료하지 못했습니다. 결과는 `TEST_RESULTS.md`에 기록했습니다.
