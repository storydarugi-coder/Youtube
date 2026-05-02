import { execCommand } from "@/lib/system/exec";

export async function getMp3DurationMs(mp3Path: string): Promise<number> {
  const result = await execCommand(
    "ffprobe",
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
