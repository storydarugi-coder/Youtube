import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, channels } from "@/lib/db/schema";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { anthropic } from "@/lib/ai/anthropic";
import { MODEL_SONNET } from "@/lib/ai/models";
import {
  ScriptOutputSchema,
  type ScriptOutput,
} from "@/lib/script/schema";
import {
  StoryboardSchema,
  type Storyboard,
  checkConsistency,
  BANNED_TERMS,
} from "./schema";
import {
  buildStoryboardSystemPrompt,
  buildStoryboardUserPrompt,
} from "./prompts";
import { renderStoryboardMarkdown } from "./render-md";
import {
  CandidatesSchema,
  SelectionsSchema,
} from "@/lib/candidates/schema";

const MAX_TOKENS = 16000;

const IMAGE_PROMPT_GUIDE_PATH = path.join(
  process.cwd(),
  ".claude",
  "skills",
  "youtube-script-factory",
  "references",
  "image-prompt-guide.md"
);

export interface RunStoryboardResult {
  storyboardPath: string;
  storyboardMdPath: string;
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
): { ok: true; value: Storyboard } | { ok: false; error: string } {
  try {
    const candidate = JSON.parse(extractJson(text));
    const result = StoryboardSchema.safeParse(candidate);
    if (result.success) return { ok: true, value: result.data };
    return { ok: false, error: result.error.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function loadInputs(runId: string): Promise<{
  channel: { name: string; visualStyle: string; voiceTone: string };
  durationMin: number;
  script: ScriptOutput;
  topicTitle: string;
}> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);
  if (!run.scriptPath) throw new Error("scriptPath가 비어있습니다. M6 미완료.");
  if (!run.candidatesPath || !run.selectionsPath) {
    throw new Error("candidates/selections 경로가 비어있습니다.");
  }

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));
  if (!channel) throw new Error(`channel not found: ${run.channelId}`);

  const [scriptRaw, candidatesRaw, selectionsRaw] = await Promise.all([
    fs.readFile(run.scriptPath, "utf8"),
    fs.readFile(run.candidatesPath, "utf8"),
    fs.readFile(run.selectionsPath, "utf8"),
  ]);
  const script = ScriptOutputSchema.parse(JSON.parse(scriptRaw));
  const candidates = CandidatesSchema.parse(JSON.parse(candidatesRaw));
  const selections = SelectionsSchema.parse(JSON.parse(selectionsRaw));
  const title = candidates.titles.find((t) => t.index === selections.titleIndex);
  if (!title) throw new Error("선택된 제목을 candidates에서 찾을 수 없습니다.");

  return {
    channel: {
      name: channel.name,
      visualStyle: channel.visualStyle,
      voiceTone: channel.voiceTone,
    },
    durationMin: run.durationMin,
    script,
    topicTitle: title.text,
  };
}

export async function runStoryboard(runId: string): Promise<RunStoryboardResult> {
  const inputs = await loadInputs(runId);
  const targetTotalSec = inputs.durationMin * 60;
  const imagePromptGuide = await fs.readFile(IMAGE_PROMPT_GUIDE_PATH, "utf8");

  const systemPrompt = buildStoryboardSystemPrompt(imagePromptGuide);
  const userPrompt = buildStoryboardUserPrompt({
    runId,
    channel: inputs.channel,
    script: inputs.script,
    durationMin: inputs.durationMin,
    topicTitle: inputs.topicTitle,
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
      `이전 응답이 StoryboardSchema 검증에 실패했습니다. 다음 오류를 수정해서 JSON 단일 객체만 다시 출력하라:`,
      parsed.error,
    ].join("\n");
    raw = await callClaude(systemPrompt, retryUser);
    parsed = tryParse(raw);
    if (!parsed.ok) {
      throw new Error(`Storyboard zod 검증 2회 실패: ${parsed.error}`);
    }
  }

  let value = parsed.value;

  // visualStylePrefix는 코드에서 강제 (모델이 변경하면 덮어씀)
  if (value.visualStylePrefix !== inputs.channel.visualStyle) {
    value = { ...value, visualStylePrefix: inputs.channel.visualStyle };
  }

  // 일관성 검증 + 1회 재시도
  let consistency = checkConsistency(value, targetTotalSec);
  if (!consistency.ok && retries < 2) {
    retries += 1;
    const retryUser = [
      userPrompt,
      ``,
      `이전 응답이 일관성 검증에 실패했습니다. 다음 문제를 모두 해결해서 JSON 단일 객체만 다시 출력하라:`,
      ...consistency.issues.map((x) => `- ${x}`),
      ``,
      `금지어: ${BANNED_TERMS.join(", ")} — 절대 사용하지 말 것.`,
    ].join("\n");
    raw = await callClaude(systemPrompt, retryUser);
    const reparsed = tryParse(raw);
    if (reparsed.ok) {
      value = {
        ...reparsed.value,
        visualStylePrefix: inputs.channel.visualStyle,
      };
      consistency = checkConsistency(value, targetTotalSec);
    }
  }

  // 두 번째도 실패면 통과시키되 meta에 retries로 흔적 남김

  const totalDurationSec = value.scenes.reduce(
    (sum, s) => sum + s.durationSec,
    0
  );
  const sceneCount = value.scenes.length;
  const avgSceneSec = sceneCount > 0 ? totalDurationSec / sceneCount : 0;

  const finalStoryboard: Storyboard = {
    ...value,
    totalDurationSec,
    meta: {
      runId,
      sceneCount,
      avgSceneSec: Math.round(avgSceneSec * 10) / 10,
      targetTotalSec,
      generatedAt: new Date().toISOString(),
      model: MODEL_SONNET,
      retries,
    },
  };

  const dir = runDir(runId);
  await ensureDir(dir);
  const storyboardPath = path.join(dir, "storyboard.json");
  await fs.writeFile(
    storyboardPath,
    JSON.stringify(finalStoryboard, null, 2),
    "utf8"
  );

  const md = renderStoryboardMarkdown(finalStoryboard, {
    topicTitle: inputs.topicTitle,
    channel: inputs.channel.name,
  });
  const storyboardMdPath = path.join(dir, "storyboard.md");
  await fs.writeFile(storyboardMdPath, md, "utf8");

  return { storyboardPath, storyboardMdPath };
}
