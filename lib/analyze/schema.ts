import { z } from "zod";

export const StyleGuideSchema = z.object({
  structure: z.object({
    hookPattern: z.string(),
    transitionStyle: z.string(),
    climaxPosition: z.enum(["early", "middle", "late"]),
    endingStyle: z.string(),
  }),
  toneAndVoice: z.object({
    register: z.enum(["casual", "formal", "mixed"]),
    distanceFromViewer: z.enum(["close", "neutral", "distant"]),
    exclamationFrequency: z.enum(["low", "medium", "high"]),
    notableExpressions: z.array(z.string()).max(10),
  }),
  retentionTactics: z.array(z.string()).max(10),
  audienceReaction: z.object({
    commonSentiments: z.array(z.string()).max(8),
    mostMentionedTopics: z.array(z.string()).max(8),
    satisfactionLevel: z.enum(["low", "medium", "high", "very_high"]),
  }),
  successFactors: z.array(z.string()).max(10),
  differentiators: z.array(z.string()).max(10),
  recommendedTopicSeeds: z.array(z.string()).max(6),
  meta: z.object({
    referenceCount: z.number().int().min(1).max(3),
    analyzedAt: z.string(),
    model: z.string(),
  }),
});

export type StyleGuide = z.infer<typeof StyleGuideSchema>;
