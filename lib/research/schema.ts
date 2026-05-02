import { z } from "zod";

export const SourceSchema = z.object({
  title: z.string().max(200),
  url: z.string().url(),
  excerpt: z.string().max(500).optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const VerdictEnum = z.enum(["verified", "disputed", "false", "unknown"]);
export const ConfidenceEnum = z.enum(["low", "medium", "high"]);

export const FactcheckSchema = z.object({
  claims: z
    .array(
      z.object({
        claim: z.string().max(300),
        verdict: VerdictEnum,
        confidence: ConfidenceEnum,
        explanation: z.string().max(800),
        sources: z.array(SourceSchema).min(1).max(5),
      })
    )
    .min(3)
    .max(10),
  overallAssessment: z.string().max(1000),
  redFlags: z.array(z.string()).max(8),
  meta: z.object({
    runId: z.string(),
    topicTitle: z.string(),
    searchedAt: z.string(),
    model: z.string(),
    webSearchCount: z.number().int().min(0),
  }),
});
export type Factcheck = z.infer<typeof FactcheckSchema>;

export const ResearchSchema = z.object({
  anecdotes: z
    .array(
      z.object({
        title: z.string().max(120),
        summary: z.string().max(600),
        relevance: z.string().max(300),
        sources: z.array(SourceSchema).min(1).max(3),
      })
    )
    .max(8),
  quotes: z
    .array(
      z.object({
        text: z.string().max(400),
        speaker: z.string().max(120).optional(),
        context: z.string().max(300),
        sources: z.array(SourceSchema).min(1).max(3),
      })
    )
    .max(6),
  modernConnections: z
    .array(
      z.object({
        point: z.string().max(300),
        explanation: z.string().max(500),
        sources: z.array(SourceSchema).max(3),
      })
    )
    .max(5),
  visualAssetIdeas: z
    .array(
      z.object({
        description: z.string().max(300),
        purpose: z.string().max(200),
      })
    )
    .max(8),
  additionalNotes: z.string().max(1000).optional(),
  meta: z.object({
    runId: z.string(),
    topicTitle: z.string(),
    searchedAt: z.string(),
    model: z.string(),
    webSearchCount: z.number().int().min(0),
  }),
});
export type Research = z.infer<typeof ResearchSchema>;
