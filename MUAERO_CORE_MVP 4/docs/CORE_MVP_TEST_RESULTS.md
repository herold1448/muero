# MUAERO Core MVP 개발·검증 결과 — 2026-11-24

## 기존 자료와 변경 파일

새로 첨부한 `jnu-buildings(4).json`과 `export(4).json`은 기존 `data/campus_buildings.json`, `data/campus_paths.json`과 각각 SHA-256이 완전히 동일하다. 이전 88.8초 거리뷰 영상도 정문–도서관 연구 참고이며 원본·프레임을 ZIP에 포함하지 않는다. 새 안내 그림은 지리좌표가 없는 조감도라 건물 위치의 근거 또는 텍스처로 사용하지 않았다.

- **보존:** 두 OSM 원본, ID·좌표, v7 `src/routing.js`의 기존 기본 동작, 접근성 판정·관리자 API, 출입구·구간 수정 이력, 원본 `legacy.html` 화면, 시범 GeoJSON 및 전체 스냅샷 QA.
- **새 화면:** `index.html`, `mvp.css`, `src/mvp.js`의 건물 검색·3D 클릭·출발점 GPS/수동·길찾기·주행·제보 UI; `admin.html`, `src/admin.js`의 별도 제보 검토.
- **새 서버 저장:** `hazards.py`, `server.py`의 사진·상태 API. `data/hazards.json` 및 `data/hazard_photos/`는 첫 제보 후 생성되며 기존 보고서/OSM 원본을 변경하지 않는다.
- **기존 기능 확장:** `src/renderer.js`의 건물 삼각형→OSM ID 클릭 판정, 선택 강조 및 지형 높이 핀; `src/routing.js`의 선택적 선분 ID 차단과 거리 최단 옵션. 기존 호출 기본값은 유지.

## 자동 검사

| 검사 | 결과 | 확인 범위 |
|---|---|---|
| `for f in tests/*.mjs; do node "$f" || exit 1; done` | PASS | 기존 v7 경로·접근성·관리자 UI 모의 회귀, OSM 건물 1,422개 배치 데이터, 중앙도서관 실제 삼각형 raycast 클릭, 특정 선분만 차단, DEM 합성 그리드 |
| `python3 tests/server_v7.py` | PASS | 기존 API·관리자 출입구 저장/삭제·이력·구간 차단 |
| `python3 tests/hazards_api.py` | PASS | JPEG 제보 등록, 중복 차단, 공개 조회·사진, PIN 없는 검토 거부, 8m 이내 OSM 선분 ID 연결, verified 차단, resolved 해제, 서버 재시작 후 상태 보존 |
| JS 문법·페이지 ID 참조 검사 | PASS | `src/mvp.js`, `src/admin.js`, `src/renderer.js`; 새 HTML에서 참조한 DOM ID 모두 존재 |
| 로컬 HTTP 정적 파일·API | PASS | `/`, `mvp.css`, 새 JS, `admin.html`, `legacy.html`, `/api/hazards` HTTP 200. 연결된 동일 셸 프로세스 검사 |
| 실제 브라우저 렌더링·사용자 시나리오 | **실패/미검증** | Playwright Chromium 시작은 `socket() failed: Operation not permitted (1)`. 별도 데스크톱 브라우저에서 `127.0.0.1:4173`은 `ERR_CONNECTION_REFUSED`. 실제 GPU 화면·터치·모바일 성능·Mac Chrome 확인 불가 |
| 실제 DEM·캠퍼스 전수 확인·지형 정합 | **미검증** | 공식 경계·DEM 원본·차도 면형·실측 경사·턱·폭 없음. 안전 경로 입증 불가 |

브라우저를 사용할 수 있는 Mac에서 `node tests/browser_mvp.cjs`로 데스크톱·모바일 뷰포트의 GPS→건물 검색→경로→3D 따라가기→제보 창을 재검사할 수 있다. 이 스크립트는 아직 PASS 결과를 만들지 못했으므로 전후 스크린샷도 생성되지 않았다.

## 기능 상태

| 기능 | 상태 |
|---|---|
| 기존 OSM 기반 전체 기본 건물·보행로 3D 메시 | 코드 및 정적 기하 검사 PASS, 실제 화면 미검증 |
| 건물 3D 클릭/검색, 출발점 선택, 후보 경로, 휠체어 가상 주행 | 코드와 연결 계산 PASS, 실제 브라우저 조작 미검증 |
| 경사·턱·폭·차도 제외·계단 제외 | 기존 접근성 코드 회귀 PASS, 현장 값은 대부분 없음 |
| 사진 제보·상태·확인된 선분 차단 및 해제 | 서버/API PASS, 새 UI 브라우저 미검증 |
| 실제 DEM 지형과 경사로·회전교차로 | **미구현(실자료 없음)**. DEM 전처리·지형 로더는 준비됨 |
| 공용 인터넷 다중 사용자 서비스 | **미구현**. 기본 서버는 127.0.0.1 로컬 전용 |
| Mac Chrome·모바일 실기기·시각 비교 | **미검증** |

## 남은 현장 데이터와 제공 방법

1. `yongbong_boundary.geojson`: 공식 시설 담당자의 GIS 부지 경계 또는 OSM 임시 경계의 출처·이용 조건. 주변 건물을 제외하고 누락 교내 건물을 계수하려면 필요.
2. 용봉캠퍼스 포함 DEM `.img`/GeoTIFF 원본과 제작 연도·수평 CRS·수직 기준면·해상도·NoData·재배포 조건. 국토정보플랫폼에서 지역을 검색해 합법적으로 내려받은 후 `scripts/import_dem.py` 사용.
3. 차량 도로·인도 면형, 횡단보도·회전교차로 중앙섬과 실제 통행 연결을 담은 공공 GIS 또는 OSM 원본. 현재 928 way는 대부분 보행선이며 차도 외형을 증명하지 못함.
4. 건물 코드–OSM ID–위치 대응표와 사용 허가된 외관 사진/도면. 공식 도서관 명칭과 OSM 이름도 자동 일치하지 않아 현장 대조 필요.
5. 보행 선분별 경사율·연석 높이·최소 폭·노면, 건물 접근 가능 출입구 및 공사 차단의 날짜 있는 현장 측정값.

자료별 공개·이용 조건과 기존 조사 목록은 `FULL_CAMPUS_DATA_AUDIT.md`, `DATA_PROVENANCE.md`에 있다. 네이버 거리뷰 이미지·타일과 공식 조감도는 모델 텍스처로 복제하지 않았다.
