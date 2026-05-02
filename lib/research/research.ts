import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, channels } from "@/lib/db/schema";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { MODEL_SONNET } from "@/lib/ai/models";
import {
  CandidatesSchema,
  SelectionsSchema,
} from "@/lib/candidates/schema";
import { FactcheckSchema, ResearchSchema, type Research } from "./schema";
import {
  buildResearchSystemPrompt,
  buildResearchUserPrompt,
  type Selected,
} from "./prompts";
import { callClaudeWithWebSearch } from "./web-search";

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

interface RunContext {
  selected: Selected;
  channelConcept: string;
  factcheckSummary: string;
  topicTitle: string;
}

async function loadContext(runId: string): Promise<RunContext> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);
  if (!run.candidatesPath || !run.selectionsPath || !run.factcheckPath) {
    throw new Error(
      "candidates/selections/factcheck 경로 중 하나가 비어있습니다."
    );
  }
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));
  if (!channel) throw new Error(`channel not found: ${run.channelId}`);

  const candidates = CandidatesSchema.parse(
    JSON.parse(await fs.readFile(run.candidatesPath, "utf8"))
  );
  const selections = SelectionsSchema.parse(
    JSON.parse(await fs.readFile(run.selectionsPath, "utf8"))
  );
  const factcheck = FactcheckSchema.parse(
    JSON.parse(await fs.readFile(run.factcheckPath, "utf8"))
  );

  const topic = candidates.topics.find((t) => t.index === selections.topicIndex)!;
  const audience = candidates.audiences.find(
    (a) => a.index === selections.audienceIndex
  )!;
  const title = candidates.titles.find((t) => t.index === selections.titleIndex)!;
  if (!topic || !audience || !title) {
    throw new Error("선택된 인덱스의 후보를 candidates에서 찾을 수 없습니다.");
  }

  const factcheckSummary = [
    `overallAssessment: ${factcheck.overallAssessment}`,
    ``,
    `검증된 클레임 (verified/disputed only):`,
    ...factcheck.claims
      .filter((c) => c.verdict === "verified" || c.verdict === "disputed")
      .map(
        (c, i) =>
          `${i + 1}. [${c.verdict}/${c.confidence}] ${c.claim}\n   → ${c.explanation.slice(0, 200)}`
      ),
    ``,
    factcheck.redFlags.length > 0
      ? `redFlags (다루지 말 것):\n${factcheck.redFlags.map((f) => `- ${f}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    selected: {
      topic: {
        title: topic.title,
        description: topic.description,
        rationale: topic.rationale,
      },
      audience: {
        label: audience.label,
        ageRange: audience.ageRange,
        interests: audience.interests,
        motivation: audience.motivation,
      },
      title: {
        text: title.text,
        formula: title.formula,
        rationale: title.rationale,
      },
    },
    channelConcept: channel.concept,
    factcheckSummary,
    topicTitle: title.text,
  };
}

export async function runResearch(runId: string): Promise<string> {
  const ctx = await loadContext(runId);
  const systemPrompt = buildResearchSystemPrompt();
  const userPrompt = buildResearchUserPrompt(
    ctx.selected,
    ctx.channelConcept,
    ctx.factcheckSummary,
    runId
  );

  const tryParse = (
    text: string
  ): { ok: true; value: Research } | { ok: false; error: string } => {
    try {
      const candidate = JSON.parse(extractJson(text));
      const result = ResearchSchema.safeParse(candidate);
      if (result.success) return { ok: true, value: result.data };
      return { ok: false, error: result.error.message };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  let call = await callClaudeWithWebSearch({
    systemPrompt,
    userPrompt,
    maxUses: 5,
    maxTokens: 6000,
  });
  let parsed = tryParse(call.text);

  if (!parsed.ok) {
    const retryUser = [
      userPrompt,
      ``,
      `이전 응답이 스키마 검증에 실패했습니다. 다음 오류를 수정해서 JSON 단일 객체만 다시 출력하라:`,
      parsed.error,
    ].join("\n");
    call = await callClaudeWithWebSearch({
      systemPrompt,
      userPrompt: retryUser,
      maxUses: 3,
      maxTokens: 6000,
    });
    parsed = tryParse(call.text);
    if (!parsed.ok) {
      throw new Error(`Research zod 검증 2회 실패: ${parsed.error}`);
    }
  }

  const finalResearch: Research = {
    ...parsed.value,
    meta: {
      runId,
      topicTitle: ctx.topicTitle,
      searchedAt: new Date().toISOString(),
      model: MODEL_SONNET,
      webSearchCount: call.webSearchCount,
    },
  };

  const dir = runDir(runId);
  await ensureDir(dir);
  const outPath = path.join(dir, "research.json");
  await fs.writeFile(outPath, JSON.stringify(finalResearch, null, 2), "utf8");
  return outPath;
}
