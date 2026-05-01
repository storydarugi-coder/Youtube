# 내 오토워커 (My Autoworker)

> 유튜브 롱폼 영상을 **레퍼런스 3편 → 대본·스토리보드·썸네일·업로드 정보까지** 자동으로 만들어주는 개인용 도구.

오토워커(개발남노씨) 보너스 자료의 워크플로우를 본인 스택(Claude + GPT Image + ElevenLabs + FFmpeg)으로 재구현한 풀스택 웹앱.

## 무엇을 만드는가

채널 단위로 운영하는 영상 제작 자동화 도구. 한 번 채널을 등록해두면 (예: "야담 채널 — 조선시대 야사", 3D 카툰 스타일, 한국 남성 내레이터), 그 다음부터는 **레퍼런스 영상 URL 3개**만 던지면 알아서 다음을 만든다:

1. 성공요인 분석 (레퍼런스의 톤·구조·시청자 반응)
2. 주제·타겟·제목 후보 3개씩 추천 → 사용자 선택
3. 팩트체크 + 추가 정보 검색
4. 대본 작성 (구어체, 분량 자동 조절)
5. 자체 검토·수정
6. 스토리보드 (씬별 영어 이미지 프롬프트)
7. 업로드 정보 (제목·설명·태그)
8. 썸네일 프롬프트 3종 (감정/대비/미스터리 전략)

→ 최종 산출물: MP4 + Vrew/CapCut export 옵션.

## 기술 스택

- **Next.js 16** (App Router, 풀스택 단일 앱)
- TypeScript + Tailwind CSS
- Anthropic SDK (Claude Sonnet 4.6) — 대본·분석
- OpenAI SDK (gpt-image) — 이미지 생성
- ElevenLabs SDK — TTS
- FFmpeg (영상 합성)
- yt-dlp (레퍼런스 영상 자막·댓글 수집)

## 시작하기

> ⚠️ M2 진행 중 — 레퍼런스 인제스트 구현됨

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 세팅
cp .env.example .env.local
# .env.local 열어서 API 키 채워넣기

# 3. DB 초기화
npm run db:generate
npm run db:migrate

# 4. 개발 서버 시작
npm run dev
```

## 외부 도구 (호스트에 설치 필요)

레퍼런스 인제스트 모듈은 호스트의 `yt-dlp`와 `ffmpeg`를 호출합니다. 설치되어 있지 않으면 미리 설치해주세요.

### Windows
```powershell
# Chocolatey (권장)
choco install yt-dlp ffmpeg

# 또는 winget
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg

# 또는 Scoop
scoop install yt-dlp ffmpeg
```

### macOS
```bash
brew install yt-dlp ffmpeg
```

### Linux
```bash
sudo apt install yt-dlp ffmpeg          # Debian/Ubuntu
sudo pacman -S yt-dlp ffmpeg            # Arch
```

설치 확인:
```bash
yt-dlp --version
ffmpeg -version
```

## API 키 발급

총 3개의 외부 서비스 키가 필요해요.

| 서비스 | 어디서 발급? | 용도 |
|---|---|---|
| **Anthropic** | console.anthropic.com → API Keys | 대본·분석 (Claude) |
| **OpenAI** | platform.openai.com → API Keys | 썸네일·이미지 (gpt-image) |
| **ElevenLabs** | elevenlabs.io → Profile → API Key | 음성 생성 (TTS) |

각 서비스 모두 처음 가입하면 무료 크레딧 있음. 본격 운영하려면 결제 등록 필요.

## 라이선스

개인용. 보너스 자료(개발남노씨 강의)는 본 리포에 포함되지 않음.
