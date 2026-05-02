import type { ScriptOutput } from "@/lib/script/schema";

export interface UploadMetaPromptInput {
  runId: string;
  channel: { name: string; concept: string; visualStyle: string; voiceTone: string };
  selectedTitle: string;
  topicTitle: string;
  script: ScriptOutput;
  storyboard: {
    sceneCount: number;
    totalDurationSec: number;
    targetTotalSec: number;
  };
}

export function buildUploadMetaSystemPrompt(
  titleGuide: string,
  thumbnailGuide: string
): string {
  return `당신은 한국 유튜브 SEO/CTR 최적화 메타데이터 작가입니다.
입력으로 받는 본문(script)과 영상 구조(storyboard)를 바탕으로:
1) **업로드 메타** (title, description with timestamps, tags, category)
2) **썸네일 프롬프트 3종** (emotion / contrast / mystery 각 1개)
을 단일 JSON 객체로 산출합니다.

## 8단계 워크플로우 중 현재 위치
1. 분석 → 2. 후보·선택 → 3. 팩트체크 → 4·5. 대본 → 6. 스토리보드
7. **업로드 메타데이터 ← (지금)**
8. **썸네일 프롬프트 ← (지금, 통합 처리)**

## 제목 규칙
- 사용자가 M4에서 선택한 제목(\`selectedTitle\`)을 **출발점**으로 사용
- 본문(script.sections) 분석 결과 **더 강한 제목이 가능하다고 판단되면 개선** — 그 경우 \`meta.titleSource="revised"\`, 그대로면 \`"selected"\`
- 한글 **15~25자 권장** (모바일 25자 잘림). 12자 미만/30자 초과 금지
- 5공식: 충격 사실형 / 질문형 / 비교·대립형 / 리스트·넘버형 / 스토리텔링형
- 핵심 키워드 앞쪽 배치, 숫자는 아라비아, 불필요한 조사 생략
- "충격! 대박! 역대급!" 식 자극 남발 금지, 낚시 금지

## 설명(description) 구조
- \`intro\`: 도입 2~3문장 (50~600자)
- \`timestamps\`: 3~15개, 형식 \`m:ss\` 또는 \`h:mm:ss\`, **시간 오름차순**, 영상 구조의 estimatedSeconds 누적치 기반
  - 각 timestamp는 script.sections 또는 storyboard 흐름의 주요 구간
- \`summary\`: 본문 핵심 요약 + SEO 키워드 자연스럽게 (100~1200자)
- \`hashtags\`: 3~10개, 모두 \`#\`로 시작, 공백 X (\`#한국사\`, \`#조선왕조\`)
- 설명 전체 합 1000~3000자

## 태그 규칙
- **15~20개**, 중복 금지
- 대주제(2~3개) + 소주제(5~7개) + 롱테일(7~10개) 균형
- 각 태그 2~40자, 일반 검색량 있는 키워드 우선

## 카테고리
- YouTube 표준 카테고리 1개 (한글 또는 영문, 예: "교육", "엔터테인먼트", "Education", "People & Blogs")

## 썸네일 3종 (필수, 서로 다른 전략)
1. **emotion** — 인물의 강렬한 표정, 얼굴 30%↑, 단순 배경
2. **contrast** — 화면 분할, 대비 색감, 두 요소 대립
3. **mystery** — 부분 공개, 비일상적 각도, 모호한 상황

각 썸네일은:
- \`strategy\`: 위 3종 중 하나, **3개가 모두 달라야 함**
- \`imagePrompt\`: 영문, 5요소(Subject/Setting/Mood-Lighting/Camera/Style) 모두 포함
  - 반드시 \`visualStylePrefix\`(채널 visualStyle)를 맨 앞에 콤마 prefix로 사용
  - **한글 텍스트 포함 금지** (텍스트는 textOverlay 별도 필드로, 후처리)
  - 정치인·실존인물 얼굴 묘사 금지
- \`textOverlay\`: 한글 **2~5단어**, 제목과 다른 표현, 호기심 유발("?", "...")
- \`rationale\`: 왜 이 전략이 이 주제·타겟에 맞는가

## 출력 규칙
- 응답은 **JSON 단일 객체**만. 코드펜스(\`\`\`)·해설·인사 금지
- meta는 비워둬도 됨 (코드에서 덮어씌움)

## 출력 스키마
{
  "title": string,                        // 12~30자
  "description": {
    "intro": string,                      // 50~600자
    "timestamps": [{ "time": "m:ss", "label": string }, ...],  // 3~15개, 오름차순
    "summary": string,                    // 100~1200자
    "hashtags": ["#tag", ...]             // 3~10개
  },
  "tags": [string, ...],                  // 15~20개, 중복 X
  "category": string,
  "thumbnails": [
    { "strategy": "emotion"|"contrast"|"mystery", "imagePrompt": string, "textOverlay": string, "rationale": string },
    ... (3개, strategy 모두 다름)
  ],
  "meta": { "runId": string, "titleSource": "selected"|"revised", "descriptionCharCount": number, "generatedAt": string, "model": string, "retries": number }
}

---

# 첨부 1: title-guide.md (전문)

${titleGuide}

---

# 첨부 2: thumbnail-guide.md (전문)

${thumbnailGuide}`;
}

export function buildUploadMetaUserPrompt(
  input: UploadMetaPromptInput
): string {
  const blocks: string[] = [];

  blocks.push(`## Channel`);
  blocks.push(`- name: ${input.channel.name}`);
  blocks.push(`- concept: ${input.channel.concept}`);
  blocks.push(`- visualStyle: ${input.channel.visualStyle}`);
  blocks.push(`- voiceTone: ${input.channel.voiceTone}`);
  blocks.push(``);

  blocks.push(`## 사용자가 선택한 제목 (M4)`);
  blocks.push(`> ${input.selectedTitle}`);
  blocks.push(``);

  blocks.push(`## Topic`);
  blocks.push(`- title: ${input.topicTitle}`);
  blocks.push(``);

  blocks.push(`## Visual Style Prefix (모든 thumbnail.imagePrompt 앞에 prefix로 사용)`);
  blocks.push("```");
  blocks.push(input.channel.visualStyle);
  blocks.push("```");
  blocks.push(``);

  // 본문 핵심: hook + climax + ending만 추출
  const hook = input.script.sections.find((s) => s.role === "hook");
  const climax = input.script.sections.find((s) => s.role === "climax");
  const ending = input.script.sections.find((s) => s.role === "ending");

  blocks.push(`## 본문 핵심 (description / 태그용 키워드 추출)`);
  if (hook) {
    blocks.push(`### Hook (${hook.title})`);
    blocks.push(hook.text);
    blocks.push(``);
  }
  if (climax) {
    blocks.push(`### Climax (${climax.title})`);
    blocks.push(climax.text);
    blocks.push(``);
  }
  if (ending) {
    blocks.push(`### Ending (${ending.title})`);
    blocks.push(ending.text);
    blocks.push(``);
  }

  blocks.push(`## 영상 구조 (timestamps 추정용)`);
  blocks.push(
    `- 총 씬 수: ${input.storyboard.sceneCount}, 총 길이: ${input.storyboard.totalDurationSec}초 (목표 ${input.storyboard.targetTotalSec}초)`
  );
  blocks.push(`- script sections (estimatedSeconds 누적치):`);
  let acc = 0;
  input.script.sections.forEach((s, i) => {
    const start = acc;
    acc += s.estimatedSeconds;
    const m = Math.floor(start / 60);
    const sec = start % 60;
    const ts = `${m}:${String(sec).padStart(2, "0")}`;
    blocks.push(`  - ${ts} [${s.role}] ${s.title} (~${s.estimatedSeconds}s)`);
  });
  blocks.push(``);

  blocks.push(`## 작업`);
  blocks.push(
    `runId="${input.runId}". 위 컨텍스트로 UploadMetaSchema에 맞는 JSON 단일 객체로 응답하라.`
  );
  blocks.push(
    `selectedTitle을 출발점으로 검토 후, 더 강한 제목이 가능하면 개선해서 \`titleSource="revised"\`로, 그대로면 \`"selected"\`로 표기.`
  );
  blocks.push(
    `썸네일 3종 imagePrompt 맨 앞에는 위 Visual Style Prefix를 콤마로 붙여서 시작하라.`
  );

  return blocks.join("\n");
}
