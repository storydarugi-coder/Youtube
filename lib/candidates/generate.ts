import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, channels } from "@/lib/db/schema";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { anthropic } from "@/lib/ai/anthropic";
import { MODEL_SONNET } from "@/lib/ai/models";
import { StyleGuideSchema } from "@/lib/analyze/schema";
import { CandidatesSchema, type Candidates } from "./schema";
import { buildSystemPrompt, buildUserPrompt, type ChannelInput } from "./prompts";

const MAX_TOKENS = 3000;

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
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Anthropic 응답에 text 블록이 없습니다.");
  }
  return textBlock.text;
}

export async function generateCandidates(runId: string): Promise<string> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);
  if (!run.styleGuidePath) {
    throw new Error("styleGuidePath가 비어있습니다. M3가 끝나지 않은 상태로 보입니다.");
  }

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));
  if (!channel) throw new Error(`channel not found: ${run.channelId}`);

  const styleGuideRaw = await fs.readFile(run.styleGuidePath, "utf8");
  const styleGuide = StyleGuideSchema.parse(JSON.parse(styleGuideRaw));

  const channelInput: ChannelInput = {
    name: channel.name,
    concept: channel.concept,
    visualStyle: channel.visualStyle,
    voiceTone: channel.voiceTone,
    defaultDurationMin: channel.defaultDurationMin,
  };

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(styleGuide, channelInput, runId);

  const tryParse = (
    text: string
  ): { ok: true; value: Candidates } | { ok: false; error: string } => {
    try {
      const candidate = JSON.parse(extractJson(text));
      const result = CandidatesSchema.safeParse(candidate);
      if (result.success) return { ok: true, value: result.data };
      return { ok: false, error: result.error.message };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const raw = await callClaude(systemPrompt, userPrompt);
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
      throw new Error(`Candidates zod 검증 2회 실패: ${parsed.error}`);
    }
  }

  const finalCandidates: Candidates = {
    ...parsed.value,
    meta: {
      runId,
      generatedAt: new Date().toISOString(),
      model: MODEL_SONNET,
    },
  };

  const dir = runDir(runId);
  await ensureDir(dir);
  const outPath = path.join(dir, "candidates.json");
  await fs.writeFile(outPath, JSON.stringify(finalCandidates, null, 2), "utf8");
  return outPath;
}
