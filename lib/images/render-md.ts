import type { ImagesJson } from "./schema";

export function renderImagesMarkdown(
  j: ImagesJson,
  ctx: { channel: string }
): string {
  const lines: string[] = [];
  const { meta, scenes, thumbnails } = j;
  const successScenes = scenes.filter((s) => s.status === "done");
  const failedAll = [...scenes, ...thumbnails].filter(
    (r) => r.status === "failed"
  );

  lines.push(`# 이미지 생성 결과`);
  lines.push(``);
  lines.push(`> 채널: ${ctx.channel} · 모델: ${meta.model}  `);
  lines.push(`> 시작: ${meta.startedAt} → 완료: ${meta.completedAt}  `);
  lines.push(
    `> 씬 ${meta.succeeded -
      thumbnails.filter((t) => t.status === "done").length}/${meta.totalScenes} 성공 · 썸네일 ${thumbnails.filter((t) => t.status === "done").length}/3${meta.skippedExisting > 0 ? ` · 재개 스킵 ${meta.skippedExisting}` : ""}  `
  );
  lines.push(`> **총 비용**: $${meta.totalCostUsd.toFixed(2)}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  lines.push(`## 씬 갤러리 (${successScenes.length}장)`);
  lines.push(``);
  lines.push(`| # | 자막 일부 | 비용 | 시도 | fallback |`);
  lines.push(`|---|----------|------|------|----------|`);
  for (const s of scenes) {
    const idx = s.sceneIndex ?? "?";
    const captionExcerpt = s.promptOriginal
      .replace(/\|/g, "\\|")
      .slice(0, 60);
    const cost = s.costUsd !== null ? `$${s.costUsd.toFixed(3)}` : "-";
    const status =
      s.status === "done"
        ? `✅`
        : s.status === "failed"
          ? `❌`
          : s.status === "skipped"
            ? `⏭️`
            : `⏳`;
    lines.push(
      `| ${status} ${idx} | ${captionExcerpt} | ${cost} | ${s.attempts} | ${s.fallbackUsed ? "yes" : "no"} |`
    );
  }
  lines.push(``);

  lines.push(`## 썸네일`);
  for (const t of thumbnails) {
    const status =
      t.status === "done"
        ? `✅`
        : t.status === "failed"
          ? `❌`
          : t.status === "skipped"
            ? `⏭️`
            : `⏳`;
    const filename = t.imagePath
      ? `\`thumbnails/${t.thumbnailStrategy}.png\``
      : `(없음)`;
    lines.push(`- ${status} **${t.thumbnailStrategy}** · ${filename}`);
  }
  lines.push(``);

  if (failedAll.length > 0) {
    lines.push(`## 실패 (${failedAll.length}개)`);
    for (const r of failedAll) {
      const label =
        r.type === "scene"
          ? `씬 ${r.sceneIndex}`
          : `썸네일 ${r.thumbnailStrategy}`;
      lines.push(`- ${label}: ${r.errorMessage ?? "unknown"}`);
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
