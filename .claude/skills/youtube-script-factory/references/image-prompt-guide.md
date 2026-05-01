# 이미지 프롬프트 작성 가이드 (스토리보드용)

## 목적

영상의 각 씬에 사용할 이미지를 AI(gpt-image, Whisk, Midjourney 등)로 생성하기 위한 프롬프트를 작성한다. **영어**로 작성한다 (대부분의 이미지 생성 모델이 영어에 최적화).

## 프롬프트 5요소 템플릿

좋은 이미지 프롬프트는 아래 다섯 요소를 빠짐없이 포함한다.

### 1. 주체 (Subject)
화면에 있는 사람·사물.
- ❌ "a Korean general"
- ✅ "a Joseon-era Korean general in full traditional armor, standing tall and resolute"

### 2. 배경 (Setting)
시대·장소를 명확하게.
- "ancient Korean palace courtyard with wooden pillars and stone pavement"
- 시대 고증 반영 (건축양식·자연환경·소품)

### 3. 분위기·조명 (Mood / Lighting)
씬의 감정에 맞춰서.
- 긴장: `dramatic lighting, dark shadows, stormy sky`
- 평화: `soft golden hour light, warm tones, serene atmosphere`
- 비극: `cold blue tones, rain, somber mood`

### 4. 카메라·구도 (Camera / Composition)
- 와이드 / 클로즈업 / 버드아이뷰 / 로우앵글 등
- 중요 장면 = close-up, 배경 설명 = wide shot

### 5. 스타일 (Style)
**채널 전체에 동일한 스타일 프리픽스를 사용해야 일관성 확보**.
추천 스타일 키워드:
- `cinematic historical illustration`
- `digital painting, muted warm tones`
- `dramatic historical scene, painterly style`
- `detailed illustration, textbook quality`
- `3d cartoon, soft lighting, friendly atmosphere` (오토워커 디폴트)

## 템플릿

```
[Style], [Subject doing action] in [Setting], [Mood / Lighting], [Camera angle], [Additional details]
```

**예시:**
```
Cinematic historical illustration, a Joseon dynasty scholar reading a scroll by candlelight in a small wooden study room, warm amber tones, soft flickering light casting long shadows, close-up shot from slightly above, detailed hanbok with traditional patterns, ink brushes and paper scattered on the desk
```

## 주의사항

### 인물 묘사
- **실존 인물의 얼굴을 특정하지 않음** (정치인·연예인 등)
- 대신 복장·지위·상황으로 인물을 표현
- ✅ "a king wearing a red dragon robe (gonryongpo)"

### 콘텐츠별 안전 가드
- 폭력적·자극적 묘사 자제 (유튜브 노란딱지)
- 미성년자 + 위험 상황 조합 금지
- 한국 콘텐츠인데 중국·일본 시각 요소가 섞이지 않게 명시

### 스타일 일관성
- 같은 영상 내 모든 프롬프트에 **동일한 스타일 프리픽스** 사용
- 반복 등장하는 인물은 동일한 외형 묘사 유지
- 색감 톤 통일 (예: 전체 `muted warm tones` 또는 `cool cinematic tones`)

## 시대·장르별 비주얼 키워드 참고

### 한국 역사
- 고조선/삼국시대: 토기·금관·고분벽화 스타일·철기 무기
- 고려: 청자·불교 사찰·팔만대장경·문신 복식
- 조선: 한양 도성·경복궁·유교적 건축·한복·갓·과거시험장
- 근현대: 개항기 건축물·서양식 복장 혼합·전쟁 장면

### 그 외 장르
- 미스터리/스릴러: `noir lighting, deep shadows, fog, urban backdrop`
- 코미디/일상: `bright pastel colors, soft outlines, friendly atmosphere`
- 다큐멘터리: `realistic photography style, natural lighting, documentary framing`
- SF/판타지: `cinematic sci-fi lighting, neon accents, atmospheric haze`

## 텍스트 포함 시

이미지 안에 한글 텍스트를 넣어야 할 경우:
- gpt-image-2 Thinking 모드 사용 (텍스트 정확도 ↑)
- 텍스트는 짧게 (2~5단어)
- 명시: `with Korean text "텍스트내용" prominently displayed`
