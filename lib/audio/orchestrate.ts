import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, channels } from "@/lib/db/schema";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { StoryboardSchema } from "@/lib/storyboard/schema";
import { TTS_MODEL } from "./client";
import { generateOneTts } from "./generate-one";
import {
  AudioJsonSchema,
  type AudioRecord,
  type AudioJson,
} from "./schema";
import { renderAudioMarkdown } from "./render-md";

export interface StepLike {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
}

export interface RunAudioResult {
  audioPath: string;
  audioMdPath: string;
  totalCostUsd: number;
  totalDurationMs: number;
  succeeded: number;
  failed: number;
  skippedExisting: number;
}

export interface RunAudioOpts {
  step: StepLike;
  concurrency?: number;
}

export function audioFileName(index: number, total: number): string {
  const width = Math.max(2, String(total).length);
  return `${String(index).padStart(width, "0")}.mp3`;
}

export function resolveVoiceId(
  channelTtsVoiceId: string | null
): { voiceId: string } | { error: string } {
  const channelVoice = channelTtsVoiceId?.trim();
  if (channelVoice) return { voiceId: channelVoice };
  const envVoice = process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim();
  if (envVoice) return { voiceId: envVoice };
  return {
    error:
      "voiceId 미설정 — channel.ttsVoiceId 또는 ELEVENLABS_DEFAULT_VOICE_ID 환경변수가 필요합니다.",
  };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function readExisting(runId: string): Promise<AudioJson | null> {
  const p = path.join(runDir(runId), "audio.json");
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = AudioJsonSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function isResumable(rec: AudioRecord | undefined): boolean {
  if (!rec) return false;
  if (rec.status !== "done") return false;
  if (!rec.audioPath) return false;
  return true;
}

export async function runAudio(
  runId: string,
  opts: RunAudioOpts
): Promise<RunAudioResult> {
  const concurrency = opts.concurrency ?? 4;
  const startedAt = new Date().toISOString();

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);
  if (!run.storyboardPath) throw new Error("storyboardPath가 비어있습니다.");

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));
  if (!channel) throw new Error(`channel not found: ${run.channelId}`);

  const resolved = resolveVoiceId(channel.ttsVoiceId);
  if ("error" in resolved) {
    throw new Error(resolved.error);
  }
  const voiceId = resolved.voiceId;

  const storyboard = StoryboardSchema.parse(
    JSON.parse(await fs.readFile(run.storyboardPath, "utf8"))
  );

  const dir = runDir(runId);
  const audioDir = path.join(dir, "audio");
  await ensureDir(audioDir);

  const existing = await readExisting(runId);
  const existingByIndex = new Map<number, AudioRecord>();
  if (existing) {
    for (const r of existing.scenes) {
      existingByIndex.set(r.sceneIndex, r);
    }
  }

  const totalScenes = storyboard.scenes.length;
  let skippedExisting = 0;

  const sceneRecords: AudioRecord[] = [];

  for (let i = 0; i < storyboard.scenes.length; i += concurrency) {
    const chunk = storyboard.scenes.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (scene): Promise<AudioRecord> => {
        const fileName = audioFileName(scene.index, totalScenes);
        const text = scene.caption.trim();
        const charCount = text.length;
        const baseRecord = (extra: Partial<AudioRecord>): AudioRecord => ({
          sceneIndex: scene.index,
          text,
          charCount,
          voiceId,
          model: TTS_MODEL,
          audioPath: null,
          durationMs: null,
          status: "pending",
          errorMessage: null,
          attempts: 0,
          costUsd: null,
          generatedAt: null,
          ...extra,
        });

        // 빈 텍스트는 자동 skipped
        if (text.length === 0) {
          skippedExisting += 1;
          return baseRecord({
            status: "skipped",
            errorMessage: "caption 비어있음 — TTS 스킵",
          });
        }

        // 재개 검사
        const prev = existingByIndex.get(scene.index);
        if (isResumable(prev) && (await fileExists(prev!.audioPath!))) {
          skippedExisting += 1;
          return { ...prev!, status: "skipped" };
        }

        const result = (await opts.step.run(
          `tts-scene-${scene.index}`,
          async () => {
            return await generateOneTts({
              text,
              voiceId,
              outDir: audioDir,
              fileName,
            });
          }
        )) as Awaited<ReturnType<typeof generateOneTts>>;

        if (result.ok) {
          return baseRecord({
            audioPath: result.audioPath,
            durationMs: result.durationMs,
            status: "done",
            attempts: result.attempts,
            costUsd: result.costUsd,
            generatedAt: new Date().toISOString(),
          });
        }
        return baseRecord({
          status: "failed",
          errorMessage: result.errorMessage,
          attempts: result.attempts,
          generatedAt: new Date().toISOString(),
        });
      })
    );
    sceneRecords.push(...chunkResults);
  }

  const succeeded = sceneRecords.filter((r) => r.status === "done").length;
  const failed = sceneRecords.filter((r) => r.status === "failed").length;
  const totalDurationMs = sceneRecords.reduce(
    (sum, r) => sum + (r.durationMs ?? 0),
    0
  );
  const totalCharCount = sceneRecords
    .filter((r) => r.status === "done")
    .reduce((sum, r) => sum + r.charCount, 0);
  const totalCostUsd = sceneRecords.reduce(
    (sum, r) => sum + (r.costUsd ?? 0),
    0
  );

  const completedAt = new Date().toISOString();
  const audioJson: AudioJson = {
    scenes: sceneRecords,
    meta: {
      runId,
      totalScenes,
      succeeded,
      failed,
      skippedExisting,
      totalDurationMs,
      totalCharCount,
      totalCostUsd,
      voiceId,
      model: TTS_MODEL,
      startedAt,
      completedAt,
    },
  };

  const audioPath = path.join(dir, "audio.json");
  await fs.writeFile(audioPath, JSON.stringify(audioJson, null, 2), "utf8");

  const md = renderAudioMarkdown(audioJson, { channel: channel.name });
  const audioMdPath = path.join(dir, "audio.md");
  await fs.writeFile(audioMdPath, md, "utf8");

  if (succeeded === 0 && skippedExisting === 0) {
    throw new Error(
      `TTS 생성 전부 실패 (${sceneRecords.length}개 씬). 마지막 에러: ${sceneRecords.find((r) => r.errorMessage)?.errorMessage ?? "unknown"}`
    );
  }

  return {
    audioPath,
    audioMdPath,
    totalCostUsd,
    totalDurationMs,
    succeeded,
    failed,
    skippedExisting,
  };
}
