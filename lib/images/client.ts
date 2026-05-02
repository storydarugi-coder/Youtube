import OpenAI from "openai";

let _client: OpenAI | null = null;
export function getOpenAI(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// SDK 6.35.0 ImageModel union 등록값: 'gpt-image-1.5' | 'gpt-image-1' | 'gpt-image-1-mini' | 'dall-e-2' | 'dall-e-3'
// PO 안내: gpt-image-2.0이 출시됨 (SDK union에는 아직 미등록이지만 모델 파라미터 타입이 (string & {}) | ImageModel 라 임의 string 허용).
// 가격 정확치는 다음 라운드에 보정 (현재는 1.5 가격을 alias로 사용).
export const IMAGE_MODEL: string = "gpt-image-2.0";
export const SIZE_16_9 = "1536x1024" as const;
export const QUALITY_BODY = "medium" as const;
export const QUALITY_THUMB = "high" as const;
export const OUTPUT_FORMAT = "png" as const;

// 비용 추정 (USD) — gpt-image-1.5 기준, 2026년 5월 시점 보수적 추정값
// 실제 청구는 OpenAI 사용량 대시보드에서 확인. 미스매치 시 다음 라운드에 보정.
const COST_TABLE: Record<string, Record<string, number>> = {
  "gpt-image-2.0": {
    low_1024x1024: 0.011,
    medium_1024x1024: 0.042,
    high_1024x1024: 0.167,
    low_1536x1024: 0.016,
    medium_1536x1024: 0.063,
    high_1536x1024: 0.25,
    low_1024x1536: 0.016,
    medium_1024x1536: 0.063,
    high_1024x1536: 0.25,
  },
  "gpt-image-1.5": {
    low_1024x1024: 0.011,
    medium_1024x1024: 0.042,
    high_1024x1024: 0.167,
    low_1536x1024: 0.016,
    medium_1536x1024: 0.063,
    high_1536x1024: 0.25,
    low_1024x1536: 0.016,
    medium_1024x1536: 0.063,
    high_1024x1536: 0.25,
  },
  "gpt-image-1": {
    low_1024x1024: 0.011,
    medium_1024x1024: 0.042,
    high_1024x1024: 0.167,
    low_1536x1024: 0.016,
    medium_1536x1024: 0.063,
    high_1536x1024: 0.25,
    low_1024x1536: 0.016,
    medium_1024x1536: 0.063,
    high_1024x1536: 0.25,
  },
};

const DEFAULT_FALLBACK_COST = 0.05;

export function estimateCost(
  model: string,
  quality: string,
  size: string
): number {
  const key = `${quality}_${size}`;
  return COST_TABLE[model]?.[key] ?? DEFAULT_FALLBACK_COST;
}
