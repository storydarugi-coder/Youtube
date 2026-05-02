import path from "node:path";
import fs from "node:fs/promises";
import { execCommand } from "@/lib/system/exec";

export interface VideoMeta {
  videoId: string;
  title: string;
  viewCount: number | null;
  uploadDate: string | null;
  durationSec: number | null;
  channel: string | null;
  description: string | null;
}

function parseSrt(srt: string): string {
  return srt
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      return lines.slice(2).join(" ").trim();
    })
    .filter(Boolean)
    .join("\n");
}

async function findFirstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch {}
  }
  return null;
}

export async function fetchSubtitlesAndMeta(
  url: string,
  outDir: string
): Promise<VideoMeta> {
  await fs.mkdir(outDir, { recursive: true });

  const args = [
    "--write-auto-subs",
    "--sub-langs",
    "ko,en",
    "--skip-download",
    "--convert-subs",
    "srt",
    "--dump-json",
    "--no-warnings",
    "-o",
    path.join(outDir, "%(id)s.%(ext)s"),
    url,
  ];

  const result = await execCommand("yt-dlp", args, { timeoutMs: 120_000 });
  if (result.code !== 0) {
    throw new Error(
      `yt-dlp failed (code ${result.code}): ${result.stderr.slice(0, 500)}`
    );
  }

  // Parse last line of stdout that's JSON (yt-dlp emits one JSON per video)
  const lines = result.stdout.split(/\r?\n/).filter(Boolean);
  const jsonLine = lines.reverse().find((l) => l.startsWith("{"));
  if (!jsonLine) {
    throw new Error("yt-dlp: no JSON metadata in stdout");
  }
  const info = JSON.parse(jsonLine);
  const videoId: string = info.id;

  const meta: VideoMeta = {
    videoId,
    title: info.title ?? "",
    viewCount: typeof info.view_count === "number" ? info.view_count : null,
    uploadDate: info.upload_date ?? null,
    durationSec: typeof info.duration === "number" ? info.duration : null,
    channel: info.channel ?? info.uploader ?? null,
    description: info.description ?? null,
  };

  // Locate subtitle file (ko preferred, en fallback)
  const candidates = [
    path.join(outDir, `${videoId}.ko.srt`),
    path.join(outDir, `${videoId}.en.srt`),
  ];
  const subPath = await findFirstExisting(candidates);
  let subtitlesText = "";
  if (subPath) {
    const raw = await fs.readFile(subPath, "utf8");
    subtitlesText = parseSrt(raw);
  } else {
    console.warn(`[ytdlp] No subtitles found for ${videoId}`);
  }

  await fs.writeFile(path.join(outDir, "subtitles.txt"), subtitlesText, "utf8");
  await fs.writeFile(
    path.join(outDir, "meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8"
  );

  return meta;
}

export async function fetchThumbnail(
  videoId: string,
  outDir: string
): Promise<string> {
  await fs.mkdir(outDir, { recursive: true });
  const target = path.join(outDir, "thumbnail.jpg");

  const tryUrls = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  ];

  for (const u of tryUrls) {
    const res = await fetch(u);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(target, buf);
      return target;
    }
  }
  throw new Error(`No thumbnail available for video ${videoId}`);
}
