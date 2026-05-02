import path from "node:path";
import fs from "node:fs/promises";
import {
  getElevenLabs,
  TTS_MODEL,
  OUTPUT_FORMAT,
  VOICE_SETTINGS,
  estimateCost,
} from "./client";
import { getMp3DurationMs } from "@/lib/system/ffprobe";

export interface GenerateOneTtsInput {
  text: string;
  voiceId: string;
  outDir: string;
  fileName: string;
}

export type GenerateOneTtsResult =
  | {
      ok: true;
      audioPath: string;
      durationMs: number | null;
      charCount: number;
      costUsd: number;
      attempts: number;
    }
  | { ok: false; errorMessage: string; attempts: number };

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [2000, 4000, 8000];

interface ELError {
  status?: number;
  statusCode?: number;
  message?: string;
  body?: { detail?: { status?: string; message?: string } };
}

function statusOf(err: unknown): number | null {
  const e = err as ELError;
  return e?.status ?? e?.statusCode ?? null;
}

function isRetryable(err: unknown): boolean {
  const s = statusOf(err);
  if (s === 429) return true;
  if (s !== null && s >= 500 && s < 600) return true;
  return false;
}

function errMsg(err: unknown): string {
  const e = err as ELError;
  return e?.body?.detail?.message ?? e?.message ?? String(err);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

async function callElevenLabs(
  voiceId: string,
  text: string
): Promise<Buffer> {
  const stream = await getElevenLabs().textToSpeech.convert(voiceId, {
    text,
    model_id: TTS_MODEL,
    output_format: OUTPUT_FORMAT,
    voice_settings: { ...VOICE_SETTINGS },
  });
  return streamToBuffer(stream as unknown as NodeJS.ReadableStream);
}

export async function generateOneTts(
  input: GenerateOneTtsInput
): Promise<GenerateOneTtsResult> {
  const charCount = input.text.length;
  let attempts = 0;
  let lastError: string | null = null;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    try {
      const buf = await callElevenLabs(input.voiceId, input.text);
      const audioPath = path.join(input.outDir, input.fileName);
      await fs.mkdir(input.outDir, { recursive: true });
      await fs.writeFile(audioPath, buf);

      // 길이 측정 (ffprobe 미설치/실패 시 null로 통과 — M11에서 보정 가능)
      let durationMs: number | null = null;
      try {
        durationMs = await getMp3DurationMs(audioPath);
      } catch (err) {
        console.warn(
          `[tts] ffprobe 실패 — durationMs=null (${input.fileName}):`,
          err instanceof Error ? err.message : err
        );
      }

      return {
        ok: true,
        audioPath,
        durationMs,
        charCount,
        costUsd: estimateCost(charCount),
        attempts,
      };
    } catch (err) {
      lastError = errMsg(err);
      if (isRetryable(err) && attempts < MAX_ATTEMPTS) {
        const wait =
          RETRY_BACKOFF_MS[attempts - 1] ??
          RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // 4xx auth/invalid voice 등은 즉시 break
      break;
    }
  }

  return { ok: false, errorMessage: lastError ?? "unknown error", attempts };
}
