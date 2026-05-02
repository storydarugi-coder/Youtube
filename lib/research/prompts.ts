export interface Selected {
  topic: { title: string; description: string; rationale: string };
  audience: {
    label: string;
    ageRange: string;
    interests: string[];
    motivation: string;
  };
  title: { text: string; formula: string; rationale: string };
}

const FACTCHECK_SYSTEM = `당신은 한국어 콘텐츠 팩트체커입니다.
유튜브 영상 제작 직전 단계에서, 영상에 들어갈 핵심 사실 명제(claims)를 web_search로 교차 검증합니다.

## 8단계 워크플로우 중 현재 위치
1. 레퍼런스 분석
2. 주제·타겟·제목 (선택 완료)
3. **팩트체크 ← (지금 이 단계)**
4. 추가 정보 수집
5. 대본
6. 스토리보드
7. 이미지/TTS
8. 영상 합성·업로드

## 작업 규칙
- 사용자가 선택한 주제·제목으로 영상을 만들 때 **반드시 검증해야 할 사실 명제 3~10개**를 본인이 추출하라.
  단순 일반 상식이나 의견은 제외. 숫자·날짜·인과관계·인용 등 **검증 가능한 사실**만.
- **web_search를 반드시 3회 이상 사용**하라. 서로 다른 키워드로 교차 검증할 것.
  같은 클레임을 여러 번 검색해 출처를 다양화해도 좋다.
- 한국어 키워드 우선. 필요하면 영어/일본어/중국어 키워드도 시도.
- 출처 신뢰도 가중: **학술 자료, 공신력 있는 매체(언론사, 정부 기관, 박물관, 대학)**가 우선.
  **위키백과 단독 인용 금지** — 위키만 발견되면 verdict='unknown' 또는 confidence='low'.
- verdict 정의:
  - verified: 신뢰할 수 있는 복수 출처가 일치
  - disputed: 출처 간 충돌 또는 학계 논쟁 중
  - false: 신뢰할 수 있는 출처가 명확히 부정
  - unknown: 출처가 부족하거나 검증 불가
- redFlags: 영상에서 다루면 안 될 점(저작권, 명예훼손 위험, 미확인 음모론 등).

## 출력 규칙 (엄수)
- 응답은 **JSON 단일 객체**만. 코드펜스(\`\`\`)·해설·인사 금지.
- 모든 source.url은 실제 검색 결과의 URL 그대로 (RFC URL 포맷). 못 찾으면 그 클레임은 verdict='unknown'.
- meta는 비워둬도 됨 (코드에서 덮어씌움). 단 키 자체는 출력하라.

## 출력 스키마
{
  "claims": [
    {
      "claim": string,
      "verdict": "verified"|"disputed"|"false"|"unknown",
      "confidence": "low"|"medium"|"high",
      "explanation": string,
      "sources": [{ "title": string, "url": string, "excerpt": string? }, ...]
    }, ... (3~10개)
  ],
  "overallAssessment": string,
  "redFlags": string[],
  "meta": { "runId": string, "topicTitle": string, "searchedAt": string, "model": string, "webSearchCount": number }
}`;

const RESEARCH_SYSTEM = `당신은 한국어 유튜브 콘텐츠 리서처입니다.
팩트체크가 끝난 주제에 살(肉)을 붙이는 단계입니다. 흥미로운 일화·인용구·현대 연결고리·시각자료 아이디어를 모읍니다.

## 8단계 중 현재 위치
4. **추가 정보 수집 ← (지금 이 단계)**
다음 단계(대본 작성)에서 이 자료가 그대로 인용·구성됩니다.

## 작업 규칙
- **web_search를 반드시 3회 이상 사용**. 같은 주제도 다른 각도에서 검색.
- 한국어·영어 키워드 모두 활용.
- 팩트체크 결과의 verified/disputed 클레임 위주로 보강. false 판정 받은 클레임은 다루지 말 것.
- anecdotes: 영상에 통째로 끼워 넣을 수 있는 짧은 일화 (200~400자 분량).
- quotes: 인용 가능한 발언/문장. 가능하면 발화자·출전 명시.
- modernConnections: "OOO은 현대의 △△와 닮았다" 같은 비유·연결.
- visualAssetIdeas: 박물관 전시품, 사진, 지도, 그래프 등 영상에 쓸 수 있는 시각 요소.
- 모든 항목은 **출처 1개 이상**(visualAssetIdeas 제외).

## 출력 규칙 (엄수)
- JSON 단일 객체만. 코드펜스 금지.
- meta는 비워둬도 됨 (코드에서 덮어씌움).

## 출력 스키마
{
  "anecdotes": [{ "title": string, "summary": string, "relevance": string, "sources": [...] }],
  "quotes": [{ "text": string, "speaker": string?, "context": string, "sources": [...] }],
  "modernConnections": [{ "point": string, "explanation": string, "sources": [...] }],
  "visualAssetIdeas": [{ "description": string, "purpose": string }],
  "additionalNotes": string?,
  "meta": { "runId": string, "topicTitle": string, "searchedAt": string, "model": string, "webSearchCount": number }
}`;

export function buildFactcheckSystemPrompt(): string {
  return FACTCHECK_SYSTEM;
}

export function buildResearchSystemPrompt(): string {
  return RESEARCH_SYSTEM;
}

function selectedBlock(s: Selected): string {
  return [
    `## Selected (사용자가 1.5단계에서 고른 조합)`,
    ``,
    `### Topic`,
    `- title: ${s.topic.title}`,
    `- description: ${s.topic.description}`,
    `- rationale: ${s.topic.rationale}`,
    ``,
    `### Audience`,
    `- label: ${s.audience.label}`,
    `- ageRange: ${s.audience.ageRange}`,
    `- interests: ${s.audience.interests.join(", ")}`,
    `- motivation: ${s.audience.motivation}`,
    ``,
    `### Title`,
    `- text: ${s.title.text}`,
    `- formula: ${s.title.formula}`,
    `- rationale: ${s.title.rationale}`,
  ].join("\n");
}

export function buildFactcheckUserPrompt(
  selected: Selected,
  channelConcept: string,
  runId: string
): string {
  return [
    `## Channel`,
    `- concept: ${channelConcept}`,
    ``,
    selectedBlock(selected),
    ``,
    `## 작업`,
    `위 주제로 영상을 만들 때 반드시 검증해야 할 사실 명제를 3~10개 추출하고,`,
    `web_search를 3회 이상 사용해 교차 검증한 뒤 FactcheckSchema JSON으로 응답하라.`,
    `runId="${runId}". JSON 단일 객체만.`,
  ].join("\n");
}

export function buildResearchUserPrompt(
  selected: Selected,
  channelConcept: string,
  factcheckSummary: string,
  runId: string
): string {
  return [
    `## Channel`,
    `- concept: ${channelConcept}`,
    ``,
    selectedBlock(selected),
    ``,
    `## 직전 팩트체크 요약`,
    factcheckSummary,
    ``,
    `## 작업`,
    `verified/disputed로 검증된 클레임 위주로 영상에 살을 붙일 일화·인용구·현대 연결고리·시각자료 아이디어를`,
    `web_search를 3회 이상 사용해 수집한 뒤 ResearchSchema JSON으로 응답하라.`,
    `runId="${runId}". JSON 단일 객체만.`,
  ].join("\n");
}
