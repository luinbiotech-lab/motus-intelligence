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
1. Google Cloud 콘솔(Blogger OAuth 클라이언트와 같은 프로젝트)에서 **Google Drive API**를 사용 설정합니다.
2. PC에서 다음 명령을 실행합니다.
   ```
   git pull
   npm ci
   npm run drive:oauth
   ```
3. 브라우저에서 luinbiotech@gmail.com으로 **허용**을 누릅니다.
   - 토큰은 GitHub Secret `MOTUS_DRIVE_REFRESH_TOKEN`에 바로 저장되고 화면에 나오지 않습니다.
   - PC에 GitHub CLI `gh`가 필요합니다(`gh auth login`).
4. GitHub Actions의 **MOTUS Google Drive connection check**를 실행해 업로드, 공유, 공개 읽기를 확인합니다.
