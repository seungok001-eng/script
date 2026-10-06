# 토익핏 (ToeicFit)

성인 토익 수험생용 **목표 점수 맞춤 토익 단어장** 앱입니다. 빌드 도구 없는 정적 웹앱이라 PC 브라우저에서 바로 돌아가고,
같은 파일을 Capacitor로 감싸 **Google Play / App Store** 앱으로 출시합니다.

## 핵심 기능

| 기능 | 내용 |
|---|---|
| 3분 어휘 진단 | 기본·핵심·고득점에서 고루 뽑은 30문항(모름 선택 가능, 찍기 보정)으로 이미 아는 난이도를 추정 → 그 단계를 건너뛰도록 추천 (설정에서 다시 진단·되돌리기) |
| 목표 점수 맞춤 | 첫 실행 때 목표 점수(550~950+)·시험일·하루 학습량을 입력 → 범위와 일정 자동 계산. 650점 이하 = 기본(1,070개), 700~800 = 기본+핵심(2,551개), 850+ = 전체(3,600개). 범위 안에서 쉬운 단어부터 출제 |
| 90일 3,600단어 | 30개 토익 주제(채용·인사·회의·마케팅·계약·배송·회계·출장·호텔·IT·법률·금융 … + Part 5·6 빈출 동사/형용사/부사/숙어)를 기본(Day 1~30) → 심화(31~60) → 완성(61~90, LC 구동사·Part 7·고득점) 3개 코스로 |
| 단어마다 | 뜻, 품사, 난이도(기본/핵심/고득점), 출제 파트, 발음기호, 토익식 예문+해석, 빈출 연어, 파생어, Part 7 패러프레이징, 반의어, 출제 포인트, **Part 5 실전 문제 1개(해설 포함)** |
| 원어민 음성 | 단어 3,600개 + 예문 3,600개 + Part 1 문장 120개 + LC 표현(질문·대답·오답 보기) 전부 mp3 (Kokoro-82M 한 모델로 통일, 32kbps). 예문은 미국·영국 남녀 목소리를 섞어 토익 LC 억양에 대비 |
| 학습 모드 | 카드 암기(스와이프·키보드, 모르는 단어 회차 재출), 뜻 고르기, 단어 고르기, 듣고 고르기, 철자 쓰기(힌트), 예문 빈칸, Part 5 실전, **Part 7 동의어(패러프레이징) 퀴즈**, 듣기 모드(출퇴근용 자동 재생: 단어→한국어 뜻→예문), Day 테스트(80점 통과) |
| 복습 | 라이트너 간격 반복(1·3·7·14·30·60일), 오늘 할 일(새 단어/복습/확인 퀴즈/오답노트), 오답노트 자동 수집·자동 해제, ★ 중요 단어 |
| 특훈 | Part 1 사진 묘사 필수 120문장(진행형 수동태 함정 포함), **LC Part 2~4 빈출 표현 870개**(29개 주제 — Part 2 질문 유형별 · Part 3 상황별 · Part 4 담화 유형별, 대화는 두 목소리) + **LC 실전 퀴즈**(Part 2 응답 고르기: 질문과 보기 (A)(B)(C)를 듣고 고르기, 문항마다 토익식 오답 2개 · Part 3·4 듣고 해석 고르기 · 틀린 문제 다시 풀기), Part 5 혼동 어휘 60세트 + 퀴즈, Part 7 동의어 20제 |
| **실전 문제** | Part 3 대화 90세트 · Part 4 담화 60세트(문장마다 원어민 음성, 3인 대화·의도 파악·시각 자료 포함) · Part 5 문법 30개 주제 강의 + 450문제 · Part 6 장문 빈칸 48지문 · Part 7 독해 100세트(단일·이중·삼중, 채팅·양식·송장 포함). 채점 후 **정답 근거 문장 강조**, 지문·스크립트 전체 해석, 문장 단위 다시 듣기·따라 말하기 |
| 모의고사·예상 점수 | 하프 모의고사 4회(LC는 한 번만 재생, RC 37분 타이머, 답안지) → LC·RC 예상 점수, 파트별 정답률, 전체 해설. 최근 LC·RC 정답률로 상시 예상 점수, 문제 유형별 약점 분석(예: Part 7 추론 55%) → 바로 연습 |
| 받아쓰기 | LC 표현·Part 3·4 문장을 듣고 쓰면 단어 단위로 채점(빠진 단어 표시), 천천히 듣기·따라 말하기 |
| 통계 | 암기 완료/학습/정답률/연속 학습일, 난이도별 진도, 최근 7일 그래프, 4주 학습 달력, 시험일 대비 1회독 예상일, Day 테스트 현황 |
| 기타 | 단어 검색(영어·한국어·파생어), 다크 모드, 재생 속도, 백업/복원(JSON), 오프라인(PWA), PC 사이드바 레이아웃 + 단축키 |

## 폴더

```
toeic/
  app/                  ← 앱 그 자체 (Capacitor webDir, 정적 호스팅 루트)
    index.html  css/app.css  js/core.js(로직)  js/app.js(화면)  js/data.js(생성됨)  js/practice.js(실전 문제, 생성됨 — 실전 화면에서 처음 불러옴)
    audio/w/{id}.mp3 단어 · audio/s/{id}.mp3 예문 · audio/p1/NNN.mp3 Part 1 · audio/p34/<id>-NN.mp3 Part 3·4 문장 · audio/p1q/<id>-N.mp3 Part 1 사진 문제 보기 · audio/lc/NNN.mp3 LC 한 사람의 말 · NNN-q/-a/-x1/-x2.mp3 LC 대화의 질문·정답·오답
    images/p1/<id>.webp  Part 1 사진 (토익 사진 공방에서 넣음, 960×720)
    fonts/ (Pretendard 서브셋)  icons/  manifest.webmanifest  sw.js
  data/
    plan.json           90일 × 40단어 표제어 계획 (기본/심화/완성)
    days/day-XX.json    단어 원본 데이터 (SPEC.md 규격)
    part1.json          Part 1 사진 문제 120개 (보기·정답·해석·해설 + 사진 생성 프롬프트·검수 목록)
    extras.json         Part 1 표현 · LC 표현 · 혼동 어휘
    practice/           실전 문제 원본: p3.json p4.json grammar.json p6.json p7.json (모의고사 문항은 build_data.mjs 가 고정 시드로 배정)
    ipa.json            발음기호 (CMU 사전에서 생성)
    audio-manifest.json 음성 파일 ↔ 문장·목소리 기록
  scripts/
    validate_day.py     데이터 검증
    build_ipa.py        발음기호 생성
    build_audio.py      음성 생성(Kokoro-82M 합성, 바뀐 문장만)
    build_data.mjs      app/js/data.js 생성
    build_audio_packs.py (선택) 파일 수 제한이 있는 웹 호스팅용 음성 묶음(Day별 + p1 + lc) + js/audio-packs.js
    make_icons.mjs      아이콘·스플래시 원본 생성 (파란 그라데이션 + "T." 로고)
    store_shots.mjs     스토어 스크린샷(액자 합성) 생성
    feature_graphic.mjs Google Play 대표 이미지(1024×500) 생성
  tools/
    photo-forge.cmd     토익 사진 공방 실행 (Windows) — 사용법은 tools/PHOTO-FORGE.md
    forge/              사진 공방 (교재 공방 포크, 포트 8767). 플로우로 Part 1 사진 생성 → 검수 → app/images/p1
```

## 실행 (PC)

```bash
cd toeic/app && python3 -m http.server 8080   # http://localhost:8080
```

`index.html`을 파일로 직접 열어도 동작합니다(음성은 http로 열 때 가장 안정적).

## 데이터를 고친 뒤

```bash
python3 toeic/scripts/validate_day.py            # 1) 검증
python3 toeic/scripts/build_ipa.py               # 2) (표제어가 바뀌었으면) 발음기호
venv/bin/python toeic/scripts/build_audio.py     # 3) 바뀐 문장만 음성 다시 생성
node toeic/scripts/build_data.mjs                # 4) app/js/data.js 다시 만들기
npm test                                         # 5) 로직·데이터 테스트 (저장소 루트)
BASE_URL=http://localhost:8080/index.html node toeic/tests/e2e.mjs   # 6) 화면 회귀 테스트 (Playwright)
```

### 음성

- 앱의 **모든 음성(단어·예문·Part 1 문장)은 [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)**(Apache-2.0, 상업 이용 가능)으로
  이 저장소에서 직접 합성합니다. 한 모델로 통일해 음색이 일정합니다.
  - 단어: `af_heart`(미국 여성) 한 목소리
  - 예문·Part 1·LC: `af_heart`(미국 여성) · `am_liam`(미국 남성) · `bf_alice`(영국 여성) · `bm_fable`(영국 남성)을 문장마다 고정 배정 (미국 4 : 영국 2, 화면에 "미국·여", "영국·남" 표시 — 토익 LC 억양 대비). LC 대화는 묻는 사람과 답하는 사람 목소리를 다르게
- 준비: `python3 -m venv venv && venv/bin/pip install kokoro-onnx soundfile`, 모델·목소리는 npm 패키지 `expo-kokoro`(`build/kokoro-quantized.onnx`, `build/voices/*.bin`)를 풀어 `KOKORO_DIR`로 지정.
- 문장을 고치면 `audio-manifest.json`과 비교해 **바뀐 문장만** 다시 만듭니다. 음성 파일이 없거나 옛 문장이면 앱은 기기 음성(TTS)으로 대신 읽습니다.
- (참고) `--reuse-gemini` 옵션을 주면 voca-yun 저장소의 기존 Gemini TTS 단어 음성을 재사용할 수 있습니다. 기본값은 사용하지 않음.

## 스토어 출시 (Capacitor 8)

`android/`, `ios/` 네이티브 프로젝트와 아이콘·스플래시는 이미 만들어져 있습니다.

```bash
cd toeic
npm install
npx cap sync                                # app/ 변경 사항을 android/ios 로 복사 (웹 파일을 고칠 때마다)
npx cap open android                        # Android Studio(JDK 21) → Build > Generate Signed Bundle (AAB)
npx cap open ios                            # Xcode 16+(맥) → Signing 팀 선택 → Product > Archive → 업로드
node scripts/make_icons.mjs                 # (아이콘을 바꿨을 때) 앱 아이콘 SVG → app/icons·assets 원본
npm run assets                              # (아이콘을 바꿨을 때) assets/*.png → 네이티브 아이콘·스플래시 재생성
```

포함된 네이티브 플러그인

| 플러그인 | 용도 |
|---|---|
| `@capacitor/app` | 안드로이드 뒤로가기(학습 중이면 '그만할까요?', 홈이면 앱 최소화) |
| `@capacitor/local-notifications` | 매일 학습 알림 (설정 화면에서 켜기·시간 지정) |
| `@capacitor/filesystem` + `@capacitor/share` | 학습 기록 백업 파일 저장·공유 |
| `@capacitor-community/text-to-speech` | 기기 TTS — 음성 파일이 없을 때 영어 문장 대체 재생 |

체크리스트
- 앱 ID `com.toeicfit.app`(스토어에 올린 뒤에는 못 바꿈), 이름 `토익핏` — `capacitor.config.json`, `app/js/app.js`의 `BRAND`, `manifest.webmanifest`에서 바꿀 수 있습니다.
- 아이콘: `app/icons/icon-1024.png`(스토어용, 꽉 찬 사각), `icon-maskable-512.png`(안드로이드 적응형). 스플래시는 `@capacitor/assets`로 생성 권장.
- 스크린샷: `store/screenshots/`에 완성본(iOS 1290×2796 · Android 1080×1920) 8장. `node scripts/store_shots.mjs`로 다시 생성.
- 개인정보처리방침 URL: `PRIVACY.md` (공개 저장소의 GitHub 주소를 그대로 스토어에 입력 가능)
- 테스트용 APK: `toeic/**`를 푸시하면 GitHub Actions(`.github/workflows/toeic-android.yml`)가 디버그 APK를 빌드해 Releases의 `toeic-test` 프리릴리스에 올린다.
- 개인정보: 모든 기록은 기기 안(localStorage)에만 저장되고 서버로 보내지 않습니다 → 스토어 "데이터 수집 없음" 신고 가능. (광고·분석 SDK를 넣으면 다시 확인)
- 상표: "TOEIC"은 ETS의 등록 상표입니다. 앱 이름·아이콘에 ETS 로고를 쓰지 말고, 설정 화면의 "ETS와 관련 없음" 문구를 유지하세요.
- 앱 크기: 음성 포함 약 145MB (음성 138MB, 32kbps 모노: 단어 18MB · 예문 69MB · LC 표현 25MB · Part 3·4 문장 25MB · Part 1 표현 1MB). Part 1 사진 120장(약 12MB)과 그 음성(약 6MB)을 넣으면 약 165MB. Google Play 기본 모듈 한도(200MB) 안이다. 더 줄여야 하면 build_audio.py 의 BITRATE 를 낮추거나 음성(app/audio)을 Play Asset Delivery(install-time 팩)로 분리한다. App Store는 문제없음.

### 유료화

`app/js/app.js`의 `CONFIG.premium`:

```js
const CONFIG = { premium: { enabled: false, freeDays: 5, price: "₩9,900", priceNote: "평생 이용 · 1회 결제" } };
```

`enabled: true`로 바꾸면 Day 6~30이 잠기고 프리미엄 화면이 열립니다. 결제는 네이티브 쪽에서
`window.ToeicfitIAP = { purchase: async () => true/false }`를 주입하면 연결됩니다
(예: RevenueCat Capacitor 플러그인 `@revenuecat/purchases-capacitor`로 구매 후 true 반환).

## 라이선스

- 단어·예문·문제 데이터와 코드: 이 저장소 소유자
- CMU Pronouncing Dictionary — BSD 2-Clause (`data/pron/CMUDICT-LICENSE`)
- Kokoro-82M 모델·목소리 — Apache-2.0
- Pretendard — SIL OFL 1.1 (`app/fonts/Pretendard-LICENSE.txt`)
