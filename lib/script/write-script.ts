import path from "node:path";
import fs from "node:fs/promises";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { anthropic } from "@/lib/ai/anthropic";
import { MODEL_SONNET } from "@/lib/ai/models";
import {
  ScriptOutputSchema,
  totalCharCount,
  type ScriptOutput,
} from "./schema";
import { buildScriptSystemPrompt, buildScriptUserPrompt } from "./prompts";
import { loadScriptContext } from "./load-context";
import { renderScriptMarkdown } from "./render-md";

const MAX_TOKENS = 12000;
const LENGTH_TOLERANCE = 0.15;

export interface WriteScriptResult {
  scriptPath: string;
  scriptMdPath: string;
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

interface ParseResult {
  ok: boolean;
  value?: ScriptOutput;
  error?: string;
}

function tryParse(text: string): ParseResult {
  try {
    const candidate = JSON.parse(extractJson(text));
    const result = ScriptOutputSchema.safeParse(candidate);
    if (result.success) return { ok: true, value: result.data };
    return { ok: false, error: result.error.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runWriteScript(runId: string): Promise<WriteScriptResult> {
  const ctx = await loadScriptContext(runId);
  const targetCharCount = ctx.durationMin * 300;
  const minChars = Math.floor(targetCharCount * (1 - LENGTH_TOLERANCE));
  const maxChars = Math.ceil(targetCharCount * (1 + LENGTH_TOLERANCE));

  const systemPrompt = buildScriptSystemPrompt(ctx.scriptGuideText);
  let userPrompt = buildScriptUserPrompt(ctx);
  let retries = 0;

  // 1차 호출 + zod 재시도(최대 1회)
  let raw = await callClaude(systemPrompt, userPrompt);
  let parsed = tryParse(raw);
  if (!parsed.ok) {
    retries += 1;
    const retryUser = [
      userPrompt,
      ``,
      `이전 응답이 ScriptOutputSchema 검증에 실패했습니다. 다음 오류를 수정해서 JSON 단일 객체만 다시 출력하라:`,
      parsed.error ?? "",
    ].join("\n");
    raw = await callClaude(systemPrompt, retryUser);
    parsed = tryParse(raw);
    if (!parsed.ok) {
      throw new Error(`Script zod 검증 2회 실패: ${parsed.error}`);
    }
  }

  let value = parsed.value!;
  let actualCharCount = totalCharCount(value.sections);

  // 분량 재시도(최대 1회)
  if (actualCharCount < minChars || actualCharCount > maxChars) {
    retries += 1;
    const direction = actualCharCount > maxChars ? "shorter" : "longer";
    const retryUser = [
      userPrompt,
      ``,
      `직전 출력의 글자수가 ${actualCharCount}자였는데 목표는 ${targetCharCount}자(허용 ${minChars}~${maxChars}자)다.`,
      direction === "shorter"
        ? `너무 길다. **${actualCharCount - targetCharCount}자 정도 줄여서** 다시 작성하라. 핵심 정보는 유지하고 부연·예시를 압축.`
        : `너무 짧다. **${targetCharCount - actualCharCount}자 정도 늘려서** 다시 작성하라. 일화·인용·현대 연결고리를 더 활용.`,
      `JSON 단일 객체만 출력.`,
    ].join("\n");
    raw = await callClaude(systemPrompt, retryUser);
    const reparsed = tryParse(raw);
    if (reparsed.ok) {
      const newCount = totalCharCount(reparsed.value!.sections);
      if (newCount >= minChars && newCount <= maxChars) {
        value = reparsed.value!;
        actualCharCount = newCount;
      } else {
        // 두 번째도 벗어나면 통과시키되 issuesFound에 메모
        value = reparsed.value!;
        actualCharCount = newCount;
        if (!value.selfReview.issuesFound.includes("분량 허용 범위 초과")) {
          value.selfReview.issuesFound.push(
            `분량 허용 범위 초과(${newCount}자, 목표 ${targetCharCount}자, 허용 ${minChars}~${maxChars}자)`
          );
        }
      }
    }
    // reparsed.ok 실패면 첫 번째 결과 유지
  }

  const finalScript: ScriptOutput = {
    ...value,
    meta: {
      runId,
      durationMin: ctx.durationMin,
      targetCharCount,
      actualCharCount,
      sectionCount: value.sections.length,
      generatedAt: new Date().toISOString(),
      model: MODEL_SONNET,
      retries,
    },
  };

  const dir = runDir(runId);
  await ensureDir(dir);
  const scriptPath = path.join(dir, "script.json");
  await fs.writeFile(scriptPath, JSON.stringify(finalScript, null, 2), "utf8");

  const md = renderScriptMarkdown(finalScript, {
    topicTitle: ctx.selected.title.text,
    channel: ctx.channel.name,
  });
  const scriptMdPath = path.join(dir, "script.md");
  await fs.writeFile(scriptMdPath, md, "utf8");

  return { scriptPath, scriptMdPath };
}
