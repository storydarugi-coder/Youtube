export interface SrtCue {
  index: number;        // 1-based
  startMs: number;      // 누적 시작 ms
  endMs: number;        // 끝 ms (= 다음 씬 시작 - 1ms 보정)
  text: string;
}

export interface SrtSceneInput {
  sceneIndex: number;
  caption: string;
  durationMs: number;
}

export function buildSrtCues(scenes: SrtSceneInput[]): SrtCue[] {
  const cues: SrtCue[] = [];
  let cursorMs = 0;
  scenes.forEach((s, i) => {
    const start = cursorMs;
    const end = cursorMs + s.durationMs;
    cues.push({
      index: i + 1,
      startMs: start,
      endMs: end,
      text: s.caption.trim(),
    });
    cursorMs = end;
  });
  return cues;
}

function formatTimestamp(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.round(ms);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(millis).padStart(3, "0")
  );
}

export function renderSrt(cues: SrtCue[]): string {
  return (
    cues
      .map((c) => {
        const text = c.text.length > 0 ? c.text : "(자막 없음)";
        return `${c.index}\n${formatTimestamp(c.startMs)} --> ${formatTimestamp(c.endMs)}\n${text}\n`;
      })
      .join("\n") + (cues.length > 0 ? "" : "")
  );
}

export function renderSrtFromScenes(scenes: SrtSceneInput[]): string {
  return renderSrt(buildSrtCues(scenes));
}
