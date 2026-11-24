# 무애로 Core MVP · 최종 배포 준비 빌드

**2026-11-24 제보 공유 수정:** 기존 3D 지도에서 장애물 위치를 클릭하고 임시 핀을 확인한 뒤 사진 제보를 등록합니다. 미확인 제보는 주황색, 관리자 검증 기록은 빨간색 핀으로 표시합니다. 다른 브라우저는 서버의 같은 저장소를 읽고 30초마다 갱신합니다. 사진 공개는 관리자가 별도로 승인합니다. HTTPS와 영구 볼륨을 갖춘 공용 서버 구성 파일이 포함됐지만 실제 인터넷 배포 및 Mac Chrome 검증은 아직 수행되지 않았습니다. 자세한 범위와 테스트 증거는 `docs/FINAL_RELEASE_TEST_RESULTS.md`를 보세요.

**2026-11-24 공간 렌더링 수정:** 인도·횡단·보행 공간의 중심선 기반 표면과 건물 재질/층 표시를 개선했습니다. DEM과 차량 도로 원본은 여전히 없으므로 실제 지형·회전교차로를 재현한 완성형 디지털 트윈이 아닙니다. 검사 범위와 미완료 항목은 `docs/SPATIAL_FIX_AUDIT_2026-11-24.md`를 보세요.

**주행 화면 수정:** OSM 건물 외곽을 고려한 3인칭 카메라와 시점 초기화, 주행 시 자동으로 접히는 하단 패널을 추가했습니다. 접힌 화면의 목적지·남은 거리·미검증 상태를 확인하고 버튼으로 상세 정보를 다시 펼칠 수 있습니다. 수정 전 녹화의 화면 가림 원인, 자동 검사 및 브라우저 미검증 사항은 `docs/CAMERA_SHEET_2026-11-24.md`에 기록했습니다.

**현장 검증 전입니다. 실제 휠체어 이동의 안전 경로로 사용하지 마세요.** 이 프로젝트는 제공된 OSM 좌표를 이용한 3D 길찾기·접근성 정보·사진 제보를 구현합니다. 전체 캠퍼스 실측 디지털 트윈은 아닙니다.

## Mac에서 실행

1. ZIP을 풀고 `MUAERO_CORE_MVP` 폴더로 이동합니다. Python 3와 WebGL 사용이 가능한 Chrome 또는 Safari가 필요합니다. 기본 앱에는 npm 설치가 필요하지 않습니다.
2. 터미널에서 `MUAERO_ADMIN_PIN='본인이정한6자이상PIN' python3 server.py`를 실행합니다. PIN을 설정하지 않으면 관리자 제보 상태 변경이 비활성화됩니다. `start.command`는 PIN을 물어보고 실행합니다.
3. Chrome에서 `http://127.0.0.1:4173/`에 접속합니다. 제보 검토는 `http://127.0.0.1:4173/admin.html`, 기존 v7 구간·출입구 도구는 `http://127.0.0.1:4173/legacy.html`입니다.
4. 종료는 터미널에서 Ctrl+C. 포트 충돌 시 `GILON_PORT=4174 MUAERO_ADMIN_PIN='...' python3 server.py`를 사용합니다.

기본 서버는 `127.0.0.1`에만 연결됩니다. 같은 서버에 접속한 브라우저 탭끼리 제보가 공유됩니다. 기본 로컬 모드를 공용망에 직접 노출하지 마세요. 아래 공용 배포 모드는 기존 인증 없는 편집 API를 차단합니다.

## 이용 흐름

- 현재 위치를 눌러 GPS 권한을 주거나 **지도에서 출발점 선택**을 누릅니다. GPS 오차가 크거나 가까운 보행로가 없으면 자동으로 출발점을 확정하지 않습니다.
- 건물을 지도에서 클릭하거나 OSM 건물명을 검색합니다. 건물 강조와 출입구 미확인 상태를 본 뒤 **여기로 길찾기**를 누릅니다. 실제 출입구가 등록된 경우에도 보행로 연결은 별도 확인이 필요합니다.
- A*는 기존 OSM 노드 연결과 접근성 제한을 사용합니다. 계단·일반 차도·차단된 선분을 제외한 **거리 최단 후보**를 찾습니다. 실측 정보가 없는 구간은 미확인으로 표시합니다. 3D 따라가기는 GPS 안내가 아니라 가상 미리보기입니다.
- **사진으로 장애물 제보 → 지도에서 위치 선택**을 누른 뒤 3D 지도에서 위치를 찍고 임시 핀을 확인·재선택합니다. GPS가 없어도 제보할 수 있습니다. 브라우저가 사진을 최대 1280px JPEG로 재인코딩해 EXIF를 제거하고 서버는 JPEG와 750KB 한도를 검사합니다. 미확인 핀은 즉시 공유되며 경로를 차단하지 않습니다. 검토 전 사진은 관리자에게만 보입니다.
- 관리자는 PIN으로 제보를 열고 현장 근거, 연결된 OSM 보행 선분 ID, 상태를 기록합니다. **VERIFIED + 특정 선분 연결 + 차단 표시**가 모두 있는 경우에만 해당 선분을 경로에서 제외합니다. RESOLVED로 바꾸면 제외가 해제됩니다. 이 상태는 로컬 관리자 확인 주장이지 제3자 안전 검증이 아닙니다.

로컬 제보 원본은 `data/hazards.json`, 사진은 `data/hazard_photos/`에 서버 재시작 후에도 남습니다. 공용 모드에서는 `MUAERO_HAZARD_DIR`의 영구 디스크에 저장합니다. `data/reports.json`, `data/reviews.json`, `data/entrances.json`과 OSM 원본은 덮어쓰지 않습니다. 이전 v7 현장 기록을 옮길 때는 기존 `scripts/migrate_v7.py`와 `docs/V7_README.md`를 참조하세요.

## 공용 HTTPS 배포 준비

도메인이 연결된 Docker Compose 서버에 Docker Engine과 Compose를 설치하고, 포트 80·443을 열어 DNS A/AAAA 레코드를 서버로 향하게 합니다. 이 빌드는 **실제 인터넷 서버에 아직 배포하지 않았습니다.** 배포 환경에서 볼륨 백업·HTTPS·모바일 기기 검사를 별도로 수행하세요.

1. 프로젝트 폴더에 Git에 올리지 않을 `.env`를 만들고 아래 값을 넣습니다. PIN은 12자 이상이며 추측하기 어려운 문자열로 정하세요.

   ```dotenv
   MUAERO_DOMAIN=map.example.org
   MUAERO_ADMIN_PIN=replace-with-a-long-random-secret
   ```

2. 기존 로컬 제보·관리 기록이 있는 경우 첫 기동 **전에** 파일을 백업하고 동일 프로젝트의 `data/`에 둔 후 다음 명령으로 영구 볼륨에 복사합니다. 이미 있는 대상 파일은 덮어쓰지 않고 오류를 냅니다.

   ```bash
   docker compose build app
   docker compose run --rm --no-deps -v "$PWD/data:/import:ro" app python3 scripts/migrate_state.py /import /var/lib/muaero/state
   ```

3. `docker compose up -d` 후 `https://map.example.org/api/health`가 `public-server`를 반환하는지 확인합니다. 실제 도메인을 사용하세요. Caddy가 HTTPS 인증서를 관리하며 앱은 내부 Docker 네트워크에만 노출됩니다.
4. `docker compose logs -f app caddy`로 진단하고 `docker compose down`으로 종료합니다. **`docker compose down -v`는 실행하지 마세요.** 제보·사진·검토 이력은 `muaero_state` 이름의 볼륨에 있습니다. 재배포 전 해당 볼륨을 별도로 백업하세요.

| 환경변수 | 용도 |
|---|---|
| `MUAERO_DOMAIN` | Caddy가 인증서를 발급받을 공용 도메인 (`.env`) |
| `MUAERO_ADMIN_PIN` | 관리자 제보 검토 PIN, 공용 모드 최소 12자 (`.env`) |
| `MUAERO_PUBLIC=1` | 공용 서버 보안 모드 (Compose 설정) |
| `MUAERO_HAZARD_DIR` | 영구 볼륨의 제보 JSON·사진 경로 (Compose 설정) |
| `MUAERO_TRUST_PROXY=1` | 내부 Caddy가 보낸 클라이언트 IP만 신뢰 (Compose 설정) |
| `PORT` | Python 앱 내부 포트 (기본 4173) |

공용 모드에서 `/admin.html`의 제보 검토와 사진 승인은 PIN으로 가능합니다. 로컬 v7 `legacy.html`의 구간·출입구 편집은 인증 구조가 달라 공용 모드에서는 차단됩니다. 기존 데이터와 로컬 기능은 유지되지만 공용 서버에서 이 편집 작업은 할 수 없습니다. 공용 저장소는 단일 Docker 호스트의 영구 볼륨을 전제로 합니다. 디스크가 영구 보관되지 않는 플랫폼에는 이 구성 그대로 배포하면 안 됩니다. 제보는 시간당 IP별 8건, 관리자 요청은 15분당 30건으로 제한됩니다.

## 데이터와 구현 한계

| 항목 | 상태 |
|---|---|
| 기존 OSM 건물 1,422 way·보행/혼용 928 way | 원본 ID·좌표 유지. 주변 건물도 포함되어 있음 |
| 공식 건물명 목록 | 90건 코드 대조, 정확한 이름 일치 23건. 경계·좌표로 확인한 동일 건물 0건 |
| 건물·경로 3D | 동일 좌표계, 외곽 기반 압출·개별 건물 클릭, 표면 카테고리 분리. 실제 브라우저 GPU 검증 전 |
| 실제 DEM·고도 | 미확보. 지형은 평면 모형. `scripts/import_dem.py`는 실제 자료를 받았을 때만 사용 |
| 차도 면형·회전교차로·인도 경계 | 원본 자료 미확보. 정확한 3D 구조 구현 전 |
| 건물 높이·외벽·창문 | 일부 OSM 태그 또는 시각화 추정. 공식 입면·층고 자료 미확보 |
| 경사율·턱·폭·출입구 | 대부분 현장 미확인. 접근 가능 여부를 단정하지 않음 |
| 공용 제보 서비스 | HTTPS+영구 볼륨 Compose 구성을 준비했고 독립 HTTP 클라이언트 간 공유·재시작 유지 검사 통과. 실제 공용 배포 미실시 |

첨부 캠퍼스 안내 그림과 네이버 거리뷰는 장소·외관을 이해하는 참고용으로만 검토했고 텍스처나 지도 타일로 배포하지 않습니다. 상세 출처와 자료 확보 방법은 `docs/FULL_CAMPUS_DATA_AUDIT.md`, 영상 분석은 `docs/GATE_TO_LIBRARY_VIDEO_ANALYSIS.md`에 있습니다. OSM © OpenStreetMap contributors, ODbL 1.0. Three.js 라이선스는 `vendor/THREE_LICENSE.txt`에 있습니다.

## 자동 검사

```bash
for f in tests/*.mjs; do node "$f" || exit 1; done
python3 tests/server_v7.py
python3 tests/hazards_api.py
python3 tests/public_share.py
```

Mac에서 실제 두 브라우저 컨텍스트의 클릭·업로드·관리·재시작 시나리오를 확인하려면 Node.js와 Playwright Chromium을 설치하고 `node tests/browser_release.cjs`를 실행합니다. 성공 시 결과 이미지는 `tests/release-A-pin.png`, `tests/release-B-pin-mobile.png`입니다. 실제 현장의 경사·턱·폭과 건물 출입구는 별도 검증해야 합니다.

Node.js와 Python 테스트의 Pillow는 **개발 테스트에만** 필요합니다. `docs/FINAL_RELEASE_TEST_RESULTS.md`에 실제 통과/미검증 범위를 기록합니다. 본 작업 환경에서는 Chromium 시작 시 운영체제 소켓 권한 오류가 발생해 PC·모바일 3D 화면 및 Mac Chrome을 검증하지 못했습니다.
