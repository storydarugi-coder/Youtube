import { z } from "zod";

export const SceneRenderStatusEnum = z.enum([
  "pending",
  "done",
  "failed",
  "skipped",
  "placeholder", // 입력 누락 → 검정 폴백
]);

export const SceneRenderSchema = z.object({
  sceneIndex: z.number().int().min(1),
  imagePath: z.string().nullable(),
  audioPath: z.string().nullable(),
  durationMs: z.number().int().min(100),
  scenePath: z.string().nullable(),
  status: SceneRenderStatusEnum,
  errorMessage: z.string().nullable(),
  attempts: z.number().int().min(0).max(3),
  generatedAt: z.string().nullable(),
});
export type SceneRender = z.infer<typeof SceneRenderSchema>;

export const VideoJsonSchema = z.object({
  scenes: z.array(SceneRenderSchema),
  videoPath: z.string().nullable(),
  srtPath: z.string().nullable(),
  meta: z.object({
    runId: z.string(),
    totalScenes: z.number().int(),
    succeeded: z.number().int(),
    placeholders: z.number().int(),
    failed: z.number().int(),
    skippedExisting: z.number().int(),
    totalDurationMs: z.number().int(),
    width: z.number().int(),
    height: z.number().int(),
    fps: z.number().int(),
    videoCodec: z.string(),
    audioCodec: z.string(),
    crf: z.number().int(),
    preset: z.string(),
    ffmpegVersion: z.string(),
    startedAt: z.string(),
    completedAt: z.string(),
  }),
});
export type VideoJson = z.infer<typeof VideoJsonSchema>;
