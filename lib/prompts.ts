// ─────────────────────────────────────────────────────────────
// 수석 작가 절대 규칙(systemInstruction) + 단계별 프롬프트 빌더
// ─────────────────────────────────────────────────────────────

import type { ScriptProjectState } from "./types";

/**
 * 모든 API 라우트에서 상시 주입되는 고정 시스템 인스트럭션.
 * AI의 성능 저하(지시문 망각, 동어 반복, 문맥 실종)를 규칙으로 제어한다.
 */
export const SYSTEM_INSTRUCTION = `너는 대한민국 1티어 경제/안보/국뽕 유튜브 채널의 수석 메인 작가야. 시청자에게 짜릿한 카타르시스(국뽕)를 주면서도 유튜브 알고리즘이 고품질 교육 콘텐츠로 인식하는 깊이 있는 지식과 팩트가 담긴 대본을 작성해야 해. 아래의 절대 규칙을 칼같이 준수하라.

- 절대 규칙 1 (가변적 텐션 장치): 패턴이 기계적이면 시청자가 이탈한다. 장치(정보공백/감정타격/시각적단절/모순유발)를 던지는 주기를 400자, 800자, 1200자 등 무작위로 교차하고 '그런데 말입니다' 같은 상투적 어구는 절대 금지한다. 인트로는 지적 호기심 위주로 차분하게, 후반부로 갈수록 데드라인과 압박감을 고조시키며 장치의 빈도를 촘촘하게 올려라.
- 절대 규칙 2 (톤앤매너 & TTS): 해외 최상위 엘리트 시점의 1인칭 존댓말 필수. 구어체 80%, 문어체 20% 유지. 문장 끝은 (~습니다/합니다 40%, ~죠/잖아요 40%, ~습니까?/할까요? 15%, ~말입니다 5%) 비율로 4단 변주하라. TTS 가독성을 위해 본문에 괄호나 특수기호를 절대 넣지 말고 문장을 짧게 끊어라. 다만 작업자 구분을 위해 각 챕터 시작 시 [챕터 X] 머리말 마커를 명시하고 끝날 때 줄바꿈을 2번 하라.
- 절대 규칙 3 (팩트 기반 픽션): 화자는 픽션이되 인용하는 수치, 기술 스펙, 뉴스는 무조건 100% 실제 사실에 기반해야 하며 거짓 데이터를 창조(환각)하면 절대로 안 된다.`;

// ── 단계별 프롬프트 빌더 ──────────────────────────────────────
// 각 빌더는 [최종 승인된 Artifact]만 골라 컨텍스트를 조립한다.
// 불필요한 이전 대화 기록(채팅 수다)은 절대 포함하지 않는다.

export function buildStep1Prompt(keyword: string, userGuide: string): string {
  return `[1단계 · 주제 선정]
사용자 키워드: "${keyword}"

위 키워드를 바탕으로 지금 시점에서 조회수가 폭발할 만한 유튜브 대본 주제 3가지를 제안하라.
각 주제는 다음 형식의 간략한 리포트로 작성한다.

## 주제 1: (제목)
- 후킹 포인트: (왜 터지는가)
- 핵심 서사 각도: (어떤 관점)
- 예상 타깃 시청자: (누구)

## 주제 2 ...
## 주제 3 ...
${userGuide ? `\n[작업자 추가 가이드]\n${userGuide}` : ""}`;
}

export function buildStep2Prompt(topic: string, userGuide: string): string {
  return `[2단계 · 딥리서치 & 팩트 리포트]
확정 주제: "${topic}"

너는 지금 웹 검색 기능을 가동한 리서처다(검색 시뮬레이션). 위 주제와 관련된 국내외 실제 지표, 기술 스펙, 최근 뉴스, 통계 수치를 정리해 팩트 리포트로 출력하라.
절대 규칙 3에 따라 모든 수치/스펙/뉴스는 100% 실제 사실 기반이어야 하며, 불확실한 항목은 "추정/미확인"으로 명확히 표기하라.

다음 구조로 작성한다.
## 핵심 팩트 요약
## 주요 수치 및 지표 (출처 명시)
## 기술 스펙 / 디테일
## 서사에 활용할 결정적 한 방 (반전 포인트)
${userGuide ? `\n[작업자 추가 가이드]\n${userGuide}` : ""}`;
}

export function buildStep3Prompt(state: ScriptProjectState, userGuide: string): string {
  return `[3단계 · 화자 프로필 설정]
확정 주제: "${state.topic}"

[승인된 팩트 리포트]
${state.factReport}

위 팩트 리포트의 톤에 어울리는 1인칭 화자(픽션 캐릭터) 프로필을 3가지 버전으로 제안하라.
예: 패권주의 전략가, 오일머니 맹신자, 냉철한 글로벌 자본가 등.
각 프로필은 다음 형식으로 작성한다.

## 프로필 A: (한 줄 캐릭터 정의)
- 시점/입장:
- 말투/특유의 어휘:
- 이 주제를 바라보는 독특한 앵글:

## 프로필 B ...
## 프로필 C ...
${userGuide ? `\n[작업자 추가 가이드]\n${userGuide}` : ""}`;
}

export function buildStep4Prompt(state: ScriptProjectState, userGuide: string): string {
  return `[4단계 · 8챕터 상세 시놉시스 기획]
확정 주제: "${state.topic}"

[승인된 팩트 리포트]
${state.factReport}

[선택된 화자 프로필]
${state.speakerProfile}

위 세 가지 Artifact만을 기반으로, 총 24,000자 분량을 감당할 '거시적 8챕터 구조'의 상세 시놉시스를 기획하라.
각 챕터는 다음을 반드시 포함한다.
- [챕터 N] 제목
- 핵심 내용 요약 (3~5줄)
- 배치할 텐션 장치 종류와 위치
- 타깃 분량 가이드 (2,500자 ~ 3,500자)

8개 챕터가 하나의 기승전결로 유기적으로 이어지도록 설계하라.
${userGuide ? `\n[작업자 추가 가이드]\n${userGuide}` : ""}`;
}

export function buildStep5Prompt(state: ScriptProjectState, userGuide: string): string {
  return `[5단계 · 인트로 및 클릭률 폭발 세트 제안]
확정 주제: "${state.topic}"

[8챕터 시놉시스]
${state.synopsis}

위 시놉시스를 바탕으로 강력한 인트로 대사 10가지를 제안하라.
각 인트로는 300자 이상이어야 하며, 절대 규칙 1(지적 호기심 위주의 차분한 도입)을 따른다.
그리고 각 인트로와 완벽히 호응하는 [영상 제목 + 썸네일 카피]를 하나의 세트로 묶어라.

다음 형식을 정확히 지켜라(파싱 가능하도록).

### 세트 1
제목: (강력한 영상 제목)
썸네일: (썸네일 카피)
인트로:
(300자 이상의 인트로 대사)

### 세트 2
...

### 세트 10
...
${userGuide ? `\n[작업자 추가 가이드]\n${userGuide}` : ""}`;
}

/**
 * 6단계(초안) 스트리밍 프롬프트 — 2개 챕터씩 묶어서 빌드.
 * 컨텍스트 고립: 주제+팩트+시놉시스+인트로세트 + (앞서 완성된 챕터 본문)만 전송.
 */
export function buildStep6Prompt(
  state: ScriptProjectState,
  chapterPair: [number, number],
  previousChapters: string,
  userGuide: string,
): string {
  const [a, b] = chapterPair;
  return `[6단계 · 초안 작성 (스트리밍)]
이번에 작성할 챕터: [챕터 ${a}] 와 [챕터 ${b}]

[확정 주제]
${state.topic}

[팩트 리포트]
${state.factReport}

[선택된 인트로 세트]
제목: ${state.introSet.title}
썸네일: ${state.introSet.thumbnail}
인트로: ${state.introSet.text}

[8챕터 시놉시스]
${state.synopsis}
${
  previousChapters
    ? `\n[앞서 완성된 챕터 본문 — 서사 연속성 유지용]\n${previousChapters}`
    : ""
}

위 Artifact만을 근거로 [챕터 ${a}]와 [챕터 ${b}]의 완성형 대본 본문을 작성하라.
- 각 챕터는 시놉시스의 타깃 분량(2,500자~3,500자)을 채운다.
- 절대 규칙 1, 2, 3을 칼같이 준수한다.
- 각 챕터는 [챕터 ${a}] / [챕터 ${b}] 머리말 마커로 시작하고, 챕터가 끝나면 줄바꿈을 2번 한다.
- 본문에 괄호/특수기호를 넣지 말고 TTS용으로 문장을 짧게 끊어라.
- 메타 설명 없이 대본 본문만 출력하라.
${userGuide ? `\n[작업자 추가 가이드]\n${userGuide}` : ""}`;
}

/** 7단계(정밀 퇴고) 스트리밍 프롬프트 — 2개 챕터씩 정밀 수정 */
export function buildStep7Prompt(
  state: ScriptProjectState,
  chapterPair: [number, number],
  draftPair: string,
  userGuide: string,
): string {
  const [a, b] = chapterPair;
  return `[7단계 · 시청지속시간 극대화 정밀 퇴고 (스트리밍)]
대상 챕터: [챕터 ${a}] 와 [챕터 ${b}]

[해당 챕터 초안]
${draftPair}

위 초안을 시청지속시간(Retention) 극대화 관점에서 정밀 퇴고하라.
- 늘어지는 설명은 강렬한 비유로 압축한다.
- 다만 분량을 억지로 줄이지 말고, 고품질 구간은 그대로 보존한다(유연한 퇴고).
- 절대 규칙 1, 2, 3을 재점검하여 위반 사항을 교정한다.
- [챕터 ${a}] / [챕터 ${b}] 머리말 마커와 챕터 종료 시 줄바꿈 2번 형식을 유지한다.
- 메타 설명 없이 퇴고된 대본 본문만 출력하라.
${userGuide ? `\n[작업자 추가 가이드]\n${userGuide}` : ""}`;
}

export function buildStep8Prompt(state: ScriptProjectState, userGuide: string): string {
  const fullScript = Object.keys(state.finalChapters)
    .map(Number)
    .sort((x, y) => x - y)
    .map((k) => state.finalChapters[k])
    .join("\n\n");

  return `[8단계 · 메타데이터 출력]
확정 주제: "${state.topic}"

[최종 완성 대본 (요약 참고용 — 앞부분 발췌)]
${fullScript.slice(0, 6000)}

위 대본을 바탕으로 유튜브 업로드용 필수 메타데이터 6종을 아래 형식 그대로 출력하라.

## 1. 영상 설명
(SEO 최적화된 설명문)

## 2. 키워드 20개
(쉼표로 구분된 20개)

## 3. 제목 후보 20개
1) ...
... 20) ...

## 4. 썸네일 문구 20개
1) ...
... 20) ...

## 5. 출처
(대본에 인용된 팩트의 출처 목록)

## 6. 퀴즈 2개
Q1. ... / 정답: ...
Q2. ... / 정답: ...
${userGuide ? `\n[작업자 추가 가이드]\n${userGuide}` : ""}`;
}
