import { z } from "zod";

export const ImageTypeEnum = z.enum(["scene", "thumbnail"]);
export const ImageStatusEnum = z.enum(["pending", "done", "failed", "skipped"]);
export const ThumbnailStrategyEnum = z.enum(["emotion", "contrast", "mystery"]);

export const ImageRecordSchema = z.object({
  type: ImageTypeEnum,
  sceneIndex: z.number().int().nullable(),
  thumbnailStrategy: ThumbnailStrategyEnum.nullable(),
  prompt: z.string().min(20),
  promptOriginal: z.string(),
  fallbackUsed: z.boolean(),
  imagePath: z.string().nullable(),
  status: ImageStatusEnum,
  errorMessage: z.string().nullable(),
  attempts: z.number().int().min(0).max(5),
  costUsd: z.number().nullable(),
  size: z.string(),
  quality: z.string(),
  model: z.string(),
  generatedAt: z.string().nullable(),
});
export type ImageRecord = z.infer<typeof ImageRecordSchema>;

export const ImagesJsonSchema = z.object({
  scenes: z.array(ImageRecordSchema),
  thumbnails: z.array(ImageRecordSchema).length(3),
  meta: z.object({
    runId: z.string(),
    totalScenes: z.number().int(),
    totalThumbnails: z.literal(3),
    succeeded: z.number().int(),
    failed: z.number().int(),
    skippedExisting: z.number().int(),
    totalCostUsd: z.number(),
    startedAt: z.string(),
    completedAt: z.string(),
    model: z.string(),
  }),
});
export type ImagesJson = z.infer<typeof ImagesJsonSchema>;
