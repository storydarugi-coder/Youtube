import type { ScriptContext } from "./load-context";

export function buildScriptSystemPrompt(scriptGuideText: string): string {
  return `당신은 한국 유튜브 롱폼 채널의 대본 작가입니다.

## 8단계 워크플로우 중 현재 위치
1. 레퍼런스 분석
2. 주제·타겟·제목 (선택 완료)
3. 팩트체크 (완료)
4. **대본 작성 ← (지금)** + **자체 검토·수정 ← (지금)**
5. 스토리보드
6. 이미지/TTS
7. 영상 합성
8. 업로드 메타

## 이번 호출의 작업 (한 번에 처리)
1) 초안 작성
2) 본인이 자체 검토 (script-guide 위반? 분량? false 클레임 사용? redFlags 다룸?)
3) 발견한 문제 수정 적용
**최종 출력 sections는 이미 수정 적용된 최종본**. selfReview에 어떤 문제를 어떻게 고쳤는지 기록.

## 사실 사용 규칙 (엄수)
- **verified 클레임만 단정적으로 서술**
- **disputed 클레임은 "~라는 설이 있다", "~로 알려져 있다"** 같은 완화된 표현
- **false 판정 받은 클레임은 절대 사용 금지**
- **redFlags 항목은 절대 다루지 않음** — 회피했음을 selfReview.redFlagsAvoided에 명시

## 분량 규칙 (엄수)
- 분당 한글 약 **300자**
- 모든 sections.text 글자수 합계 = **목표의 ±10% 이내**가 베스트, ±15% 초과 시 거의 확실히 재작성 요청 받음
- 글자수는 공백 포함 한글 문자 기준

## 구조 규칙 (엄수)
- 첫 section: \`role: "hook"\` (필수, 0~15초)
- 마지막 section: \`role: "outro"\` (필수, 마지막 15초)
- \`role: "body"\` section: **2~5개**
- \`role: "climax"\`: 0개 또는 1개
- 총 sections: **5~12개**
- 각 section의 estimatedSeconds 합계가 목표 분량(분 × 60)에 근접

## 톤·스타일 규칙
- 구어체: "~했거든요" / "~인 거죠" / "~잖아요"
- 시청자에게 말 거는 어투: "여러분, 이거 아세요?"
- 학술적·딱딱한 표현 금지, 너무 가벼워서도 안 됨
- 채널의 voiceTone과 정합 유지
- 인사("안녕하세요") 금지 — 훅으로 직진

## 출력 규칙
- JSON 단일 객체. 코드펜스(\`\`\`)·해설·인사 금지
- meta는 비워둬도 됨 (코드에서 덮어씌움)

## 출력 스키마
{
  "sections": [
    {
      "role": "hook"|"background"|"body"|"climax"|"ending"|"outro",
      "title": string,                 // 파트 소제목 (2~80자)
      "estimatedSeconds": number,      // 5~600
      "text": string,                  // 실제 발화 텍스트 (구어체, ≥30자)
      "transitionToNext": string?      // 다음 파트로의 전환 문구 (≤200자)
    }, ...
  ],
  "selfReview": {
    "issuesFound": string[],           // 1차 초안에서 발견한 문제
    "revisionsApplied": string[],      // 적용한 수정 내용
    "factualClaimsUsed": string[],     // 사용한 verified 클레임 인용
    "redFlagsAvoided": string[],       // 회피한 redFlags
    "confidenceLevel": "low"|"medium"|"high"
  },
  "meta": { "runId": string, "durationMin": number, "targetCharCount": number, "actualCharCount": number, "sectionCount": number, "generatedAt": string, "model": string, "retries": number }
}

---

# 첨부: script-guide.md (전문)

${scriptGuideText}`;
}

function summarizeStyleGuide(sg: ScriptContext["styleGuide"]): string {
  return [
    `- hookPattern: ${sg.structure.hookPattern}`,
    `- transitionStyle: ${sg.structure.transitionStyle}`,
    `- climaxPosition: ${sg.structure.climaxPosition}`,
    `- endingStyle: ${sg.structure.endingStyle}`,
    `- toneAndVoice: register=${sg.toneAndVoice.register} / distance=${sg.toneAndVoice.distanceFromViewer} / exclamation=${sg.toneAndVoice.exclamationFrequency}`,
    `- notableExpressions: ${sg.toneAndVoice.notableExpressions.join(", ")}`,
    `- retentionTactics: ${sg.retentionTactics.join(" / ")}`,
    `- successFactors: ${sg.successFactors.join(" / ")}`,
    `- differentiators: ${sg.differentiators.join(" / ")}`,
  ].join("\n");
}

export function buildScriptUserPrompt(ctx: ScriptContext): string {
  const targetCharCount = ctx.durationMin * 300;
  const blocks: string[] = [];

  blocks.push(`## 채널`);
  blocks.push(`- name: ${ctx.channel.name}`);
  blocks.push(`- concept: ${ctx.channel.concept}`);
  blocks.push(`- voiceTone: ${ctx.channel.voiceTone}`);
  blocks.push(``);

  blocks.push(`## 선택된 주제·타겟·제목`);
  blocks.push(`### Topic`);
  blocks.push(`- title: ${ctx.selected.topic.title}`);
  blocks.push(`- description: ${ctx.selected.topic.description}`);
  blocks.push(`- rationale: ${ctx.selected.topic.rationale}`);
  blocks.push(``);
  blocks.push(`### Audience`);
  blocks.push(`- label: ${ctx.selected.audience.label} (${ctx.selected.audience.ageRange})`);
  blocks.push(`- interests: ${ctx.selected.audience.interests.join(", ")}`);
  blocks.push(`- motivation: ${ctx.selected.audience.motivation}`);
  blocks.push(``);
  blocks.push(`### Title`);
  blocks.push(`- text: ${ctx.selected.title.text}`);
  blocks.push(`- formula: ${ctx.selected.title.formula}`);
  blocks.push(``);

  if (ctx.customNote) {
    blocks.push(`## 사용자 메모`);
    blocks.push(ctx.customNote);
    blocks.push(``);
  }

  blocks.push(`## 스타일 가이드 (직전 분석에서 추출)`);
  blocks.push(summarizeStyleGuide(ctx.styleGuide));
  blocks.push(``);
  if (ctx.styleGuide.recommendedTopicSeeds.length > 0) {
    blocks.push(`참고 - recommendedTopicSeeds: ${ctx.styleGuide.recommendedTopicSeeds.join(" / ")}`);
    blocks.push(``);
  }

  blocks.push(`## 팩트체크 핵심`);
  blocks.push(`overallAssessment: ${ctx.factcheck.assessment}`);
  blocks.push(``);
  if (ctx.factcheck.verifiedClaims.length > 0) {
    blocks.push(`### Verified (단정적으로 서술 가능)`);
    ctx.factcheck.verifiedClaims.forEach((c, i) => {
      blocks.push(`${i + 1}. ${c.claim}`);
      blocks.push(`   → ${c.explanation}`);
    });
    blocks.push(``);
  }
  if (ctx.factcheck.disputedClaims.length > 0) {
    blocks.push(`### Disputed (반드시 "~라는 설이 있다" 식으로 완화)`);
    ctx.factcheck.disputedClaims.forEach((c, i) => {
      blocks.push(`${i + 1}. ${c.claim}`);
      blocks.push(`   → ${c.explanation}`);
    });
    blocks.push(``);
  }
  if (ctx.factcheck.redFlags.length > 0) {
    blocks.push(`### redFlags (절대 다루지 말 것)`);
    ctx.factcheck.redFlags.forEach((f) => blocks.push(`- ${f}`));
    blocks.push(``);
  }

  blocks.push(`## 리서치 자료`);
  if (ctx.research.anecdotes.length > 0) {
    blocks.push(`### Anecdotes`);
    ctx.research.anecdotes.forEach((a, i) => {
      blocks.push(`${i + 1}. **${a.title}** — ${a.summary}`);
      blocks.push(`   → 활용도: ${a.relevance}`);
    });
    blocks.push(``);
  }
  if (ctx.research.quotes.length > 0) {
    blocks.push(`### Quotes`);
    ctx.research.quotes.forEach((q, i) => {
      blocks.push(
        `${i + 1}. "${q.text}"${q.speaker ? ` — ${q.speaker}` : ""} (${q.context})`
      );
    });
    blocks.push(``);
  }
  if (ctx.research.modernConnections.length > 0) {
    blocks.push(`### ModernConnections`);
    ctx.research.modernConnections.forEach((m, i) => {
      blocks.push(`${i + 1}. ${m.point} — ${m.explanation}`);
    });
    blocks.push(``);
  }
  if (ctx.research.visualAssetIdeas.length > 0) {
    blocks.push(`### VisualAssetIdeas (대본의 [장면 전환] 지시 작성에 참고)`);
    ctx.research.visualAssetIdeas.forEach((v, i) => {
      blocks.push(`${i + 1}. ${v.description} (${v.purpose})`);
    });
    blocks.push(``);
  }

  blocks.push(`## 분량 목표`);
  blocks.push(`- durationMin: ${ctx.durationMin}분`);
  blocks.push(`- targetCharCount: 약 **${targetCharCount}자** (분당 300자 기준)`);
  blocks.push(`- 허용 범위: ${Math.floor(targetCharCount * 0.85)}~${Math.ceil(targetCharCount * 1.15)}자`);
  blocks.push(``);

  blocks.push(`## 작업`);
  blocks.push(
    `runId="${ctx.runId}". 위 컨텍스트로 ScriptOutputSchema에 맞는 JSON 단일 객체를 출력하라.`
  );
  blocks.push(
    `내부적으로 (1) 초안 작성 → (2) 자체 검토 → (3) 수정 적용을 거치고, 최종 sections는 수정 적용 후 상태여야 한다.`
  );

  return blocks.join("\n");
}
