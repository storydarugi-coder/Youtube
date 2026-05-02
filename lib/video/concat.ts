import path from "node:path";
import fs from "node:fs/promises";
import { runFfmpeg } from "@/lib/system/ffmpeg";
import { buildConcatFfmpegArgs } from "./ffmpeg-config";

export interface ConcatInput {
  scenePaths: string[];
  outDir: string;
  outFileName: string;
}

export interface ConcatResult {
  videoPath: string;
}

/**
 * concat demuxer 입력 list 파일 본문.
 * 파일명 안에 '/'가 있을 수 있으므로 따옴표 + 백슬래시 이스케이프.
 */
export function buildConcatList(scenePaths: string[]): string {
  return (
    scenePaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n") + "\n"
  );
}

const CONCAT_TIMEOUT_MS = 180_000;

export async function concatScenes(input: ConcatInput): Promise<ConcatResult> {
  if (input.scenePaths.length === 0) {
    throw new Error("concat할 씬 mp4가 0개입니다.");
  }
  await fs.mkdir(input.outDir, { recursive: true });
  const listFile = path.join(input.outDir, "_concat-list.txt");
  await fs.writeFile(listFile, buildConcatList(input.scenePaths), "utf8");

  const outPath = path.join(input.outDir, input.outFileName);
  const result = await runFfmpeg({
    args: buildConcatFfmpegArgs(listFile, outPath),
    timeoutMs: CONCAT_TIMEOUT_MS,
  });
  // 리스트 파일은 흔적용으로 남겨둠 (디버깅 시 유용). 정리하려면 fs.rm 추가.
  if (result.code !== 0) {
    throw new Error(
      `ffmpeg concat failed (exit ${result.code}): ${result.stderr.slice(-400)}`
    );
  }
  const stat = await fs.stat(outPath).catch(() => null);
  if (!stat || stat.size === 0) {
    throw new Error("concat 결과 파일 크기 0");
  }
  return { videoPath: outPath };
}
