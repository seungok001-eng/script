# 유튜브 24,000자 대본 자동 생성기 (대본 공장)

Google Gemini API를 활용해 유튜브 상위 0.1% 채널의 워크플로우를 제어하는 프로덕션 수준 Next.js 웹 애플리케이션입니다. AI의 성능 저하(지시문 망각·동어 반복·문맥 실종)를 **프로그래밍 레벨의 컨텍스트 다이어트**로 제어하고, 사용자가 8단계를 검증하며 고품질 대본을 뽑아냅니다.

## 핵심 특징

- **컨텍스트 다이어트 (Context Isolation)**: 단순 채팅 루프가 아니라, 각 단계가 독립된 단발성 API 요청입니다. 승인된 Artifact만 다음 단계 프롬프트에 조립·전송합니다.
- **8단계 워크플로우**: 주제 → 팩트 리포트 → 화자 프로필 → 8챕터 시놉시스 → 인트로 세트 → 초안(스트리밍) → 정밀 퇴고(스트리밍) → 메타데이터.
- **스트리밍 생성**: 24,000자 초장문은 2개 챕터씩 묶어 `generateContentStream()`으로 처리하여 서버 타임아웃을 회피합니다.
- **비용 트래커**: 스트림 완료 시점의 `usageMetadata`를 안전 파싱하여 누적 토큰·USD·KRW 비용을 실시간 표시합니다.
- **로컬 백업/복구**: 상태 변경 시 디바운스로 `localStorage`에 백업하고, 재접속 시 복구 모달을 제공합니다.
- **견고한 예외 처리**: 401/403 키 오류를 캐치해 토스트를 띄우고 로딩을 무조건 해제합니다.
- **TTS 줄바꿈 보존**: 모든 에디터/뷰어에 `white-space: pre-wrap`을 적용해 AI 줄바꿈 호흡을 보존합니다.

## 기술 스택

- Next.js 14 (App Router) · TypeScript
- Tailwind CSS (다크 모드 기반 인포테인먼트 대시보드)
- lucide-react
- @google/generative-ai

## 시작하기

```bash
npm install
npm run dev
```

`http://localhost:3000` 접속 후, 우측 상단 ⚙️ 설정에서 **Gemini API Key**를 저장하세요. 키는 브라우저 `localStorage`에만 저장되며 서버에 영구 저장되지 않고, 각 요청 시 `x-api-key` 헤더로만 전달됩니다. [API 키 발급](https://aistudio.google.com/app/apikey)

## 프로젝트 구조

```
app/
  api/generate/route.ts   # 비스트리밍 생성 (1~5,8단계)
  api/stream/route.ts      # NDJSON 스트리밍 생성 (6,7단계)
  layout.tsx · page.tsx · globals.css
components/
  providers/               # ProjectProvider(상태/백업), ToastProvider
  steps/                   # Step1~8 단계 컴포넌트
  Header · Stepper · SettingsModal · CostTracker · RecoveryModal · StepShell
hooks/useGenerate.ts       # 생성 호출 공용 훅(에러/로딩/usage)
lib/
  types · models(요율) · prompts(시스템 인스트럭션) · gemini(서버) · client · storage · chapters
```

## 모델 ID 주의

`lib/models.ts`의 모델 프리셋(특히 `gemini-3.x` 라인업)은 명세서 기준 프리셋이며 일부는 향후/가상 ID일 수 있습니다. 실제 배포 전 [Google AI Studio](https://aistudio.google.com)에서 사용 가능한 모델 ID와 [최신 요금표](https://ai.google.dev/pricing)로 갱신하세요.
