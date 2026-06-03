// ─────────────────────────────────────────────────────────────
// 타임스탬프(챕터 마커) 계산 — 영상 길이 + 챕터 글자수로 근사 배분
// ─────────────────────────────────────────────────────────────
//
// 정확한 음성 길이는 알 수 없으므로, "각 구간의 글자수 비율 ∝ 재생 시간"으로
// 가정해 영상 전체 길이를 비례 배분한다. 완벽하진 않지만 챕터 이동에 충분하다.

/** "12:34", "1:02:03", "750", "12분 30초" → 초. 실패 시 null */
export function parseDurationToSeconds(input: string): number | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  if (/^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(s)) {
    const parts = s.split(":").map(Number);
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const min = s.match(/(\d+)\s*분/);
  const sec = s.match(/(\d+)\s*초/);
  if (min || sec) {
    return (min ? parseInt(min[1], 10) : 0) * 60 + (sec ? parseInt(sec[1], 10) : 0);
  }
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

/** 초 → "M:SS" 또는 "H:MM:SS" (유튜브 타임스탬프 표기) */
export function formatSeconds(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export interface TimestampSeg {
  time: string;
  seconds: number;
  label: string;
}

/**
 * 구간(라벨+글자수)과 전체 영상 길이(초)로 타임스탬프를 만든다.
 * 첫 타임스탬프는 유튜브 챕터 요건에 맞춰 항상 0:00.
 */
export function buildTimestamps(
  segments: { label: string; chars: number }[],
  totalSeconds: number,
): TimestampSeg[] {
  const totalChars = segments.reduce((a, b) => a + Math.max(0, b.chars), 0);
  if (totalChars <= 0 || totalSeconds <= 0) return [];
  let cum = 0;
  const out: TimestampSeg[] = segments.map((seg) => {
    const seconds = Math.floor((cum / totalChars) * totalSeconds);
    cum += Math.max(0, seg.chars);
    return { time: formatSeconds(seconds), seconds, label: seg.label };
  });
  out[0] = { ...out[0], time: "0:00", seconds: 0 };
  return out;
}

export function timestampsToText(segs: TimestampSeg[]): string {
  return segs.map((s) => `${s.time} ${s.label}`).join("\n");
}
