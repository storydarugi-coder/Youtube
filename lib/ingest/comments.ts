import path from "node:path";
import fs from "node:fs/promises";
import { execCommand } from "@/lib/utils/exec";

export interface Comment {
  text: string;
  likes: number;
  author: string;
}

interface YoutubeApiCommentItem {
  snippet?: {
    topLevelComment?: {
      snippet?: {
        textDisplay?: string;
        authorDisplayName?: string;
        likeCount?: number;
      };
    };
  };
}

async function fetchViaDataApi(
  videoId: string,
  n: number,
  apiKey: string
): Promise<Comment[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("order", "relevance");
  url.searchParams.set("maxResults", String(Math.min(n, 100)));
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube Data API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { items?: YoutubeApiCommentItem[] };
  const items = data.items ?? [];
  return items
    .map((item): Comment | null => {
      const s = item.snippet?.topLevelComment?.snippet;
      if (!s) return null;
      return {
        text: s.textDisplay ?? "",
        author: s.authorDisplayName ?? "",
        likes: s.likeCount ?? 0,
      };
    })
    .filter((c): c is Comment => c !== null)
    .slice(0, n);
}

async function fetchViaYtDlp(
  videoId: string,
  n: number,
  outDir: string
): Promise<Comment[]> {
  await fs.mkdir(outDir, { recursive: true });
  const args = [
    "--write-comments",
    "--skip-download",
    "--write-info-json",
    "--no-warnings",
    "--extractor-args",
    `youtube:max_comments=${n},all,all,all`,
    "-o",
    path.join(outDir, "%(id)s.%(ext)s"),
    `https://www.youtube.com/watch?v=${videoId}`,
  ];
  const result = await execCommand("yt-dlp", args, { timeoutMs: 180_000 });
  if (result.code !== 0) {
    console.warn(
      `[comments] yt-dlp comments failed (code ${result.code}): ${result.stderr.slice(0, 300)}`
    );
    return [];
  }

  const infoPath = path.join(outDir, `${videoId}.info.json`);
  try {
    const raw = await fs.readFile(infoPath, "utf8");
    const info = JSON.parse(raw) as {
      comments?: Array<{
        text?: string;
        like_count?: number;
        author?: string;
      }>;
    };
    const comments = (info.comments ?? [])
      .map(
        (c): Comment => ({
          text: c.text ?? "",
          likes: c.like_count ?? 0,
          author: c.author ?? "",
        })
      )
      .sort((a, b) => b.likes - a.likes)
      .slice(0, n);
    return comments;
  } catch {
    return [];
  }
}

export async function fetchTopComments(
  videoId: string,
  outDir: string,
  n = 50
): Promise<Comment[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  let comments: Comment[] = [];
  if (apiKey) {
    try {
      comments = await fetchViaDataApi(videoId, n, apiKey);
    } catch (err) {
      console.warn("[comments] Data API failed, falling back to yt-dlp:", err);
    }
  }

  if (comments.length === 0) {
    comments = await fetchViaYtDlp(videoId, n, outDir);
  }

  await fs.writeFile(
    path.join(outDir, "comments.json"),
    JSON.stringify(comments, null, 2),
    "utf8"
  );
  return comments;
}
