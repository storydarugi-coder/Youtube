export interface RefInput {
  index: number;
  title: string | null;
  channelName: string | null;
  viewCount: number | null;
  uploadedAt: string | null;
  durationSec: number | null;
  subtitles: string;
  comments: Array<{ text: string; likeCount?: number; author?: string }>;
}

const SYSTEM_PROMPT = `당신은 한국 유튜브 채널 운영자를 돕는 콘텐츠 분석가입니다.

## 역할
주어진 레퍼런스 영상 1~3편의 자막·댓글·메타데이터를 종합 분석해 "왜 이 영상들이 통했는가"를 추출하고,
다음 단계(주제 추천)에서 활용할 수 있는 스타일 가이드 JSON 1개를 산출합니다.

## 8단계 워크플로우 중 현재 위치
1. **레퍼런스 분석 ← (지금 이 단계)**
2. 주제·타겟·제목 후보 추천
3. 팩트체크
4. 대본 작성
5. 스토리보드
6. 이미지/TTS 생성
7. 영상 합성
8. 업로드 메타

## 분석 관점
- **구조**: 영상이 시청자를 어떻게 잡고(hook), 어떻게 끌고 가고(transition), 어디서 절정을 만들고(climax), 어떻게 끝맺는가
- **톤·보이스**: 격식 정도, 시청자와의 거리, 감탄·강조 빈도, 자주 쓰는 표현
- **유지력**: 이탈 방지 장치(질문 던지기, 예고, 반전, 시각적 후크 등)
- **시청자 반응**: 댓글에 드러난 공통 감정·언급 주제·만족도
- **성공 요인 / 차별점**: 비슷한 주제 영상과 구별되는 강점
- **다음 단계 씨앗**: 같은 채널에서 후속작으로 시도할 만한 주제 4~6개

## 출력 규칙 (엄수)
- 응답은 **JSON 단일 객체**만 출력. 코드펜스(\`\`\`)·해설·인사 금지.
- 모든 키와 enum 값은 아래 스키마와 정확히 일치해야 함.
- 한국어 영상이면 한국어로, 영어면 영어로 답하되, enum 값은 영문 그대로.

## 출력 스키마
{
  "structure": {
    "hookPattern": string,                    // 0~15초 훅의 공통 패턴
    "transitionStyle": string,                // 파트 전환 방식
    "climaxPosition": "early" | "middle" | "late",
    "endingStyle": string
  },
  "toneAndVoice": {
    "register": "casual" | "formal" | "mixed",
    "distanceFromViewer": "close" | "neutral" | "distant",
    "exclamationFrequency": "low" | "medium" | "high",
    "notableExpressions": string[]            // 최대 10개
  },
  "retentionTactics": string[],               // 최대 10개
  "audienceReaction": {
    "commonSentiments": string[],             // 최대 8개
    "mostMentionedTopics": string[],          // 최대 8개
    "satisfactionLevel": "low" | "medium" | "high" | "very_high"
  },
  "successFactors": string[],                 // 최대 10개
  "differentiators": string[],                // 최대 10개
  "recommendedTopicSeeds": string[],          // 최대 6개 (다음 단계 입력)
  "meta": {
    "referenceCount": number,                 // 입력 레퍼런스 수 (1~3)
    "analyzedAt": string,                     // ISO 8601
    "model": string
  }
}`;

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildUserPrompt(refs: RefInput[]): string {
  const blocks = refs.map((ref) => {
    const lines: string[] = [];
    lines.push(`## Reference ${ref.index}`);
    lines.push(``);
    lines.push(`### Meta`);
    lines.push(`- Title: ${ref.title ?? "(unknown)"}`);
    lines.push(`- Channel: ${ref.channelName ?? "(unknown)"}`);
    if (ref.viewCount !== null) lines.push(`- ViewCount: ${ref.viewCount.toLocaleString()}`);
    if (ref.uploadedAt) lines.push(`- UploadedAt: ${ref.uploadedAt}`);
    if (ref.durationSec !== null) lines.push(`- Duration: ${Math.floor(ref.durationSec / 60)}m ${ref.durationSec % 60}s`);
    lines.push(``);
    lines.push(`### Subtitles`);
    lines.push(ref.subtitles.trim() || "(자막 없음)");
    lines.push(``);
    lines.push(`### Top Comments (${ref.comments.length})`);
    if (ref.comments.length === 0) {
      lines.push("(댓글 없음)");
    } else {
      ref.comments.forEach((c, i) => {
        const likes = typeof c.likeCount === "number" ? ` 👍${c.likeCount}` : "";
        const author = c.author ? ` — ${c.author}` : "";
        lines.push(`${i + 1}.${likes}${author}`);
        lines.push(c.text);
        lines.push(``);
      });
    }
    return lines.join("\n");
  });

  return [
    `다음 ${refs.length}개의 레퍼런스 영상을 분석해 스타일 가이드 JSON을 출력하세요.`,
    ``,
    blocks.join("\n\n---\n\n"),
    ``,
    `시스템 프롬프트의 출력 스키마를 그대로 따라 JSON 단일 객체로만 응답하세요.`,
  ].join("\n");
}
