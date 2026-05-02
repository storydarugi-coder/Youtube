import { z } from "zod";
import { extractStyleKeywords } from "@/lib/storyboard/schema";

export const ThumbnailStrategyEnum = z.enum(["emotion", "contrast", "mystery"]);
export type ThumbnailStrategy = z.infer<typeof ThumbnailStrategyEnum>;

export const TimestampSchema = z.object({
  time: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/),
  label: z.string().min(2).max(60),
});
export type Timestamp = z.infer<typeof TimestampSchema>;

export const ThumbnailPromptSchema = z.object({
  strategy: ThumbnailStrategyEnum,
  imagePrompt: z.string().min(60).max(1500),
  textOverlay: z.string().min(2).max(20),
  rationale: z.string().max(300),
});
export type ThumbnailPrompt = z.infer<typeof ThumbnailPromptSchema>;

export const UploadMetaSchema = z.object({
  title: z.string().min(8).max(60),
  description: z.object({
    intro: z.string().min(50).max(600),
    timestamps: z.array(TimestampSchema).min(3).max(15),
    summary: z.string().min(100).max(1200),
    hashtags: z.array(z.string().regex(/^#\S+$/)).min(3).max(10),
  }),
  tags: z.array(z.string().min(2).max(40)).min(15).max(20),
  category: z.string().min(2).max(60),
  thumbnails: z.array(ThumbnailPromptSchema).length(3),
  meta: z.object({
    runId: z.string(),
    titleSource: z.enum(["selected", "revised"]),
    descriptionCharCount: z.number().int(),
    generatedAt: z.string(),
    model: z.string(),
    retries: z.number().int().min(0).max(2),
  }),
});

export const UploadMetaSchemaWithThumbnailRefine = UploadMetaSchema.superRefine(
  (data, ctx) => {
    const strategies = new Set(data.thumbnails.map((t) => t.strategy));
    if (strategies.size !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "썸네일 3종은 emotion/contrast/mystery 각 1개씩이어야 합니다.",
        path: ["thumbnails"],
      });
    }
  }
);

export type UploadMeta = z.infer<typeof UploadMetaSchema>;

function timeToSeconds(t: string): number {
  const parts = t.split(":").map((p) => parseInt(p, 10));
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return 0;
}

function countWords(s: string): number {
  return s
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 1).length;
}

export function checkUploadMetaConsistency(
  meta: UploadMeta,
  visualStylePrefix: string
): string[] {
  const issues: string[] = [];

  // 1) 제목 글자수 (한글 char 기준)
  const titleLen = Array.from(meta.title).length;
  if (titleLen < 12 || titleLen > 30) {
    issues.push(
      `제목 글자수가 ${titleLen}자입니다. 12~30자 범위여야 합니다.`
    );
  }

  // 2) 설명 총 길이
  const descTotal =
    meta.description.intro.length +
    meta.description.summary.length +
    meta.description.hashtags.join(" ").length;
  if (descTotal < 1000 || descTotal > 3000) {
    issues.push(
      `설명 총 길이가 ${descTotal}자입니다. 1000~3000자 범위여야 합니다.`
    );
  }

  // 3) 태그 중복
  if (new Set(meta.tags).size !== meta.tags.length) {
    issues.push(`태그에 중복이 있습니다.`);
  }

  // 4) textOverlay 단어수 (2~5)
  meta.thumbnails.forEach((t, i) => {
    const wc = countWords(t.textOverlay);
    if (wc < 2 || wc > 5) {
      issues.push(
        `썸네일 ${i + 1}(${t.strategy})의 textOverlay 단어수가 ${wc}입니다. 2~5단어여야 합니다.`
      );
    }
  });

  // 5) 썸네일 imagePrompt에 visualStyle 키워드 1개 이상
  const keywords = extractStyleKeywords(visualStylePrefix);
  if (keywords.length > 0) {
    meta.thumbnails.forEach((t, i) => {
      const lower = t.imagePrompt.toLowerCase();
      const hasKw = keywords.some((k) => lower.includes(k));
      if (!hasKw) {
        issues.push(
          `썸네일 ${i + 1}(${t.strategy})의 imagePrompt가 visualStylePrefix 키워드를 포함하지 않습니다.`
        );
      }
    });
  }

  // 6) timestamps 정렬
  for (let i = 1; i < meta.description.timestamps.length; i++) {
    const prev = timeToSeconds(meta.description.timestamps[i - 1]!.time);
    const cur = timeToSeconds(meta.description.timestamps[i]!.time);
    if (cur < prev) {
      issues.push(
        `timestamps가 시간 오름차순이 아닙니다 (${i}번째: ${meta.description.timestamps[i]!.time} < 직전 ${meta.description.timestamps[i - 1]!.time}).`
      );
      break;
    }
  }

  return issues;
}
