import { ElevenLabsClient } from "elevenlabs";

let _client: ElevenLabsClient | null = null;

export function getElevenLabs(): ElevenLabsClient {
  if (!_client) {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY 환경변수가 필요합니다.");
    }
    _client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  }
  return _client;
}

export const TTS_MODEL = "eleven_multilingual_v2" as const;
export const OUTPUT_FORMAT = "mp3_44100_128" as const;

// 비용 추정 — Creator $0.30/1K chars 기준 (보수적). 실 청구는 ElevenLabs 대시보드에서 확인.
export const COST_PER_1K_CHARS = 0.3;

export function estimateCost(charCount: number): number {
  return (charCount / 1000) * COST_PER_1K_CHARS;
}

export const VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
} as const;
