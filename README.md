# 유튜브 24,000자 대본 자동 생성기 (대본 공장)

Google Gemini API를 활용해 유튜브 상위 0.1% 채널의 워크플로우를 제어하는 프로덕션 수준 Next.js 웹 애플리케이션입니다. AI의 성능 저하(지시문 망각·동어 반복·문맥 실종)를 **프로그래밍 레벨의 컨텍스트 다이어트**로 제어하고, 사용자가 8단계를 검증하며 고품질 대본을 뽑아냅니다.

## 핵심 특징

- **컨텍스트 다이어트 (Context Isolation)**: 단순 채팅 루프가 아니라, 각 단계가 독립된 단발성 API 요청입니다. 승인된 Artifact만 다음 단계 프롬프트에 조립·전송합니다. 6단계 본문 컨텍스트는 **직전 모듈 2챕터로 바운딩**하여 입력 누적으로 인한 품질 저하를 차단합니다.
- **러닝 떡밥 원장 (Story Bible)**: 모듈 생성 직후 경량 호출로 *심은/회수한/미회수* 떡밥과 핵심 설정을 압축 불릿으로 추적해 매 호출에 동봉합니다. 챕터 위치와 무관하게 복선 회수를 보장합니다.
- **8단계 워크플로우**: 주제 → 팩트 리포트(웹 검색 그라운딩) → 화자 프로필 → 8챕터 시놉시스(+복선 설계표) → 인트로 세트 → 초안(스트리밍) → 정밀 퇴고(스트리밍) → 메타데이터.
- **스트리밍 + 자동 이어쓰기**: 24,000자 초장문은 2개 챕터씩 `generateContentStream()`으로 처리하고, `MAX_TOKENS`로 잘리면 서버가 자동으로 이어 씁니다(continuation). 429/5xx는 지수 백오프 재시도.
- **QA 자동 검증 + QA 가드형 자동 생성**: 글자수·어미 4단 비율·금지어·특수기호·챕터 마커를 정규식으로 측정해 실시간 표시. 6·7단계 "전체 자동 생성"은 4모듈을 순차 실행하며 모듈마다 QA를 검사하고 경고를 모아 사후 검수를 안내합니다.
- **단계별 temperature 차등**: 리서치 0.3(정확) ~ 창작 0.9(다양성).
- **비용 트래커**: 완료 시점 `usageMetadata`를 안전 파싱(사고 토큰 포함)하여 누적 토큰·USD·KRW를 실시간 표시.
- **프로젝트 슬롯 + JSON 내보내기/가져오기**: 여러 대본을 명명 슬롯으로 저장/전환하고 `.json`으로 백업·이전(키는 제외)합니다. 결과는 단계별 복사 버튼 제공.
- **로컬 백업/복구**: 디바운스 `localStorage` 백업 + 재접속 복구 모달.
- **견고한 예외 처리**: 401/403 키 오류 토스트 + 로딩 무조건 해제, `/api/validate` 키 즉시 검증, `app/error.tsx` 에러 바운더리.
- **TTS 줄바꿈 보존**: 모든 에디터/뷰어에 `white-space: pre-wrap` 적용.

## 기술 스택

- Next.js 14 (App Router) · TypeScript
- Tailwind CSS (다크 모드 기반 인포테인먼트 대시보드)
- lucide-react
- @google/genai (Google Gen AI SDK)

## 설치 주의 (.npmrc)

`@google/genai@2.7.0`은 게시 패키지에 `prepare`(rollup 재빌드) 스크립트가 포함된 패키징 버그가 있어, 일반 `npm install` 시 빌드가 실패합니다. 이를 회피하기 위해 저장소에 `.npmrc`(`ignore-scripts=true`)가 포함되어 있습니다. 이 프로젝트는 별도의 install/postinstall 스크립트가 필요하지 않습니다.

## Vercel 배포

이 앱은 **API 키를 사용자가 화면에서 직접 입력**하므로 Vercel에 설정할 환경변수가 없습니다. 저장소를 가져와 배포 버튼만 누르면 됩니다.

1. https://vercel.com 접속 → **Continue with GitHub**로 로그인(가입).
2. 대시보드 → **Add New… → Project**.
3. **Import Git Repository**에서 `seungok001-eng/script` 선택. (처음이면 GitHub 연동 권한 승인)
4. **Branch**를 배포할 브랜치로 선택(현재 작업본은 `claude/amazing-pasteur-583zj`, 또는 `main` 병합 후 `main`).
5. Framework는 **Next.js**로 자동 인식됨. Build/Install 설정은 그대로 두면 됨(저장소의 `.npmrc`·`vercel.json` 자동 적용).
6. **Deploy** 클릭 → 1~2분 후 `https://<프로젝트명>.vercel.app` 주소 발급.
7. 발급된 주소 접속 → 우상단 ⚙️에서 본인 Gemini API 키 저장 → 사용.

설정 메모:
- `vercel.json`은 함수 리전을 **서울(icn1)** 로 지정해 한국 사용자 지연을 낮춥니다.
- API 라우트 `maxDuration`은 무료(Hobby) 플랜 상한인 **60초**로 맞춰져 있습니다. Pro 플랜이면 `app/api/*/route.ts`의 값을 300까지 올릴 수 있습니다.
- 이후 해당 브랜치에 푸시하면 Vercel이 **자동 재배포**합니다.

## 테스트

순수 로직(챕터 분할·인트로 파싱·QA 분석)에 대한 단위 테스트를 Node 내장 테스트 러너로 실행합니다(추가 의존성 없음).

```bash
npm test
```

## 시작하기

```bash
npm install
npm run dev
```

`http://localhost:3000` 접속 후, 우측 상단 ⚙️ 설정에서 **Gemini API Key**를 저장하세요. 키는 브라우저 `localStorage`에만 저장되며 서버에 영구 저장되지 않고, 각 요청 시 `x-api-key` 헤더로만 전달됩니다. [API 키 발급](https://aistudio.google.com/app/apikey)

## 프로젝트 구조

```
app/
  api/generate/route.ts    # 비스트리밍 생성 (1~5,8단계)
  api/stream/route.ts       # NDJSON 스트리밍 생성 (6,7단계)
  api/validate/route.ts     # API 키 유효성 즉시 검증
  error.tsx                 # 에러 바운더리
  layout.tsx · page.tsx · globals.css
components/
  providers/                # ProjectProvider(상태/백업), ToastProvider
  steps/                    # Step1~8 단계 컴포넌트
  Header · Stepper · SettingsModal · ProjectsModal · CostTracker
  RecoveryModal · StepShell · QAPanel · ProgressGauge · CopyButton
hooks/useGenerate.ts        # 생성 호출 공용 훅(에러/로딩/usage/sources)
lib/
  types · models(요율) · phases(temperature) · prompts(시스템·떡밥 원장)
  gemini(서버:재시도/이어쓰기/그라운딩) · client · storage(슬롯/내보내기)
  chapters(분할/바운딩) · qa(규칙 검증)
tests/                      # chapters·qa 단위 테스트 (node --test)
```

## 모델 ID 주의

`lib/models.ts`의 모델 프리셋(특히 `gemini-3.x` 라인업)은 명세서 기준 프리셋이며 일부는 향후/가상 ID일 수 있습니다. 실제 배포 전 [Google AI Studio](https://aistudio.google.com)에서 사용 가능한 모델 ID와 [최신 요금표](https://ai.google.dev/pricing)로 갱신하세요.
