import path from "node:path";
import fs from "node:fs/promises";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { MODEL_SONNET } from "@/lib/ai/models";
import { loadSelectedFromRun } from "@/lib/_shared/load-selected";
import { FactcheckSchema, type Factcheck } from "./schema";
import {
  buildFactcheckSystemPrompt,
  buildFactcheckUserPrompt,
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

export async function runFactcheck(runId: string): Promise<string> {
  const { selected, channelConcept } = await loadSelectedFromRun(runId);
  const systemPrompt = buildFactcheckSystemPrompt();
  const userPrompt = buildFactcheckUserPrompt(selected, channelConcept, runId);

  const tryParse = (
    text: string
  ): { ok: true; value: Factcheck } | { ok: false; error: string } => {
    try {
      const candidate = JSON.parse(extractJson(text));
      const result = FactcheckSchema.safeParse(candidate);
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
      throw new Error(`Factcheck zod 검증 2회 실패: ${parsed.error}`);
    }
  }

  const finalFactcheck: Factcheck = {
    ...parsed.value,
    meta: {
      runId,
      topicTitle: selected.title.text,
      searchedAt: new Date().toISOString(),
      model: MODEL_SONNET,
      webSearchCount: call.webSearchCount,
    },
  };

  const dir = runDir(runId);
  await ensureDir(dir);
  const outPath = path.join(dir, "factcheck.json");
  await fs.writeFile(outPath, JSON.stringify(finalFactcheck, null, 2), "utf8");
  return outPath;
}
