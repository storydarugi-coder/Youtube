import type { VideoJson } from "./schema";

function fmtDuration(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function renderVideoMarkdown(
  v: VideoJson,
  ctx: { channel: string; runId: string }
): string {
  const lines: string[] = [];
  const { meta, scenes, videoPath, srtPath } = v;

  lines.push(`# 영상 합성 결과`);
  lines.push(``);
  lines.push(
    `> 채널: ${ctx.channel} · ffmpeg ${meta.ffmpegVersion}  `
  );
  lines.push(
    `> 시작: ${meta.startedAt} → 완료: ${meta.completedAt}  `
  );
  lines.push(
    `> 씬 ${meta.succeeded}/${meta.totalScenes} 성공${meta.placeholders > 0 ? ` · placeholder ${meta.placeholders}` : ""}${meta.skippedExisting > 0 ? ` · 재개 스킵 ${meta.skippedExisting}` : ""}${meta.failed > 0 ? ` · ❌ 실패 ${meta.failed}` : ""}  `
  );
  lines.push(
    `> **총 길이**: ${fmtDuration(meta.totalDurationMs)} · ${meta.width}x${meta.height} ${meta.fps}fps  `
  );
  lines.push(
    `> 코덱: ${meta.videoCodec} (${meta.preset}, crf ${meta.crf}) + ${meta.audioCodec}`
  );
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  if (videoPath) {
    lines.push(`## 결과물`);
    lines.push(``);
    lines.push(`- mp4: \`${videoPath}\``);
    if (srtPath) lines.push(`- srt: \`${srtPath}\``);
    lines.push(``);
  }

  lines.push(`## 씬 목록`);
  lines.push(``);
  lines.push(`| # | 상태 | 길이 | 입력 |`);
  lines.push(`|---|------|------|------|`);
  for (const s of scenes) {
    const status =
      s.status === "done"
        ? "✅ done"
        : s.status === "placeholder"
          ? "🟦 placeholder"
          : s.status === "skipped"
            ? "⏭️ skipped"
            : s.status === "failed"
              ? "❌ failed"
              : "⏳ pending";
    const duration = `${(s.durationMs / 1000).toFixed(1)}s`;
    const inputs: string[] = [];
    if (s.imagePath) inputs.push("img");
    if (s.audioPath) inputs.push("audio");
    if (inputs.length === 0) inputs.push("none");
    lines.push(
      `| ${s.sceneIndex} | ${status} | ${duration} | ${inputs.join("+")} |`
    );
  }
  lines.push(``);

  const failures = scenes.filter((s) => s.status === "failed" || s.errorMessage);
  if (failures.length > 0) {
    lines.push(`## 실패·경고`);
    for (const f of failures) {
      lines.push(`- 씬 ${f.sceneIndex}: ${f.errorMessage ?? "(no message)"}`);
    }
    lines.push(``);
  }

  lines.push(`## 재개 가능`);
  lines.push(``);
  lines.push(
    `같은 run에 다시 트리거하면 done/placeholder 씬은 mp4 재사용, failed/missing만 다시 합성합니다.`
  );

  return lines.join("\n");
}
