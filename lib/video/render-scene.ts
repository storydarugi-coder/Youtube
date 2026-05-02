import path from "node:path";
import fs from "node:fs/promises";
import { runFfmpeg } from "@/lib/system/ffmpeg";
import {
  buildSceneFfmpegArgs,
  PLACEHOLDER_DURATION_MS,
  MIN_SCENE_DURATION_MS,
} from "./ffmpeg-config";

export interface RenderSceneInput {
  sceneIndex: number;
  imagePath: string | null;
  audioPath: string | null;
  preferredDurationMs: number | null; // audio durationMs > storyboard.durationSec*1000 폴백
  outDir: string;
  fileName: string;
}

export type RenderSceneResult =
  | {
      ok: true;
      scenePath: string;
      durationMs: number;
      placeholder: boolean;
      attempts: number;
    }
  | { ok: false; errorMessage: string; attempts: number };

const TIMEOUT_MS = 60_000;

async function fileExists(p: string | null): Promise<boolean> {
  if (!p) return false;
  try {
    const st = await fs.stat(p);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

export async function renderScene(
  input: RenderSceneInput
): Promise<RenderSceneResult> {
  const outPath = path.join(input.outDir, input.fileName);
  await fs.mkdir(input.outDir, { recursive: true });

  const imageOK = await fileExists(input.imagePath);
  const audioOK = await fileExists(input.audioPath);
  const placeholder = !imageOK && !audioOK;

  // 길이 결정: audio 우선 → 폴백 → 최소값
  let durationMs = input.preferredDurationMs ?? 0;
  if (durationMs < MIN_SCENE_DURATION_MS) {
    durationMs = placeholder ? PLACEHOLDER_DURATION_MS : Math.max(durationMs, 1000);
  }

  let attempts = 0;
  let lastError: string | null = null;

  while (attempts < 2) {
    attempts += 1;
    try {
      const args = buildSceneFfmpegArgs({
        imagePath: imageOK ? input.imagePath : null,
        audioPath: audioOK ? input.audioPath : null,
        durationMs,
        outPath,
      });
      const result = await runFfmpeg({ args, timeoutMs: TIMEOUT_MS });
      if (result.code !== 0) {
        lastError = `ffmpeg exit ${result.code}: ${result.stderr.slice(-400)}`;
        continue;
      }
      // 결과 파일 검증
      const stat = await fs.stat(outPath).catch(() => null);
      if (!stat || stat.size === 0) {
        lastError = "ffmpeg 종료는 했지만 결과 파일 크기 0";
        continue;
      }
      return {
        ok: true,
        scenePath: outPath,
        durationMs,
        placeholder,
        attempts,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    ok: false,
    errorMessage: lastError ?? "unknown error",
    attempts,
  };
}
