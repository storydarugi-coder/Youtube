import path from "node:path";
import fs from "node:fs/promises";

const RUNS_ROOT = path.join(process.cwd(), "runs");

export function runDir(runId: string) {
  return path.join(RUNS_ROOT, runId);
}

export function refsRoot(runId: string) {
  return path.join(runDir(runId), "refs");
}

export function refDir(runId: string, videoId: string) {
  return path.join(refsRoot(runId), videoId);
}

export async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureRefDir(runId: string, videoId: string) {
  const dir = refDir(runId, videoId);
  await ensureDir(dir);
  return dir;
}

export const refFiles = {
  subtitles: "subtitles.txt",
  comments: "comments.json",
  thumbnail: "thumbnail.jpg",
  meta: "meta.json",
} as const;
