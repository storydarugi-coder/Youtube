import { execCommand } from "@/lib/system/exec";

// Use bundled binary from @ffprobe-installer/ffprobe (auto-installed via npm)
// 호스트에 ffprobe 미설치여도 동작하게 보강 (M10에서 호스트 의존이었던 부분 해결).
let _ffprobePath: string | null = null;
function getFfprobePath(): string {
  if (_ffprobePath !== null) return _ffprobePath;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require("@ffprobe-installer/ffprobe") as { path: string };
    _ffprobePath = installer.path;
  } catch {
    _ffprobePath = "ffprobe"; // 호스트 PATH 폴백
  }
  return _ffprobePath;
}

export async function getMp3DurationMs(mp3Path: string): Promise<number> {
  const result = await execCommand(
    getFfprobePath(),
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      mp3Path,
    ],
    { timeoutMs: 15_000 }
  );
  if (result.code !== 0) {
    throw new Error(`ffprobe failed (code ${result.code}): ${result.stderr.slice(0, 300)}`);
  }
  const sec = parseFloat(result.stdout.trim());
  if (!Number.isFinite(sec)) {
    throw new Error(`ffprobe returned non-numeric: ${result.stdout}`);
  }
  return Math.round(sec * 1000);
}

export async function getMediaDurationMs(filePath: string): Promise<number> {
  return getMp3DurationMs(filePath);
}
