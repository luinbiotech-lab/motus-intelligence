# MOTUS PDF 리포트

## 디자인 기준
- 루치오 승인(2026-11-01): `samples/MOTUS_Weekly_2026-11-01.pdf`
  - 증권사 애널리스트 리포트 형식(A4 3쪽)
  - 그래프 중심이며, 그래프마다 실제 지수를 표기
  - 상승은 빨강, 하락은 파랑
  - 표기 규칙: '그림 N.' 번호와 '자료:' 출처
- 이전 시안: `data/a4-master/2026-09-11/`(카드형 A4 MASTER)
- 시제품 생성 스크립트: `scripts/reports/weekly_pdf_prototype.py`
  - 입력: 주간 evidence.json과 Yahoo 3개월 종가
  - 렌더: HTML을 만든 뒤 Chromium PDF로 출력

## 저장 위치
- 구글 드라이브 `MOTUS Reports/<연도>/<시리즈>`
- `drive.file` 권한만 사용합니다. 앱이 만든 파일과 폴더만 접근할 수 있습니다.
- 파일은 '링크가 있는 모든 사용자 보기'로 공유합니다.

### 최초 1회 연결 (루치오 PC)
1. Google Cloud 프로젝트 `luin-intelligence-os`에서 다음을 설정합니다.
   - **Google Drive API**를 사용 설정합니다.
   - **Google 인증 플랫폼 → 클라이언트 → 클라이언트 만들기**를 누르고 유형을 **데스크톱 앱**으로 고릅니다. 이름은 예를 들어 MOTUS Drive로 합니다.
   - 만든 클라이언트의 **JSON을 다운로드**합니다.
   - 기존 'LUIN Blogger Manager Web'은 웹 유형이라 PC 콜백을 쓸 수 없어서 따로 만듭니다.
2. PowerShell에서 다음을 실행합니다(`gh auth login`이 되어 있어야 합니다).
   ```
   cd $HOME\PROJECTS\motus-intelligence
   git fetch motus-origin
   git switch -c drive-setup motus-origin/main
   npm ci
   npm run drive:oauth -- --client-json "$HOME\Downloads\client_secret_….json"
   ```
3. 브라우저에서 luinbiotech@gmail.com으로 **허용**을 누릅니다.
   - client id, client secret, refresh token은 GitHub Secret `MOTUS_DRIVE_CLIENT_ID`, `MOTUS_DRIVE_CLIENT_SECRET`, `MOTUS_DRIVE_REFRESH_TOKEN`에 바로 저장되고 화면에 나오지 않습니다.
4. 받은 JSON 파일은 지웁니다.
5. GitHub Actions의 **MOTUS Google Drive connection check**를 실행해 연결을 확인합니다.
6. 참고: 인증 플랫폼 '대상'의 게시 상태가 '테스트'이면 refresh token이 7일 뒤 만료됩니다. '프로덕션'으로 게시해야 합니다(drive.file은 Google 검수 없이 게시할 수 있습니다).
