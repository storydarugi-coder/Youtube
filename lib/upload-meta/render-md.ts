import type { UploadMeta } from "./schema";

const STRATEGY_LABEL: Record<string, string> = {
  emotion: "감정 중심",
  contrast: "대비·충돌 중심",
  mystery: "미스터리·호기심 중심",
};

const STRATEGY_ORDER = ["emotion", "contrast", "mystery"] as const;

export function renderUploadMetaMarkdown(
  m: UploadMeta,
  ctx: { channel: string }
): string {
  const lines: string[] = [];
  const titleLen = Array.from(m.title).length;

  lines.push(`# 업로드 정보`);
  lines.push(``);
  lines.push(`> 채널: ${ctx.channel}  `);
  lines.push(
    `> 모델: ${m.meta.model} · retries ${m.meta.retries} · 생성: ${m.meta.generatedAt}  `
  );
  lines.push(`> 제목 출처: **${m.meta.titleSource}** (selected | revised)`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  lines.push(`## 제목 (${titleLen}자)`);
  lines.push(``);
  lines.push(`> ${m.title}`);
  lines.push(``);

  lines.push(`## 설명 (${m.meta.descriptionCharCount}자)`);
  lines.push(``);
  lines.push(m.description.intro);
  lines.push(``);
  lines.push(`📌 타임스탬프`);
  m.description.timestamps.forEach((ts) => {
    lines.push(`- \`${ts.time}\` ${ts.label}`);
  });
  lines.push(``);
  lines.push(m.description.summary);
  lines.push(``);
  lines.push(m.description.hashtags.join(" "));
  lines.push(``);

  lines.push(`## 태그 (${m.tags.length}개)`);
  lines.push(``);
  lines.push(m.tags.map((t) => `\`${t}\``).join(", "));
  lines.push(``);

  lines.push(`## 카테고리`);
  lines.push(``);
  lines.push(m.category);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  lines.push(`## 썸네일 프롬프트`);
  lines.push(``);

  STRATEGY_ORDER.forEach((strategy, idx) => {
    const t = m.thumbnails.find((x) => x.strategy === strategy);
    if (!t) return;
    const letter = ["A", "B", "C"][idx];
    lines.push(`### ${letter}. ${STRATEGY_LABEL[strategy]} (${strategy})`);
    lines.push(``);
    lines.push(`**효과적 이유**: ${t.rationale}`);
    lines.push(``);
    lines.push(`**텍스트 오버레이**: 「${t.textOverlay}」`);
    lines.push(``);
    lines.push(`**이미지 프롬프트**:`);
    lines.push("```");
    lines.push(t.imagePrompt);
    lines.push("```");
    lines.push(``);
  });

  return lines.join("\n");
}
