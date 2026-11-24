# MUAERO Core MVP · 2026-11-24 최종 배포 준비 검사

## 수정 원인과 범위

기존 제보 모달에는 GPS 또는 지도 선택 안내가 있었지만 지도에서 위치를 지정한 후 확인할 임시 핀과 공개 위험 핀의 3D 클릭 흐름이 없었습니다. 로컬 JSON·사진 저장은 이미 구현됐으나, 공개 URL이 관리자 검토 전 사진에 노출됐고 해결 기록이 공개 목록에 남았습니다. 기존 사진·제보·관리 코드와 OSM 경로 그래프를 유지한 채 선택 모드, 공개 필터, 저장 경로와 Docker 배포 구성을 보강했습니다. 렌더러는 antialias 설정을 유지하고 pixelRatio 상한(데스크톱 2, 모바일 1.5)을 적용했습니다. 고정밀 공간정보나 실제 DEM은 추가하지 않았습니다.

| 영역 | 구현 및 검증 근거 | 결과 |
|---|---|---|
| 3D 위치 선택과 위경도 변환 | 기존 `renderer.pick` 지면 광선 투사, `toLL` 좌표 변환, 임시 핀·확인·재선택·취소, 건물 선택 모드 분리. `tests/hazard-map-pick.mjs` | 단위 검사 PASS. 실제 브라우저 클릭 미검증 |
| 제보 저장·사진 | 1280px JPEG 재인코딩, EXIF 거부, 최대 750KB 사진, 좌표·유형 검증, 등록 성공 후 공개 목록 갱신. `tests/hazards_api.py` | API 검사 PASS. 모바일 촬영 미검증 |
| 다른 사용자와 공유 | 공용 서버에 브라우저 A/B를 모사한 독립 HTTP 클라이언트가 같은 ID와 상태 조회, 재시작 뒤 JSON·사진·이력 유지. `tests/public_share.py` | HTTP 검사 PASS. 실제 브라우저 A/B 미검증 |
| 위험 핀 공개 | 미확인 주황, VERIFIED 빨강, 해결/반려 숨김, 사진은 관리자 공개 승인 전 비공개. 30초 갱신 | 데이터/렌더러 검사 PASS. GPU 화면 미검증 |
| 관리자 차단·해제 | 기존 보행 선분 8m 연결 검증, VERIFIED+blocked에서만 경로 제외, RESOLVED 해제, 검토 이력 보존 | `tests/hazards_api.py`, `tests/public_share.py`, 라우팅 테스트 PASS |
| 기존 기능 | OSM 파싱, 건물 선택, 접근성 경로, 카메라·하단 패널, v7 서버 CRUD | Node `.mjs` 15개 및 Python 검사 PASS |
| 화질 | 기기 픽셀 비율 제한, 안티앨리어싱 유지, 카메라 near/far 조정, 26px 핀 터치 목표 | 코드 적용. 수정 후 스크린샷·성능·계단 현상 실측 미검증 |
| HTTPS·영구 볼륨 | Caddy+Docker Compose, `muaero_state` 볼륨, 앱 비밀키 `.env` 및 사진·관리 이력 이전 스크립트 | YAML 파싱·로컬 서버 공개 모드 검사 PASS. Docker 구동·DNS·인증서·실제 재배포 미검증 |

## 실행한 자동 검사

`for f in tests/*.mjs; do node "$f" || exit 1; done`: 15/15 PASS. 실제 제공 OSM 기준 928 보행/혼용 way, 1,422 건물 way가 원본 ID/좌표로 파싱됐습니다. OSM 두 파일의 SHA-256은 각각 `c1c538c5cc1ecaf94414a2f9f7ac95a27fc185cc9c24189a8b7845e90a0ecaf2`, `a83cdaa7688005ef4c6a78dfc76e78b1946026238d9daa2ccaa67e338efa716c`로 유지됐습니다.

`python3 tests/server_v7.py`, `python3 tests/hazards_api.py`, `python3 tests/public_share.py`: 각 1/1 PASS. 공개 모드 A/B HTTP 클라이언트 시험에서 신규 제보가 A/B에 동일하게 보이고 사진 미승인 상태에서는 URL이 숨겨지며, 관리자 승인/검증/차단/해결 변경을 B가 다음 조회에서 확인했습니다. 같은 저장 디렉터리로 서버를 재시작한 뒤 관리자 기록과 2건의 변경 이력이 유지됐습니다. 각 검사는 별도 임시 디렉터리를 사용해 실제 사용자 데이터를 건드리지 않았습니다.

`node tests/browser_release.cjs`: **BLOCKED / PASS 아님.** 이 Linux 실행 환경의 Chromium이 시작할 때 `chrome/browser/process_singleton_posix.cc:297`의 `socket() failed: Operation not permitted (1)`로 종료됐습니다. 따라서 지도 클릭, 모바일 레이아웃, WebGL 픽셀 품질, 브라우저 콘솔, 사진 업로드 사용자 흐름, 브라우저 A/B 상호 표시의 실제 화면은 이번 환경에서 검증하지 못했고 수정 후 스크린샷도 만들지 않았습니다. 사용자가 첨부한 기존 화면과 43.7초 녹화는 수정 전 참조용으로 확인했습니다. 수정 전후 같은 위치의 비교 이미지는 제공하지 않습니다.

## 배포 시 남은 확인

1. 실제 Mac Chrome과 모바일 Chrome/Safari에서 `node tests/browser_release.cjs` 또는 수동 A/B 흐름을 실행하고 핀 터치·카메라 사진 촬영·콘솔 오류·화질/성능을 확인합니다. Safari는 별도 수동 검사입니다.
2. 도메인과 영구 Docker 디스크가 있는 서버에 Compose를 실행한 다음 HTTPS 인증서, 다른 기기 공유, 30초 갱신, 실제 서버 재시작 및 새 이미지로 재배포 후 유지, 백업 복구를 확인합니다. 이 작업 환경에는 Docker와 사용자 도메인이 없어 수행하지 못했습니다.
3. v7 구간·출입구 편집은 로컬에서 유지됩니다. 공개 모드에서는 기존 API 인증이 없는 편집 도구를 잠갔습니다. 공개 운영에서 해당 편집이 필요하다면 인증을 별도로 보강해야 합니다.
4. 신고는 미검증 정보이며 검증 핀도 관리자 현장 기록입니다. 실제 경사율·턱·보도 폭·DEM·차도 경계는 여전히 미확보입니다. 현장 이동 안전을 보증할 수 없습니다.

## 변경 파일

`src/mvp.js`, `src/renderer.js`, `src/admin.js`, `index.html`, `admin.html`, `mvp.css`, `hazards.py`, `server.py`, `Dockerfile`, `compose.yaml`, `Caddyfile`, `.dockerignore`, `scripts/migrate_state.py`, `tests/hazards_api.py`, `tests/server_v7.py`, `tests/public_share.py`, `tests/hazard-map-pick.mjs`, `tests/renderer-follow-view.mjs`, `tests/browser_release.cjs`, `tests/fixture-hazard.jpg`, `README.md`, 이 문서.

OSM 원본과 기존 라우팅 구현은 수정하지 않았습니다. 이전 로컬 데이터는 ZIP에 임의로 포함하거나 삭제하지 않았습니다. 실제 데이터가 있는 사용자의 이전 작업은 README의 무덮어쓰기 마이그레이션을 사용해야 합니다.
