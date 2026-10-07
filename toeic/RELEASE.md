# 토익핏 Google Play 출시 순서

순서대로 하면 됩니다. ★ 표시는 직접 하셔야 하는 일(계정·키·결제 정보)이고, 나머지는 이미 준비돼 있습니다.

## 1. ★ 개발자 계정 만들기 (1회, 25달러)
- https://play.google.com/console 에서 개인 계정으로 가입 → 신원 확인(며칠 걸릴 수 있음).
- 유료 기능을 팔려면 **결제 프로필(판매자 계정)**도 만듭니다: Play Console → 설정 → 결제 프로필.

## 2. ★ 업로드 키 만들기 (1회, 윈도우)
앱 파일에 서명하는 열쇠입니다. **잃어버리면 업데이트를 못 하니** 파일과 비밀번호를 USB와 클라우드 두 곳에 보관하세요. 저장소에는 절대 올리지 않습니다.

1. 명령 프롬프트에서 자바 설치 (이미 있으면 건너뜀):
   ```
   winget install EclipseAdoptium.Temurin.21.JDK
   ```
   설치 후 명령 프롬프트를 새로 엽니다.
2. 키 만들기 (비밀번호를 두 번 묻고, 이름·조직 등은 아무렇게나 입력해도 됩니다):
   ```
   keytool -genkeypair -v -keystore toeicfit-upload.jks -alias toeicfit -keyalg RSA -keysize 2048 -validity 10000
   ```
3. 키 파일을 글자로 바꿔 클립보드에 복사 (PowerShell):
   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("toeicfit-upload.jks")) | Set-Clipboard
   ```
4. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret** 으로 4개 등록:
   | 이름 | 값 |
   |---|---|
   | `TOEICFIT_KEYSTORE_BASE64` | 3번에서 복사한 글자 (붙여넣기) |
   | `TOEICFIT_KEYSTORE_PASSWORD` | 키 만들 때 정한 비밀번호 |
   | `TOEICFIT_KEY_ALIAS` | `toeicfit` |
   | `TOEICFIT_KEY_PASSWORD` | 같은 비밀번호 (따로 정했다면 그 비밀번호) |

## 3. ★ 개인정보 처리방침 주소 켜기 (1회)
- GitHub 저장소 → Settings → Pages → Build and deployment → Source: **GitHub Actions**
- Actions 탭 → `toeic-pages` → Run workflow. 끝나면 주소가 생깁니다:
  `https://seungok001-eng.github.io/script/privacy.html`

## 4. 출시 파일(AAB) 만들기
- GitHub → Actions → `toeic-release-aab` → **Run workflow** → 버전 이름(처음은 `1.0.0`) → Run.
- 10분쯤 뒤 실행 화면 아래 **Artifacts → toeicfit-release-aab** 를 내려받아 압축을 풀면 `.aab` 파일이 있습니다.
- 버전 번호(versionCode)는 실행 번호로 자동으로 올라갑니다. 업데이트 때는 버전 이름만 `1.0.1` 처럼 올려 다시 실행하세요.

## 5. Play Console 에 앱 만들기
- 앱 만들기: 이름 **토익핏**, 기본 언어 한국어, 앱, **무료**(앱 안에서 결제), 정책 동의.
- 앱 콘텐츠(왼쪽 아래 '정책 및 프로그램 → 앱 콘텐츠'):
  - 개인정보처리방침: 3번 주소
  - 광고: **광고 없음**
  - 앱 액세스: 제한 없음 (로그인 없음)
  - 콘텐츠 등급 설문: 카테고리 '참고 자료·교육', 폭력·성적 콘텐츠·도박 등 모두 '아니요'
  - 타겟층: **18세 이상** (토익 수험생 대상. 어린이 대상 정책을 피할 수 있음)
  - 데이터 보안: **사용자 데이터를 수집하거나 공유하지 않음** (학습 기록은 기기에만 저장, 결제는 Google Play 가 처리)
  - 정부 앱·금융 기능·건강: 모두 아니요
- 스토어 등록정보: 이름·설명은 `toeic/STORE.md`, 아이콘 `toeic/app/icons/icon-512.png`, 대표 이미지 `toeic/store/feature-graphic.png`, 스크린샷 `toeic/store/screenshots/android/`.

## 6. 비공개 테스트 시작 (★ 테스터 12명 이상, 14일 연속)
1. 테스트 및 출시 → 테스트 → **비공개 테스트** → 트랙 만들기 → 테스터: 이메일 목록 만들기(15~20명 권장, 구글 계정 이메일).
2. 새 버전 만들기 → 4번의 `.aab` 업로드 → 출시 노트 → 검토 → 출시. (첫 검토는 며칠 걸릴 수 있음)
3. 승인되면 '테스터 참여 링크'를 테스터에게 보냅니다. 테스터는 링크에서 **참여** → 플레이스토어에서 설치.
4. **14일 동안 12명 이상이 계속 참여 상태**여야 합니다(중간에 빠지면 다시 셈). 며칠에 한 번씩 실제로 써 보고 의견을 남겨 주면 좋습니다.

## 7. 유료 상품 등록 (비공개 테스트 버전을 올린 뒤에 가능)
- 수익 창출 → 제품 → **인앱 상품** → 상품 만들기:
  - 제품 ID: **`toeicfit_full`** (앱 코드와 같아야 함, 나중에 못 바꿈)
  - 이름: 토익핏 전체 이용권 / 설명: 단어 3,600개·실전 문제·모의고사 전체를 평생 이용
  - 가격: **₩4,900** → 활성화
- 테스터가 실제 돈을 내지 않게: 설정 → **라이선스 테스트** 에 테스터 이메일 추가(테스트 결제로 처리됨).
- 가격을 올릴 때(₩7,900 → ₩9,900)는 여기서 숫자만 바꾸면 됩니다. 앱 업데이트는 필요 없고, 이미 산 사람은 그대로 평생 이용입니다.

## 8. 정식 출시 신청
- 14일이 지나면 대시보드에서 **프로덕션 액세스 신청** → 테스트 소감 설문 작성 → 승인되면 프로덕션 트랙으로 같은 버전을 출시합니다.

## 참고
- 앱 ID `com.toeicfit.app` 은 첫 업로드 뒤 바꿀 수 없습니다.
- 크기: 약 175MB (Part 1 사진 150장·음성, 하프 5회·정규 5회 포함). 200MB 를 넘으면 빌드가 경고를 띄웁니다.
- 테스트용 APK(서명 없음, 폰에 바로 설치)는 지금처럼 `toeic-test` 사전 출시에 자동으로 올라갑니다.
