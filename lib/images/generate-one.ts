import path from "node:path";
import fs from "node:fs/promises";
import { getOpenAI, IMAGE_MODEL, OUTPUT_FORMAT, estimateCost } from "./client";

export interface GenerateOneInput {
  prompt: string;
  visualStylePrefix: string;
  size: string;
  quality: "medium" | "high";
  outDir: string;
  fileName: string;
}

interface OkResult {
  ok: true;
  imagePath: string;
  costUsd: number;
  attempts: number;
  fallbackUsed: boolean;
  finalPrompt: string;
}

interface ErrorResult {
  ok: false;
  errorMessage: string;
  attempts: number;
  fallbackUsed: boolean;
  finalPrompt: string;
}

export type GenerateOneResult = OkResult | ErrorResult;

const MAX_ATTEMPTS = 3;
const RATE_LIMIT_BACKOFF_MS = [2000, 4000, 8000];

export function simplifyForFallback(
  _prompt: string,
  visualStylePrefix: string
): string {
  return [
    visualStylePrefix.trim(),
    "a stylized atmospheric scene without identifiable persons",
    "soft balanced lighting, wide cinematic composition",
    "non-violent, no realistic faces, no readable text",
  ].join(", ");
}

interface OAIError {
  status?: number;
  message?: string;
  code?: string;
  error?: { code?: string; message?: string; type?: string };
}

function isContentPolicyError(err: unknown): boolean {
  const e = err as OAIError;
  const status = e?.status;
  const message = String(e?.message ?? "");
  const code = e?.code ?? e?.error?.code ?? "";
  const type = e?.error?.type ?? "";
  if (status === 400) {
    if (
      /safety|content[_ -]?policy|moderation|violat/i.test(message) ||
      /content_policy|safety|moderation/i.test(code) ||
      /content_policy|safety/i.test(type)
    ) {
      return true;
    }
  }
  return false;
}

function isRateLimitError(err: unknown): boolean {
  const e = err as OAIError;
  return e?.status === 429;
}

function errMsg(err: unknown): string {
  const e = err as OAIError;
  return e?.message ?? e?.error?.message ?? String(err);
}

async function callOpenAI(
  prompt: string,
  size: string,
  quality: "medium" | "high"
): Promise<string> {
  const response = await getOpenAI().images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: size as "1536x1024",
    quality,
    output_format: OUTPUT_FORMAT,
    n: 1,
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI 응답에 b64_json이 없습니다.");
  }
  return b64;
}

export async function generateOne(
  input: GenerateOneInput
): Promise<GenerateOneResult> {
  let attempts = 0;
  let fallbackUsed = false;
  let currentPrompt = input.prompt;
  let lastError: string | null = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    try {
      const b64 = await callOpenAI(currentPrompt, input.size, input.quality);
      const imagePath = path.join(input.outDir, input.fileName);
      await fs.mkdir(input.outDir, { recursive: true });
      await fs.writeFile(imagePath, Buffer.from(b64, "base64"));

      const costUsd =
        estimateCost(IMAGE_MODEL, input.quality, input.size) * attempts;
      return {
        ok: true,
        imagePath,
        costUsd,
        attempts,
        fallbackUsed,
        finalPrompt: currentPrompt,
      };
    } catch (err) {
      lastError = errMsg(err);

      if (isContentPolicyError(err) && !fallbackUsed) {
        currentPrompt = simplifyForFallback(
          input.prompt,
          input.visualStylePrefix
        );
        fallbackUsed = true;
        continue;
      }

      if (isRateLimitError(err) && attempts < MAX_ATTEMPTS) {
        const wait =
          RATE_LIMIT_BACKOFF_MS[attempts - 1] ??
          RATE_LIMIT_BACKOFF_MS[RATE_LIMIT_BACKOFF_MS.length - 1]!;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      // 그 외 에러: 폴백 안 한 상태면 한 번 더 시도(폴백)
      if (!fallbackUsed && attempts < MAX_ATTEMPTS) {
        currentPrompt = simplifyForFallback(
          input.prompt,
          input.visualStylePrefix
        );
        fallbackUsed = true;
        continue;
      }
      break;
    }
  }

  return {
    ok: false,
    errorMessage: lastError ?? "unknown error",
    attempts,
    fallbackUsed,
    finalPrompt: currentPrompt,
  };
}
