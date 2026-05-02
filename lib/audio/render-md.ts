import type { AudioJson } from "./schema";

function fmtDuration(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function renderAudioMarkdown(
  j: AudioJson,
  ctx: { channel: string }
): string {
  const lines: string[] = [];
  const { meta, scenes } = j;
  const failedAll = scenes.filter((r) => r.status === "failed");
  const totalDurationMin = meta.totalDurationMs / 60000;

  lines.push(`# TTS 결과`);
  lines.push(``);
  lines.push(
    `> 채널: ${ctx.channel} · 음성: \`${meta.voiceId}\` · 모델: ${meta.model}  `
  );
  lines.push(
    `> 씬 ${meta.succeeded}/${meta.totalScenes} 성공${meta.skippedExisting > 0 ? ` · 재개 스킵 ${meta.skippedExisting}` : ""}  `
  );
  lines.push(
    `> 총 길이: ${fmtDuration(meta.totalDurationMs)} (${totalDurationMin.toFixed(1)}분)  `
  );
  lines.push(
    `> 총 글자수: ${meta.totalCharCount} · **비용**: $${meta.totalCostUsd.toFixed(2)}`
  );
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  lines.push(`## 씬 목록`);
  lines.push(``);
  lines.push(`| # | 자막 | 길이 | 글자 | 비용 | 시도 |`);
  lines.push(`|---|------|------|------|------|------|`);
  for (const s of scenes) {
    const status =
      s.status === "done"
        ? `✅`
        : s.status === "failed"
          ? `❌`
          : s.status === "skipped"
            ? `⏭️`
            : `⏳`;
    const captionExcerpt = s.text
      .replace(/\|/g, "\\|")
      .replace(/\r?\n/g, " ")
      .slice(0, 60);
    const durationStr =
      s.durationMs !== null
        ? `${(s.durationMs / 1000).toFixed(1)}s`
        : "-";
    const cost = s.costUsd !== null ? `$${s.costUsd.toFixed(3)}` : "-";
    lines.push(
      `| ${status} ${s.sceneIndex} | ${captionExcerpt} | ${durationStr} | ${s.charCount} | ${cost} | ${s.attempts} |`
    );
  }
  lines.push(``);

  if (failedAll.length > 0) {
    lines.push(`## 실패 (${failedAll.length}개)`);
    for (const r of failedAll) {
      lines.push(`- 씬 ${r.sceneIndex}: ${r.errorMessage ?? "unknown"}`);
    }
    lines.push(``);
  }

  lines.push(`## 재개 가능`);
  lines.push(``);
  lines.push(
    `부분 실패가 있다면 같은 run에 다시 트리거하면 done은 스킵, failed/missing만 재생성됩니다.`
  );

  return lines.join("\n");
}
