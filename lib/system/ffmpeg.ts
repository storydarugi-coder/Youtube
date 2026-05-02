import { execCommand, type ExecResult } from "@/lib/system/exec";

// ffmpeg-static의 default export는 절대경로 string. 호스트 PATH 미설치여도 동작.
let _ffmpegPath: string | null = null;
export function getFfmpegPath(): string {
  if (_ffmpegPath !== null) return _ffmpegPath;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("ffmpeg-static") as string | null;
    if (typeof mod === "string" && mod.length > 0) {
      _ffmpegPath = mod;
    } else {
      _ffmpegPath = "ffmpeg";
    }
  } catch {
    _ffmpegPath = "ffmpeg";
  }
  return _ffmpegPath;
}

export interface RunFfmpegOpts {
  args: string[];
  timeoutMs?: number;
}

export async function runFfmpeg(opts: RunFfmpegOpts): Promise<ExecResult> {
  return execCommand(getFfmpegPath(), opts.args, {
    timeoutMs: opts.timeoutMs ?? 120_000,
  });
}
