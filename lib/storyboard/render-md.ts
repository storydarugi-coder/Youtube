import type { Storyboard } from "./schema";

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function truncatePrompt(s: string, max = 200): string {
  if (s.length <= max) return escapeCell(s);
  return (
    escapeCell(s.slice(0, max)) +
    `... <details><summary>전체</summary>${escapeCell(s)}</details>`
  );
}

export function renderStoryboardMarkdown(
  s: Storyboard,
  ctx: { topicTitle: string; channel: string }
): string {
  const lines: string[] = [];

  lines.push(`# 스토리보드 — ${ctx.topicTitle}`);
  lines.push(``);
  lines.push(`> 채널: ${ctx.channel}  `);
  lines.push(
    `> 씬 ${s.meta.sceneCount}개 · 총 ${s.totalDurationSec}초 (목표 ${s.meta.targetTotalSec}초) · 평균 ${s.meta.avgSceneSec.toFixed(1)}초/씬  `
  );
  lines.push(`> 모델: ${s.meta.model} · retries ${s.meta.retries} · 생성: ${s.meta.generatedAt}`);
  lines.push(``);
  lines.push(`**Visual Style Prefix**: \`${s.visualStylePrefix}\``);
  lines.push(``);
  lines.push(`| # | Section | 자막 | 영문 프롬프트 | sec |`);
  lines.push(`|---|---------|------|---------------|-----|`);

  s.scenes.forEach((scene) => {
    lines.push(
      `| ${scene.index} | [${scene.sectionRole}] §${scene.sectionIndex} | ${escapeCell(scene.caption)} | ${truncatePrompt(scene.imagePrompt)} | ${scene.durationSec} |`
    );
  });

  lines.push(``);

  const cameraNotes = s.scenes.filter((sc) => sc.cameraNote);
  if (cameraNotes.length > 0) {
    lines.push(`## 카메라·연출 메모`);
    lines.push(``);
    cameraNotes.forEach((sc) => {
      lines.push(`- 씬 ${sc.index}: ${sc.cameraNote}`);
    });
    lines.push(``);
  }

  return lines.join("\n");
}
