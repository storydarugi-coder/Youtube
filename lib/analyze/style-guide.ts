import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, refsTable } from "@/lib/db/schema";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { anthropic } from "@/lib/ai/anthropic";
import { MODEL_SONNET } from "@/lib/ai/models";
import { StyleGuideSchema, type StyleGuide } from "./schema";
import { buildSystemPrompt, buildUserPrompt, type RefInput } from "./prompts";

const SUBTITLE_CHAR_CAP = 8000;
const SUBTITLE_CHAR_CAP_FALLBACK = 4000;
const COMMENT_CAP = 30;
const MAX_TOKENS = 4096;

interface RawComment {
  text?: string;
  likes?: number;
  author?: string;
}

async function readRefAssets(
  ref: typeof refsTable.$inferSelect,
  index: number,
  subtitleCap: number,
  commentCap: number
): Promise<RefInput | null> {
  if (!ref.subtitlesPath) return null;

  let subtitles = "";
  try {
    subtitles = await fs.readFile(ref.subtitlesPath, "utf8");
  } catch {
    return null;
  }
  const trimmed = subtitles.trim();
  if (trimmed.length === 0) return null;

  let comments: RawComment[] = [];
  if (ref.commentsPath) {
    try {
      const raw = await fs.readFile(ref.commentsPath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) comments = parsed as RawComment[];
    } catch {
      comments = [];
    }
  }

  return {
    index,
    title: ref.title,
    channelName: ref.channelName,
    viewCount: ref.viewCount,
    uploadedAt: ref.uploadedAt,
    durationSec: ref.durationSec,
    subtitles: trimmed.slice(0, subtitleCap),
    comments: comments.slice(0, commentCap).map((c) => ({
      text: c.text ?? "",
      likeCount: c.likes,
      author: c.author,
    })),
  };
}

function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1]!.trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

function isOverloadedError(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    return status === 413 || status === 429;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /token|too large|context|overload/i.test(msg);
}

async function callClaude(systemPrompt: string, userPrompt: string) {
  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic 응답에 text 블록이 없습니다.");
  }
  return textBlock.text;
}

export async function analyzeReferences(runId: string): Promise<string> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);

  const refRows = await db
    .select()
    .from(refsTable)
    .where(eq(refsTable.runId, runId));

  const inputs: RefInput[] = [];
  let nextIndex = 1;
  for (const r of refRows) {
    if (r.status !== "done") continue;
    const input = await readRefAssets(r, nextIndex, SUBTITLE_CHAR_CAP, COMMENT_CAP);
    if (input) {
      inputs.push(input);
      nextIndex += 1;
    }
  }

  if (inputs.length === 0) {
    throw new Error("분석 가능한 자막이 있는 레퍼런스가 없습니다.");
  }

  return analyzeFromInputs(runId, inputs);
}

export async function analyzeFromInputs(
  runId: string,
  initialInputs: RefInput[]
): Promise<string> {
  if (initialInputs.length === 0) {
    throw new Error("입력 RefInput[]가 비어 있습니다.");
  }
  let inputs = initialInputs;

  const systemPrompt = buildSystemPrompt();
  let userPrompt = buildUserPrompt(inputs);

  let raw: string;
  try {
    raw = await callClaude(systemPrompt, userPrompt);
  } catch (err) {
    if (isOverloadedError(err)) {
      inputs = inputs.map((i) => ({
        ...i,
        subtitles: i.subtitles.slice(0, SUBTITLE_CHAR_CAP_FALLBACK),
      }));
      userPrompt = buildUserPrompt(inputs);
      raw = await callClaude(systemPrompt, userPrompt);
    } else {
      throw err;
    }
  }

  const tryParse = (text: string): { ok: true; value: StyleGuide } | { ok: false; error: string } => {
    try {
      const candidate = JSON.parse(extractJson(text));
      const result = StyleGuideSchema.safeParse(candidate);
      if (result.success) return { ok: true, value: result.data };
      return { ok: false, error: result.error.message };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  let parsed = tryParse(raw);
  if (!parsed.ok) {
    const retryUser = [
      userPrompt,
      ``,
      `이전 응답이 스키마 검증에 실패했습니다. 다음 오류를 수정해서 JSON만 다시 출력하세요:`,
      parsed.error,
    ].join("\n");
    const retryRaw = await callClaude(systemPrompt, retryUser);
    parsed = tryParse(retryRaw);
    if (!parsed.ok) {
      throw new Error(`StyleGuide zod 검증 2회 실패: ${parsed.error}`);
    }
  }

  const styleGuide: StyleGuide = {
    ...parsed.value,
    meta: {
      referenceCount: inputs.length,
      analyzedAt: new Date().toISOString(),
      model: MODEL_SONNET,
    },
  };

  const dir = runDir(runId);
  await ensureDir(dir);
  const outPath = path.join(dir, "style_guide.json");
  await fs.writeFile(outPath, JSON.stringify(styleGuide, null, 2), "utf8");
  return outPath;
}
