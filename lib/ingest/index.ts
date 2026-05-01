import path from "node:path";
import { z } from "zod";
import {
  ensureRefDir,
  refDir,
  refFiles,
  refsRoot,
  ensureDir,
} from "@/lib/runs/paths";
import { fetchSubtitlesAndMeta, fetchThumbnail } from "./ytdlp";
import { fetchTopComments } from "./comments";

export const ReferenceDataSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  viewCount: z.number().int().nullable(),
  uploadedAt: z.string().nullable(),
  durationSec: z.number().int().nullable(),
  channelName: z.string().nullable(),
  subtitlesPath: z.string(),
  commentsPath: z.string(),
  thumbnailPath: z.string(),
  metaPath: z.string(),
});
export type ReferenceData = z.infer<typeof ReferenceDataSchema>;

async function ingestToTmp(
  url: string,
  runId: string
): Promise<ReferenceData> {
  // Use a temp dir under runs/{runId}/refs/_tmp until we know the videoId
  const tmpRoot = path.join(refsRoot(runId), "_tmp", String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8));
  await ensureDir(tmpRoot);

  const meta = await fetchSubtitlesAndMeta(url, tmpRoot);
  const finalDir = await ensureRefDir(runId, meta.videoId);

  // Move tmp files to final dir
  const fs = await import("node:fs/promises");
  const tmpEntries = await fs.readdir(tmpRoot);
  for (const f of tmpEntries) {
    await fs.rename(path.join(tmpRoot, f), path.join(finalDir, f));
  }
  await fs.rmdir(tmpRoot).catch(() => {});

  // Thumbnail (best effort)
  try {
    await fetchThumbnail(meta.videoId, finalDir);
  } catch (err) {
    console.warn(`[ingest] thumbnail failed for ${meta.videoId}:`, err);
  }

  // Comments (best effort, falls back gracefully)
  try {
    await fetchTopComments(meta.videoId, finalDir, 50);
  } catch (err) {
    console.warn(`[ingest] comments failed for ${meta.videoId}:`, err);
    await fs.writeFile(path.join(finalDir, refFiles.comments), "[]", "utf8");
  }

  const data: ReferenceData = {
    videoId: meta.videoId,
    title: meta.title,
    viewCount: meta.viewCount,
    uploadedAt: meta.uploadDate,
    durationSec: meta.durationSec,
    channelName: meta.channel,
    subtitlesPath: path.join(finalDir, refFiles.subtitles),
    commentsPath: path.join(finalDir, refFiles.comments),
    thumbnailPath: path.join(finalDir, refFiles.thumbnail),
    metaPath: path.join(finalDir, refFiles.meta),
  };

  return ReferenceDataSchema.parse(data);
}

export async function ingestReference(
  url: string,
  runId: string
): Promise<ReferenceData> {
  return ingestToTmp(url, runId);
}

export async function ingestAll(
  urls: string[],
  runId: string
): Promise<Array<{ url: string; ok: true; data: ReferenceData } | { url: string; ok: false; error: string }>> {
  const results = await Promise.allSettled(
    urls.map((url) => ingestReference(url, runId))
  );
  return results.map((r, i) => {
    const url = urls[i]!;
    if (r.status === "fulfilled") {
      return { url, ok: true as const, data: r.value };
    }
    return {
      url,
      ok: false as const,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });
}
