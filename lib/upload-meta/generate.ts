import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, channels } from "@/lib/db/schema";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { anthropic } from "@/lib/ai/anthropic";
import { MODEL_SONNET } from "@/lib/ai/models";
import {
  CandidatesSchema,
  SelectionsSchema,
} from "@/lib/candidates/schema";
import {
  ScriptOutputSchema,
  type ScriptOutput,
} from "@/lib/script/schema";
import { StoryboardSchema } from "@/lib/storyboard/schema";
import {
  UploadMetaSchemaWithThumbnailRefine,
  checkUploadMetaConsistency,
  type UploadMeta,
} from "./schema";
import {
  buildUploadMetaSystemPrompt,
  buildUploadMetaUserPrompt,
} from "./prompts";
import { renderUploadMetaMarkdown } from "./render-md";

const MAX_TOKENS = 6000;

const TITLE_GUIDE_PATH = path.join(
  process.cwd(),
  ".claude",
  "skills",
  "youtube-upload-info",
  "references",
  "title-guide.md"
);
const THUMBNAIL_GUIDE_PATH = path.join(
  process.cwd(),
  ".claude",
  "skills",
  "youtube-upload-info",
  "references",
  "thumbnail-guide.md"
);

export interface RunFinalizeMetaResult {
  metaPath: string;
  metaMdPath: string;
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
  const textBlocks = response.content.filter((b) => b.type === "text");
  const last = textBlocks[textBlocks.length - 1];
  if (!last || last.type !== "text") {
    throw new Error("Anthropic 응답에 text 블록이 없습니다.");
  }
  return last.text;
}

function tryParse(
  text: string
): { ok: true; value: UploadMeta } | { ok: false; error: string } {
  try {
    const candidate = JSON.parse(extractJson(text));
    const result = UploadMetaSchemaWithThumbnailRefine.safeParse(candidate);
    if (result.success) return { ok: true, value: result.data };
    return { ok: false, error: result.error.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadInputs(runId: string): Promise<{
  channel: { name: string; concept: string; visualStyle: string; voiceTone: string };
  selectedTitle: string;
  topicTitle: string;
  script: ScriptOutput;
  storyboard: { sceneCount: number; totalDurationSec: number; targetTotalSec: number };
}> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);
  const required: Array<[string, string | null]> = [
    ["scriptPath", run.scriptPath],
    ["storyboardPath", run.storyboardPath],
    ["candidatesPath", run.candidatesPath],
    ["selectionsPath", run.selectionsPath],
  ];
  for (const [name, value] of required) {
    if (!value) throw new Error(`${name}이 비어있습니다. 이전 단계 미완료.`);
  }

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));
  if (!channel) throw new Error(`channel not found: ${run.channelId}`);

  const [scriptRaw, storyboardRaw, candidatesRaw, selectionsRaw] =
    await Promise.all([
      fs.readFile(run.scriptPath!, "utf8"),
      fs.readFile(run.storyboardPath!, "utf8"),
      fs.readFile(run.candidatesPath!, "utf8"),
      fs.readFile(run.selectionsPath!, "utf8"),
    ]);
  const script = ScriptOutputSchema.parse(JSON.parse(scriptRaw));
  const storyboard = StoryboardSchema.parse(JSON.parse(storyboardRaw));
  const candidates = CandidatesSchema.parse(JSON.parse(candidatesRaw));
  const selections = SelectionsSchema.parse(JSON.parse(selectionsRaw));
  const title = candidates.titles.find(
    (t) => t.index === selections.titleIndex
  );
  if (!title) throw new Error("선택된 제목을 candidates에서 찾을 수 없습니다.");

  return {
    channel: {
      name: channel.name,
      concept: channel.concept,
      visualStyle: channel.visualStyle,
      voiceTone: channel.voiceTone,
    },
    selectedTitle: title.text,
    topicTitle: title.text,
    script,
    storyboard: {
      sceneCount: storyboard.meta.sceneCount,
      totalDurationSec: storyboard.totalDurationSec,
      targetTotalSec: storyboard.meta.targetTotalSec,
    },
  };
}

export async function runFinalizeMeta(
  runId: string
): Promise<RunFinalizeMetaResult> {
  const inputs = await loadInputs(runId);
  const [titleGuide, thumbnailGuide] = await Promise.all([
    fs.readFile(TITLE_GUIDE_PATH, "utf8"),
    fs.readFile(THUMBNAIL_GUIDE_PATH, "utf8"),
  ]);

  const systemPrompt = buildUploadMetaSystemPrompt(titleGuide, thumbnailGuide);
  const userPrompt = buildUploadMetaUserPrompt({
    runId,
    channel: inputs.channel,
    selectedTitle: inputs.selectedTitle,
    topicTitle: inputs.topicTitle,
    script: inputs.script,
    storyboard: inputs.storyboard,
  });

  let retries = 0;

  // 1차 호출 + zod 1회 재시도
  let raw = await callClaude(systemPrompt, userPrompt);
  let parsed = tryParse(raw);
  if (!parsed.ok) {
    retries += 1;
    const retryUser = [
      userPrompt,
      ``,
      `이전 응답이 UploadMetaSchema 검증에 실패했습니다. 다음 오류를 수정해서 JSON 단일 객체만 다시 출력하라:`,
      parsed.error,
    ].join("\n");
    raw = await callClaude(systemPrompt, retryUser);
    parsed = tryParse(raw);
    if (!parsed.ok) {
      throw new Error(`UploadMeta zod 검증 2회 실패: ${parsed.error}`);
    }
  }

  let value = parsed.value;

  // 일관성 검증 + 1회 재시도
  let consistencyIssues = checkUploadMetaConsistency(
    value,
    inputs.channel.visualStyle
  );
  if (consistencyIssues.length > 0 && retries < 2) {
    retries += 1;
    const retryUser = [
      userPrompt,
      ``,
      `이전 응답이 일관성 검증에 실패했습니다. 다음 문제를 모두 해결해서 JSON 단일 객체만 다시 출력하라:`,
      ...consistencyIssues.map((x) => `- ${x}`),
    ].join("\n");
    raw = await callClaude(systemPrompt, retryUser);
    const reparsed = tryParse(raw);
    if (reparsed.ok) {
      value = reparsed.value;
      consistencyIssues = checkUploadMetaConsistency(
        value,
        inputs.channel.visualStyle
      );
    }
  }

  const descriptionCharCount =
    value.description.intro.length +
    value.description.summary.length +
    value.description.hashtags.join(" ").length;

  const finalMeta: UploadMeta = {
    ...value,
    meta: {
      runId,
      titleSource: value.meta?.titleSource ?? "selected",
      descriptionCharCount,
      generatedAt: new Date().toISOString(),
      model: MODEL_SONNET,
      retries,
    },
  };

  const dir = runDir(runId);
  await ensureDir(dir);
  const metaPath = path.join(dir, "meta.json");
  await fs.writeFile(metaPath, JSON.stringify(finalMeta, null, 2), "utf8");

  const md = renderUploadMetaMarkdown(finalMeta, {
    channel: inputs.channel.name,
  });
  const metaMdPath = path.join(dir, "meta.md");
  await fs.writeFile(metaMdPath, md, "utf8");

  return { metaPath, metaMdPath };
}
