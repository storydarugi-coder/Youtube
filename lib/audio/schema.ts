import { z } from "zod";

export const AudioStatusEnum = z.enum(["pending", "done", "failed", "skipped"]);

export const AudioRecordSchema = z.object({
  sceneIndex: z.number().int().min(1),
  text: z.string().min(1),
  charCount: z.number().int(),
  voiceId: z.string(),
  model: z.string(),
  audioPath: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  status: AudioStatusEnum,
  errorMessage: z.string().nullable(),
  attempts: z.number().int().min(0).max(5),
  costUsd: z.number().nullable(),
  generatedAt: z.string().nullable(),
});
export type AudioRecord = z.infer<typeof AudioRecordSchema>;

export const AudioJsonSchema = z.object({
  scenes: z.array(AudioRecordSchema),
  meta: z.object({
    runId: z.string(),
    totalScenes: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    skippedExisting: z.number().int(),
    totalDurationMs: z.number().int(),
    totalCharCount: z.number().int(),
    totalCostUsd: z.number(),
    voiceId: z.string(),
    model: z.string(),
    startedAt: z.string(),
    completedAt: z.string(),
  }),
});
export type AudioJson = z.infer<typeof AudioJsonSchema>;
