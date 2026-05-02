import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, channels } from "@/lib/db/schema";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { runFfmpeg } from "@/lib/system/ffmpeg";
import { StoryboardSchema } from "@/lib/storyboard/schema";
import { ImagesJsonSchema } from "@/lib/images/schema";
import { AudioJsonSchema } from "@/lib/audio/schema";
import {
  VideoJsonSchema,
  type SceneRender,
  type VideoJson,
} from "./schema";
import { renderScene } from "./render-scene";
import { concatScenes } from "./concat";
import { renderSrtFromScenes } from "./render-srt";
import { renderVideoMarkdown } from "./render-md";
import {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  VIDEO_FPS,
  VIDEO_CODEC,
  VIDEO_PRESET,
  VIDEO_CRF,
  AUDIO_CODEC,
} from "./ffmpeg-config";

export interface StepLike {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
}

export interface RunVideoResult {
  videoPath: string;
  srtPath: string;
  videoMdPath: string;
  totalDurationMs: number;
  succeeded: number;
  placeholders: number;
  failed: number;
  skippedExisting: number;
}

export interface RunVideoOpts {
  step: StepLike;
  concurrency?: number;
}

export function sceneMp4FileName(index: number, total: number): string {
  const width = Math.max(2, String(total).length);
  return `${String(index).padStart(width, "0")}.mp4`;
}

async function fileExists(p: string | null): Promise<boolean> {
  if (!p) return false;
  try {
    const st = await fs.stat(p);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

async function readExisting(runId: string): Promise<VideoJson | null> {
  const p = path.join(runDir(runId), "video.json");
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = VideoJsonSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isResumable(rec: SceneRender | undefined): boolean {
  if (!rec) return false;
  if (rec.status !== "done" && rec.status !== "placeholder") return false;
  if (!rec.scenePath) return false;
  return true;
}

async function getFfmpegVersion(): Promise<string> {
  try {
    const r = await runFfmpeg({ args: ["-version"], timeoutMs: 5000 });
    const firstLine = r.stdout.split("\n")[0] ?? "";
    return firstLine.replace(/^ffmpeg version\s*/, "").split(/\s+/)[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function runVideo(
  runId: string,
  opts: RunVideoOpts
): Promise<RunVideoResult> {
  const concurrency = opts.concurrency ?? 2;
  const startedAt = new Date().toISOString();

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);
  if (!run.storyboardPath) throw new Error("storyboardPath가 비어있습니다.");
  if (!run.imagesPath) throw new Error("imagesPath가 비어있습니다. M9 미완료.");
  if (!run.audioPath) throw new Error("audioPath가 비어있습니다. M10 미완료.");

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));
  if (!channel) throw new Error(`channel not found: ${run.channelId}`);

  const storyboard = StoryboardSchema.parse(
    JSON.parse(await fs.readFile(run.storyboardPath, "utf8"))
  );
  const images = ImagesJsonSchema.parse(
    JSON.parse(await fs.readFile(run.imagesPath, "utf8"))
  );
  const audio = AudioJsonSchema.parse(
    JSON.parse(await fs.readFile(run.audioPath, "utf8"))
  );

  // 인덱스 매핑
  const imageByIndex = new Map<number, string | null>();
  for (const r of images.scenes) {
    if (r.sceneIndex !== null) {
      imageByIndex.set(
        r.sceneIndex,
        r.status === "done" || r.status === "skipped" ? r.imagePath : null
      );
    }
  }
  const audioByIndex = new Map<number, { audioPath: string | null; durationMs: number | null }>();
  for (const r of audio.scenes) {
    audioByIndex.set(r.sceneIndex, {
      audioPath:
        r.status === "done" || r.status === "skipped" ? r.audioPath : null,
      durationMs: r.durationMs,
    });
  }

  const dir = runDir(runId);
  const scenesMp4Dir = path.join(dir, "scenes-mp4");
  const videoDir = path.join(dir, "video");
  await ensureDir(scenesMp4Dir);
  await ensureDir(videoDir);

  const existing = await readExisting(runId);
  const existingByIndex = new Map<number, SceneRender>();
  if (existing) {
    for (const r of existing.scenes) existingByIndex.set(r.sceneIndex, r);
  }

  const totalScenes = storyboard.scenes.length;
  let skippedExisting = 0;

  const sceneRenders: SceneRender[] = [];

  // 씬 병렬 N
  for (let i = 0; i < storyboard.scenes.length; i += concurrency) {
    const chunk = storyboard.scenes.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (scene): Promise<SceneRender> => {
        const fileName = sceneMp4FileName(scene.index, totalScenes);
        const expectedPath = path.join(scenesMp4Dir, fileName);
        const imagePath = imageByIndex.get(scene.index) ?? null;
        const audioRec = audioByIndex.get(scene.index);
        const audioPath = audioRec?.audioPath ?? null;
        // 길이: audio durationMs > storyboard durationSec * 1000 폴백
        const preferredDurationMs =
          audioRec?.durationMs ?? scene.durationSec * 1000;

        // 재개
        const prev = existingByIndex.get(scene.index);
        if (isResumable(prev) && (await fileExists(prev!.scenePath!))) {
          skippedExisting += 1;
          return { ...prev!, status: "skipped" };
        }

        const result = (await opts.step.run(
          `render-scene-${scene.index}`,
          async () => {
            return await renderScene({
              sceneIndex: scene.index,
              imagePath,
              audioPath,
              preferredDurationMs,
              outDir: scenesMp4Dir,
              fileName,
            });
          }
        )) as Awaited<ReturnType<typeof renderScene>>;

        if (result.ok) {
          return {
            sceneIndex: scene.index,
            imagePath,
            audioPath,
            durationMs: result.durationMs,
            scenePath: result.scenePath,
            status: result.placeholder ? "placeholder" : "done",
            errorMessage: null,
            attempts: result.attempts,
            generatedAt: new Date().toISOString(),
          };
        }
        // 실패: 빈 mp4 생기지 않게 별도 처리. 영상 합성 계속 가능하도록 검정 placeholder로 자동 폴백 1회.
        const fbResult = (await opts.step.run(
          `render-scene-${scene.index}-fallback`,
          async () => {
            return await renderScene({
              sceneIndex: scene.index,
              imagePath: null,
              audioPath: null,
              preferredDurationMs,
              outDir: scenesMp4Dir,
              fileName,
            });
          }
        )) as Awaited<ReturnType<typeof renderScene>>;

        if (fbResult.ok) {
          return {
            sceneIndex: scene.index,
            imagePath,
            audioPath,
            durationMs: fbResult.durationMs,
            scenePath: fbResult.scenePath,
            status: "placeholder",
            errorMessage: result.errorMessage,
            attempts: result.attempts + fbResult.attempts,
            generatedAt: new Date().toISOString(),
          };
        }
        return {
          sceneIndex: scene.index,
          imagePath,
          audioPath,
          durationMs: preferredDurationMs,
          scenePath: null,
          status: "failed",
          errorMessage: result.errorMessage,
          attempts: result.attempts + fbResult.attempts,
          generatedAt: new Date().toISOString(),
        };
      })
    );
    sceneRenders.push(...chunkResults);
  }

  const succeeded = sceneRenders.filter((r) => r.status === "done").length;
  const placeholders = sceneRenders.filter(
    (r) => r.status === "placeholder"
  ).length;
  const failed = sceneRenders.filter((r) => r.status === "failed").length;

  // concat: 성공 + placeholder + skipped 모든 mp4 사용 (시간순)
  const usableScenes = sceneRenders
    .slice()
    .sort((a, b) => a.sceneIndex - b.sceneIndex)
    .filter((r) => r.scenePath);

  if (usableScenes.length === 0) {
    throw new Error("합성 가능한 씬 mp4가 0개입니다 (전부 실패).");
  }

  const concatResult = await opts.step.run("concat", async () => {
    return await concatScenes({
      scenePaths: usableScenes.map((r) => r.scenePath!),
      outDir: videoDir,
      outFileName: "final.mp4",
    });
  });
  const videoPath = (concatResult as { videoPath: string }).videoPath;

  // SRT
  const srtPath = path.join(videoDir, "final.srt");
  const srtBody = renderSrtFromScenes(
    storyboard.scenes.map((s) => ({
      sceneIndex: s.index,
      caption: s.caption,
      durationMs:
        sceneRenders.find((r) => r.sceneIndex === s.index)?.durationMs ??
        s.durationSec * 1000,
    }))
  );
  await fs.writeFile(srtPath, srtBody, "utf8");

  const totalDurationMs = sceneRenders.reduce(
    (sum, r) => sum + r.durationMs,
    0
  );
  const completedAt = new Date().toISOString();
  const ffmpegVersion = await getFfmpegVersion();

  const videoJson: VideoJson = {
    scenes: sceneRenders,
    videoPath,
    srtPath,
    meta: {
      runId,
      totalScenes,
      succeeded,
      placeholders,
      failed,
      skippedExisting,
      totalDurationMs,
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      fps: VIDEO_FPS,
      videoCodec: VIDEO_CODEC,
      audioCodec: AUDIO_CODEC,
      crf: VIDEO_CRF,
      preset: VIDEO_PRESET,
      ffmpegVersion,
      startedAt,
      completedAt,
    },
  };

  const videoJsonPath = path.join(dir, "video.json");
  await fs.writeFile(
    videoJsonPath,
    JSON.stringify(videoJson, null, 2),
    "utf8"
  );

  const md = renderVideoMarkdown(videoJson, {
    channel: channel.name,
    runId,
  });
  const videoMdPath = path.join(dir, "video.md");
  await fs.writeFile(videoMdPath, md, "utf8");

  return {
    videoPath,
    srtPath,
    videoMdPath,
    totalDurationMs,
    succeeded,
    placeholders,
    failed,
    skippedExisting,
  };
}
