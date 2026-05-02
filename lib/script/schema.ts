import { z } from "zod";

export const SectionRoleEnum = z.enum([
  "hook",
  "background",
  "body",
  "climax",
  "ending",
  "outro",
]);
export type SectionRole = z.infer<typeof SectionRoleEnum>;

export const ScriptSectionSchema = z.object({
  role: SectionRoleEnum,
  title: z.string().min(2).max(80),
  estimatedSeconds: z.number().int().min(5).max(600),
  text: z.string().min(30),
  transitionToNext: z.string().max(200).optional(),
});
export type ScriptSection = z.infer<typeof ScriptSectionSchema>;

const SectionsArraySchema = z
  .array(ScriptSectionSchema)
  .min(5)
  .max(12)
  .superRefine((sections, ctx) => {
    if (sections.length === 0) return;
    if (sections[0]!.role !== "hook") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "첫 section의 role은 'hook'이어야 합니다.",
        path: [0, "role"],
      });
    }
    const last = sections[sections.length - 1]!;
    if (last.role !== "outro") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "마지막 section의 role은 'outro'여야 합니다.",
        path: [sections.length - 1, "role"],
      });
    }
    const bodyCount = sections.filter((s) => s.role === "body").length;
    if (bodyCount < 2 || bodyCount > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `body section은 2~5개 사이여야 합니다 (현재 ${bodyCount}개).`,
      });
    }
    const climaxCount = sections.filter((s) => s.role === "climax").length;
    if (climaxCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `climax section은 0개 또는 1개여야 합니다 (현재 ${climaxCount}개).`,
      });
    }
  });

export const ScriptOutputSchema = z.object({
  sections: SectionsArraySchema,
  selfReview: z.object({
    issuesFound: z.array(z.string()).max(10),
    revisionsApplied: z.array(z.string()).max(10),
    factualClaimsUsed: z.array(z.string()).max(10),
    redFlagsAvoided: z.array(z.string()).max(8),
    confidenceLevel: z.enum(["low", "medium", "high"]),
  }),
  meta: z.object({
    runId: z.string(),
    durationMin: z.number().int(),
    targetCharCount: z.number().int(),
    actualCharCount: z.number().int(),
    sectionCount: z.number().int(),
    generatedAt: z.string(),
    model: z.string(),
    retries: z.number().int().min(0).max(3),
  }),
});
export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;

export function totalCharCount(sections: ScriptSection[]): number {
  return sections.reduce((sum, s) => sum + s.text.length, 0);
}
