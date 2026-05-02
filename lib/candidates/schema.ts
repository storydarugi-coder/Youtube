import { z } from "zod";

export const TitleFormulaEnum = z.enum([
  "shock",
  "question",
  "contrast",
  "list",
  "storytelling",
]);
export type TitleFormula = z.infer<typeof TitleFormulaEnum>;

const indexEnum = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const CandidatesSchema = z.object({
  topics: z
    .array(
      z.object({
        index: indexEnum,
        title: z.string().max(80),
        description: z.string().max(400),
        rationale: z.string().max(300),
      })
    )
    .length(3),
  audiences: z
    .array(
      z.object({
        index: indexEnum,
        label: z.string().max(60),
        ageRange: z.string().max(20),
        interests: z.array(z.string()).max(5),
        motivation: z.string().max(200),
      })
    )
    .length(3),
  titles: z
    .array(
      z.object({
        index: indexEnum,
        text: z.string().min(8).max(60),
        formula: TitleFormulaEnum,
        rationale: z.string().max(300),
      })
    )
    .length(3),
  meta: z.object({
    runId: z.string(),
    generatedAt: z.string(),
    model: z.string(),
  }),
});

export type Candidates = z.infer<typeof CandidatesSchema>;

export const SelectionsSchema = z.object({
  topicIndex: indexEnum,
  audienceIndex: indexEnum,
  titleIndex: indexEnum,
  customNote: z.string().max(500).optional(),
  submittedAt: z.string(),
});

export type Selections = z.infer<typeof SelectionsSchema>;
