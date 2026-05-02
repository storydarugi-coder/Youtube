import type { ScriptOutput } from "./schema";

const ROLE_LABEL: Record<string, string> = {
  hook: "오프닝 훅",
  background: "배경",
  body: "본론",
  climax: "클라이맥스",
  ending: "엔딩",
  outro: "아웃트로",
};

export function renderScriptMarkdown(
  s: ScriptOutput,
  ctx: { topicTitle: string; channel: string }
): string {
  const lines: string[] = [];

  lines.push(`# ${ctx.topicTitle}`);
  lines.push(``);
  lines.push(
    `> 채널: ${ctx.channel}  `
  );
  lines.push(
    `> 분량: ${s.meta.durationMin}분 · ${s.meta.actualCharCount}자 (${s.meta.sectionCount}개 섹션)  `
  );
  lines.push(`> 모델: ${s.meta.model} · 생성: ${s.meta.generatedAt}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  s.sections.forEach((section, i) => {
    const num = i + 1;
    const label = ROLE_LABEL[section.role] ?? section.role;
    lines.push(
      `## ${num}. [${section.role}] ${section.title} — 약 ${section.estimatedSeconds}초 _(${label})_`
    );
    lines.push(``);
    lines.push(section.text);
    lines.push(``);
    if (section.transitionToNext) {
      lines.push(`→ ${section.transitionToNext}`);
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  });

  lines.push(`## 자체 검토 노트`);
  lines.push(``);
  lines.push(`**confidence**: ${s.selfReview.confidenceLevel}`);
  lines.push(``);

  if (s.selfReview.issuesFound.length > 0) {
    lines.push(`**발견한 문제**`);
    s.selfReview.issuesFound.forEach((x) => lines.push(`- ${x}`));
    lines.push(``);
  }

  if (s.selfReview.revisionsApplied.length > 0) {
    lines.push(`**적용한 수정**`);
    s.selfReview.revisionsApplied.forEach((x) => lines.push(`- ${x}`));
    lines.push(``);
  }

  if (s.selfReview.factualClaimsUsed.length > 0) {
    lines.push(`**사용한 verified 클레임**`);
    s.selfReview.factualClaimsUsed.forEach((x) => lines.push(`- ${x}`));
    lines.push(``);
  }

  if (s.selfReview.redFlagsAvoided.length > 0) {
    lines.push(`**회피한 redFlags**`);
    s.selfReview.redFlagsAvoided.forEach((x) => lines.push(`- ${x}`));
    lines.push(``);
  }

  return lines.join("\n");
}
