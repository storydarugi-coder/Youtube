import { z } from "zod";
import { SectionRoleEnum } from "@/lib/script/schema";

export const SceneSchema = z.object({
  index: z.number().int().min(1),
  sectionIndex: z.number().int().min(0),
  sectionRole: SectionRoleEnum,
  caption: z.string().min(8).max(400),
  imagePrompt: z.string().min(40).max(1500),
  durationSec: z.number().int().min(3).max(20),
  cameraNote: z.string().max(200).optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

const ScenesArraySchema = z
  .array(SceneSchema)
  .min(5)
  .max(300)
  .superRefine((scenes, ctx) => {
    scenes.forEach((s, i) => {
      if (s.index !== i + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `씬 index가 연속되지 않습니다. ${i + 1}번째 씬의 index=${s.index}`,
          path: [i, "index"],
        });
      }
    });
    if (scenes.length === 0) return;
    if (scenes[0]!.sectionRole !== "hook") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "첫 씬은 hook section에 속해야 합니다.",
        path: [0, "sectionRole"],
      });
    }
    const last = scenes[scenes.length - 1]!;
    if (last.sectionRole !== "outro") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "마지막 씬은 outro section에 속해야 합니다.",
        path: [scenes.length - 1, "sectionRole"],
      });
    }
  });

export const StoryboardSchema = z.object({
  scenes: ScenesArraySchema,
  visualStylePrefix: z.string().min(5).max(300),
  totalDurationSec: z.number().int().min(30),
  meta: z.object({
    runId: z.string(),
    sceneCount: z.number().int(),
    avgSceneSec: z.number(),
    targetTotalSec: z.number().int(),
    generatedAt: z.string(),
    model: z.string(),
    retries: z.number().int().min(0).max(2),
  }),
});

export type Storyboard = z.infer<typeof StoryboardSchema>;

export const BANNED_TERMS: string[] = [
  "윤석열",
  "문재인",
  "김정은",
  "trump",
  "biden",
  "kim jong",
];

export interface ConsistencyResult {
  ok: boolean;
  issues: string[];
}

export function extractStyleKeywords(prefix: string): string[] {
  return prefix
    .split(/[\s,]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 4);
}

export function checkConsistency(
  storyboard: Storyboard,
  targetTotalSec: number
): ConsistencyResult {
  const issues: string[] = [];
  const keywords = extractStyleKeywords(storyboard.visualStylePrefix);

  // 1) 모든 imagePrompt가 visualStyle 키워드 최소 1개 포함
  if (keywords.length > 0) {
    const missing = storyboard.scenes.filter((s) => {
      const lower = s.imagePrompt.toLowerCase();
      return !keywords.some((k) => lower.includes(k));
    });
    if (missing.length > 0) {
      issues.push(
        `imagePrompt 중 ${missing.length}개가 visualStylePrefix 키워드를 포함하지 않습니다 (예: 씬 #${missing[0]!.index}).`
      );
    }
  }

  // 2) 총 길이 검증 (±20%)
  const totalActual = storyboard.scenes.reduce((sum, s) => sum + s.durationSec, 0);
  const minTotal = Math.floor(targetTotalSec * 0.8);
  const maxTotal = Math.ceil(targetTotalSec * 1.2);
  if (totalActual < minTotal || totalActual > maxTotal) {
    issues.push(
      `총 길이 ${totalActual}초가 목표 ${targetTotalSec}초의 ±20% (${minTotal}~${maxTotal}초) 범위를 벗어났습니다.`
    );
  }

  // 3) BANNED 단어 가드 (case-insensitive)
  const banHits: Array<{ index: number; term: string }> = [];
  for (const s of storyboard.scenes) {
    const haystack = `${s.imagePrompt}\n${s.caption}`.toLowerCase();
    for (const term of BANNED_TERMS) {
      if (haystack.includes(term.toLowerCase())) {
        banHits.push({ index: s.index, term });
      }
    }
  }
  if (banHits.length > 0) {
    const sample = banHits.slice(0, 3).map((h) => `씬 #${h.index}:"${h.term}"`).join(", ");
    issues.push(`금지어 발견 (${banHits.length}건): ${sample}`);
  }

  return { ok: issues.length === 0, issues };
}
