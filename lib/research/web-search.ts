import { anthropic } from "@/lib/ai/anthropic";
import { MODEL_SONNET } from "@/lib/ai/models";

export const WEB_SEARCH_TOOL_TYPE = "web_search_20260209" as const;

export interface WebSearchCallResult {
  text: string;
  webSearchCount: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CallOpts {
  systemPrompt: string;
  userPrompt: string;
  maxUses: number;
  maxTokens?: number;
}

export async function callClaudeWithWebSearch(
  opts: CallOpts
): Promise<WebSearchCallResult> {
  const response = await anthropic.messages.create({
    model: MODEL_SONNET,
    max_tokens: opts.maxTokens ?? 6000,
    system: [
      {
        type: "text",
        text: opts.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: opts.userPrompt }],
    tools: [
      {
        type: WEB_SEARCH_TOOL_TYPE,
        name: "web_search",
        max_uses: opts.maxUses,
      },
    ],
  });

  const textBlocks = response.content.filter((b) => b.type === "text");
  const lastText = textBlocks[textBlocks.length - 1];
  if (!lastText || lastText.type !== "text") {
    throw new Error("Anthropic 응답에 text 블록이 없습니다.");
  }

  const usageCount =
    response.usage?.server_tool_use?.web_search_requests ?? null;
  const fallbackCount = response.content.filter(
    (b) => b.type === "server_tool_use" && b.name === "web_search"
  ).length;
  const webSearchCount = usageCount ?? fallbackCount;

  return {
    text: lastText.text,
    webSearchCount,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
