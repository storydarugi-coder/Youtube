import type { ScriptOutput } from "@/lib/script/schema";

export interface StoryboardPromptInput {
  runId: string;
  channel: { name: string; visualStyle: string; voiceTone: string };
  script: ScriptOutput;
  durationMin: number;
  topicTitle: string;
}

export function buildStoryboardSystemPrompt(imagePromptGuide: string): string {
  return `당신은 한국어 유튜브 영상의 스토리보드 디렉터입니다.
입력으로 받는 대본(script.json)을 씬 단위로 분할하고, 각 씬마다:
1) 한국어 자막·내레이션 (caption)
2) 영문 이미지 생성 프롬프트 (imagePrompt) — **5요소 강제 포함**
3) 씬 길이 (durationSec, 3~20초, 권장 8~12초)
를 산출합니다.

## 8단계 워크플로우 중 현재 위치
1. 분석 → 2. 후보·선택 → 3. 팩트체크 → 4·5. 대본
6. **스토리보드 (씬 분할 + 영문 이미지 프롬프트) ← (지금)**
7. 이미지/TTS 생성 (다음 단계, 이번 산출 JSON을 그대로 입력으로 받음)
8. 영상 합성·업로드

## 씬 분할 규칙 (엄수)
- 권장 씬 길이: **8~12초**, 허용 3~20초
- 짧은 hook은 5~8초, 긴 본론 단락은 10~15초
- 각 씬의 \`sectionIndex\`는 입력 script.sections 배열의 인덱스(0-based)
- 첫 씬은 반드시 \`sectionRole === "hook"\`, 마지막 씬은 반드시 \`sectionRole === "outro"\`
- 씬 \`index\`는 1부터 연속해서 1씩 증가
- \`sum(scenes[].durationSec)\` ≈ \`durationMin * 60\` (±15% 안)

## 5요소 강제 (모든 imagePrompt에 빠짐없이 포함)
1. **Subject**: 인물·사물 (실존 정치인·연예인 얼굴 묘사 금지 — 복장·지위·상황으로 표현)
2. **Setting**: 시대·장소 (한국 사극이면 한국 시대 키워드만 — 중국·일본 요소 섞임 금지)
3. **Mood / Lighting**: 씬 감정에 맞는 조명·색감
4. **Camera / Composition**: wide / close-up / bird-eye / low angle 등
5. **Style**: 채널 visualStyle prefix 일관성

## visualStylePrefix 규칙
- 입력으로 받는 \`visualStyle\` 문자열을 **그대로** \`visualStylePrefix\`에 출력
- **모든 imagePrompt의 맨 앞에 prefix를 동일하게 사용** (콤마로 구분)
- 예: prefix="\`cinematic historical illustration, muted warm tones\`"
  → imagePrompt="\`cinematic historical illustration, muted warm tones, a Joseon scholar reading a scroll by candlelight ...\`"

## 안전 규칙
- 폭력적·자극적 묘사 자제 (유튜브 노란딱지 회피)
- 미성년자 + 위험 상황 조합 금지
- 한국 콘텐츠인데 중국풍·일본풍 시각 요소 섞이지 않게 명시 ("Korean", "Joseon", "hanbok" 등)

## 출력 규칙
- 응답은 **JSON 단일 객체**만. 코드펜스(\`\`\`)·해설·인사 금지
- meta는 비워둬도 됨 (코드에서 덮어씌움)
- imagePrompt는 영문, caption은 한국어

## 출력 스키마
{
  "scenes": [
    {
      "index": number,                 // 1부터 연속
      "sectionIndex": number,          // 입력 script.sections의 0-based 인덱스
      "sectionRole": "hook"|"background"|"body"|"climax"|"ending"|"outro",
      "caption": string,               // 한국어 (8~400자)
      "imagePrompt": string,           // 영문, 5요소 포함 (40~1500자)
      "durationSec": number,           // 3~20
      "cameraNote": string?            // 추가 연출 메모
    }, ...
  ],
  "visualStylePrefix": string,         // 입력 visualStyle 그대로
  "totalDurationSec": number,          // 모든 durationSec 합
  "meta": { "runId": string, "sceneCount": number, "avgSceneSec": number, "targetTotalSec": number, "generatedAt": string, "model": string, "retries": number }
}

---

# 첨부: image-prompt-guide.md (전문)

${imagePromptGuide}`;
}

export function buildStoryboardUserPrompt(input: StoryboardPromptInput): string {
  const { runId, channel, script, durationMin, topicTitle } = input;
  const targetTotalSec = durationMin * 60;
  const blocks: string[] = [];

  blocks.push(`## Channel`);
  blocks.push(`- name: ${channel.name}`);
  blocks.push(`- visualStyle: ${channel.visualStyle}`);
  blocks.push(`- voiceTone: ${channel.voiceTone}`);
  blocks.push(``);

  blocks.push(`## Topic`);
  blocks.push(`- title: ${topicTitle}`);
  blocks.push(``);

  blocks.push(`## Visual Style Prefix (모든 씬 imagePrompt 앞에 prefix로 사용)`);
  blocks.push("```");
  blocks.push(channel.visualStyle);
  blocks.push("```");
  blocks.push(``);

  blocks.push(`## Target Total Duration`);
  blocks.push(`- durationMin: ${durationMin}분`);
  blocks.push(`- targetTotalSec: **${targetTotalSec}초** (모든 durationSec 합과 ±15% 안)`);
  blocks.push(``);

  blocks.push(`## Script Sections (sectionIndex는 0-based)`);
  script.sections.forEach((s, i) => {
    blocks.push(``);
    blocks.push(`### Section ${i} — [${s.role}] ${s.title} (~${s.estimatedSeconds}s, ${s.text.length}자)`);
    blocks.push(s.text);
    if (s.transitionToNext) {
      blocks.push(``);
      blocks.push(`(전환: ${s.transitionToNext})`);
    }
  });
  blocks.push(``);

  blocks.push(`## 작업`);
  blocks.push(
    `runId="${runId}". 위 script를 씬 단위(8~12초 권장)로 분할하고, StoryboardSchema에 맞는 JSON 단일 객체로 응답하라.`
  );
  blocks.push(
    `visualStylePrefix는 위 Visual Style Prefix를 그대로 복사해서 출력하고, 모든 imagePrompt 앞에 prefix를 콤마로 붙여라.`
  );

  return blocks.join("\n");
}
