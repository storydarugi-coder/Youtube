import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, channels } from "@/lib/db/schema";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { StoryboardSchema } from "@/lib/storyboard/schema";
import { UploadMetaSchemaWithThumbnailRefine } from "@/lib/upload-meta/schema";
import {
  IMAGE_MODEL,
  SIZE_16_9,
  QUALITY_BODY,
  QUALITY_THUMB,
} from "./client";
import { generateOne } from "./generate-one";
import {
  ImagesJsonSchema,
  type ImageRecord,
  type ImagesJson,
} from "./schema";
import { renderImagesMarkdown } from "./render-md";

// Inngest step의 run은 Jsonify로 감싼 결과를 반환하므로 호출부에서 as 단언으로 풀어 사용.
export interface StepLike {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
}

export interface RunImagesResult {
  imagesPath: string;
  imagesMdPath: string;
  totalCostUsd: number;
  succeeded: number;
  failed: number;
  skippedExisting: number;
}

export interface RunImagesOpts {
  step: StepLike;
  concurrency?: number;
}

export function sceneFileName(index: number, total: number): string {
  const width = Math.max(2, String(total).length);
  return `${String(index).padStart(width, "0")}.png`;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function readExisting(runId: string): Promise<ImagesJson | null> {
  const p = path.join(runDir(runId), "images.json");
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = ImagesJsonSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isRecordResumable(rec: ImageRecord | undefined): boolean {
  if (!rec) return false;
  if (rec.status !== "done") return false;
  if (!rec.imagePath) return false;
  return true;
}

interface SceneJob {
  type: "scene";
  sceneIndex: number;
  caption: string;
  imagePrompt: string;
  fileName: string;
}
interface ThumbJob {
  type: "thumbnail";
  strategy: "emotion" | "contrast" | "mystery";
  imagePrompt: string;
  fileName: string;
}

export async function runImages(
  runId: string,
  opts: RunImagesOpts
): Promise<RunImagesResult> {
  const concurrency = opts.concurrency ?? 4;
  const startedAt = new Date().toISOString();

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);
  if (!run.storyboardPath) throw new Error("storyboardPath가 비어있습니다.");
  if (!run.metaPath) throw new Error("metaPath가 비어있습니다.");

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));
  if (!channel) throw new Error(`channel not found: ${run.channelId}`);

  const storyboard = StoryboardSchema.parse(
    JSON.parse(await fs.readFile(run.storyboardPath, "utf8"))
  );
  const uploadMeta = UploadMetaSchemaWithThumbnailRefine.parse(
    JSON.parse(await fs.readFile(run.metaPath, "utf8"))
  );

  const dir = runDir(runId);
  const scenesDir = path.join(dir, "scenes");
  const thumbsDir = path.join(dir, "thumbnails");
  await ensureDir(scenesDir);
  await ensureDir(thumbsDir);

  const existing = await readExisting(runId);
  const existingSceneByIndex = new Map<number, ImageRecord>();
  const existingThumbByStrategy = new Map<string, ImageRecord>();
  if (existing) {
    for (const r of existing.scenes) {
      if (r.sceneIndex !== null) existingSceneByIndex.set(r.sceneIndex, r);
    }
    for (const r of existing.thumbnails) {
      if (r.thumbnailStrategy)
        existingThumbByStrategy.set(r.thumbnailStrategy, r);
    }
  }

  const totalScenes = storyboard.scenes.length;
  const sceneJobs: SceneJob[] = storyboard.scenes.map((s) => ({
    type: "scene",
    sceneIndex: s.index,
    caption: s.caption,
    imagePrompt: `${storyboard.visualStylePrefix}, ${s.imagePrompt}`,
    fileName: sceneFileName(s.index, totalScenes),
  }));

  const thumbJobs: ThumbJob[] = uploadMeta.thumbnails.map((t) => ({
    type: "thumbnail",
    strategy: t.strategy,
    imagePrompt: t.imagePrompt,
    fileName: `${t.strategy}.png`,
  }));

  const sceneRecords: ImageRecord[] = [];
  const thumbRecords: ImageRecord[] = [];
  let skippedExisting = 0;

  // 씬 작업: 병렬 N
  for (let i = 0; i < sceneJobs.length; i += concurrency) {
    const chunk = sceneJobs.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (job) => {
        const prev = existingSceneByIndex.get(job.sceneIndex);
        const expectedPath = path.join(scenesDir, job.fileName);
        if (
          isRecordResumable(prev) &&
          (await fileExists(prev!.imagePath!))
        ) {
          skippedExisting += 1;
          return { ...prev!, status: "skipped" as const };
        }

        const result = (await opts.step.run(
          `gen-scene-${job.sceneIndex}`,
          async () => {
            return await generateOne({
              prompt: job.imagePrompt,
              visualStylePrefix: storyboard.visualStylePrefix,
              size: SIZE_16_9,
              quality: QUALITY_BODY,
              outDir: scenesDir,
              fileName: job.fileName,
            });
          }
        )) as Awaited<ReturnType<typeof generateOne>>;

        const base: Omit<
          ImageRecord,
          | "imagePath"
          | "status"
          | "errorMessage"
          | "attempts"
          | "costUsd"
          | "fallbackUsed"
          | "prompt"
          | "generatedAt"
        > = {
          type: "scene",
          sceneIndex: job.sceneIndex,
          thumbnailStrategy: null,
          promptOriginal: job.imagePrompt,
          size: SIZE_16_9,
          quality: QUALITY_BODY,
          model: IMAGE_MODEL,
        };

        if (result.ok) {
          return {
            ...base,
            prompt: result.finalPrompt,
            fallbackUsed: result.fallbackUsed,
            imagePath: result.imagePath,
            status: "done" as const,
            errorMessage: null,
            attempts: result.attempts,
            costUsd: result.costUsd,
            generatedAt: new Date().toISOString(),
          };
        }
        return {
          ...base,
          prompt: result.finalPrompt,
          fallbackUsed: result.fallbackUsed,
          imagePath: null,
          status: "failed" as const,
          errorMessage: result.errorMessage,
          attempts: result.attempts,
          costUsd: null,
          generatedAt: new Date().toISOString(),
        };
      })
    );
    sceneRecords.push(...chunkResults);
  }

  // 썸네일 작업: 병렬 3
  const thumbResults = await Promise.all(
    thumbJobs.map(async (job) => {
      const prev = existingThumbByStrategy.get(job.strategy);
      if (
        isRecordResumable(prev) &&
        (await fileExists(prev!.imagePath!))
      ) {
        skippedExisting += 1;
        return { ...prev!, status: "skipped" as const };
      }

      const result = (await opts.step.run(
        `gen-thumb-${job.strategy}`,
        async () => {
          return await generateOne({
            prompt: job.imagePrompt,
            visualStylePrefix: storyboard.visualStylePrefix,
            size: SIZE_16_9,
            quality: QUALITY_THUMB,
            outDir: thumbsDir,
            fileName: job.fileName,
          });
        }
      )) as Awaited<ReturnType<typeof generateOne>>;

      const base: Omit<
        ImageRecord,
        | "imagePath"
        | "status"
        | "errorMessage"
        | "attempts"
        | "costUsd"
        | "fallbackUsed"
        | "prompt"
        | "generatedAt"
      > = {
        type: "thumbnail",
        sceneIndex: null,
        thumbnailStrategy: job.strategy,
        promptOriginal: job.imagePrompt,
        size: SIZE_16_9,
        quality: QUALITY_THUMB,
        model: IMAGE_MODEL,
      };

      if (result.ok) {
        return {
          ...base,
          prompt: result.finalPrompt,
          fallbackUsed: result.fallbackUsed,
          imagePath: result.imagePath,
          status: "done" as const,
          errorMessage: null,
          attempts: result.attempts,
          costUsd: result.costUsd,
          generatedAt: new Date().toISOString(),
        };
      }
      return {
        ...base,
        prompt: result.finalPrompt,
        fallbackUsed: result.fallbackUsed,
        imagePath: null,
        status: "failed" as const,
        errorMessage: result.errorMessage,
        attempts: result.attempts,
        costUsd: null,
        generatedAt: new Date().toISOString(),
      };
    })
  );
  thumbRecords.push(...thumbResults);

  const allRecords = [...sceneRecords, ...thumbRecords];
  const succeeded = allRecords.filter((r) => r.status === "done").length;
  const failed = allRecords.filter((r) => r.status === "failed").length;
  const totalCostUsd = allRecords.reduce(
    (sum, r) => sum + (r.costUsd ?? 0),
    0
  );

  const completedAt = new Date().toISOString();

  const imagesJson: ImagesJson = {
    scenes: sceneRecords,
    thumbnails: thumbRecords as [ImageRecord, ImageRecord, ImageRecord],
    meta: {
      runId,
      totalScenes,
      totalThumbnails: 3,
      succeeded,
      failed,
      skippedExisting,
      totalCostUsd,
      startedAt,
      completedAt,
      model: IMAGE_MODEL,
    },
  };

  const imagesPath = path.join(dir, "images.json");
  await fs.writeFile(imagesPath, JSON.stringify(imagesJson, null, 2), "utf8");

  const md = renderImagesMarkdown(imagesJson, {
    channel: channel.name,
  });
  const imagesMdPath = path.join(dir, "images.md");
  await fs.writeFile(imagesMdPath, md, "utf8");

  if (succeeded === 0) {
    throw new Error(
      `이미지 생성 전부 실패 (씬 ${sceneRecords.length}개 + 썸네일 ${thumbRecords.length}개). 마지막 에러: ${allRecords.find((r) => r.errorMessage)?.errorMessage ?? "unknown"}`
    );
  }

  return {
    imagesPath,
    imagesMdPath,
    totalCostUsd,
    succeeded,
    failed,
    skippedExisting,
  };
}
