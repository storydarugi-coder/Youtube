// 1080p 영상 합성 표준 프리셋
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;
export const VIDEO_CODEC = "libx264";
export const VIDEO_PRESET = "medium";
export const VIDEO_CRF = 23;
export const AUDIO_CODEC = "aac";
export const AUDIO_BITRATE = "128k";
export const SAMPLE_RATE = 44100;
export const PIX_FMT = "yuv420p";

export const PLACEHOLDER_DURATION_MS = 1500;
export const MIN_SCENE_DURATION_MS = 200;

export interface SceneRenderArgsInput {
  imagePath: string | null;
  audioPath: string | null;
  durationMs: number;
  outPath: string;
}

/**
 * 씬 1개 → mp4 변환을 위한 ffmpeg 인자 빌더.
 * - 이미지 + 오디오 모두 있음: -loop 1 image + audio, t=durationSec
 * - 이미지만: -loop 1 image, anullsrc 무음, t=durationSec
 * - 둘 다 없음: 검정 화면(color=black) + anullsrc 무음 (placeholder)
 *
 * 출력: 1920x1080, h264 (medium, crf 23), aac 128k, faststart, yuv420p
 */
export function buildSceneFfmpegArgs(input: SceneRenderArgsInput): string[] {
  const durationSec = (input.durationMs / 1000).toFixed(3);
  const args: string[] = ["-y"];

  if (input.imagePath && input.audioPath) {
    // 케이스 1: 이미지 + 오디오
    args.push("-loop", "1", "-i", input.imagePath);
    args.push("-i", input.audioPath);
  } else if (input.imagePath) {
    // 케이스 2: 이미지만 (무음)
    args.push("-loop", "1", "-i", input.imagePath);
    args.push(
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}`
    );
  } else {
    // 케이스 3: 둘 다 없음 (placeholder)
    args.push(
      "-f",
      "lavfi",
      "-i",
      `color=c=black:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:r=${VIDEO_FPS}`
    );
    args.push(
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=${SAMPLE_RATE}`
    );
  }

  // 영상: scale + pad로 1920x1080 letterbox
  // 이미지/검정 입력은 어떤 사이즈든 letterbox 처리
  const vfilter = `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${VIDEO_FPS}`;
  args.push("-vf", vfilter);

  // 출력 코덱
  args.push("-c:v", VIDEO_CODEC);
  args.push("-preset", VIDEO_PRESET);
  args.push("-crf", String(VIDEO_CRF));
  args.push("-pix_fmt", PIX_FMT);
  args.push("-c:a", AUDIO_CODEC);
  args.push("-b:a", AUDIO_BITRATE);
  args.push("-ar", String(SAMPLE_RATE));
  args.push("-ac", "2");

  // 길이 강제 (오디오 끝나면 영상도 끝나게 -shortest 가 아니라 -t로 명시)
  args.push("-t", durationSec);
  args.push("-movflags", "+faststart");
  args.push(input.outPath);
  return args;
}

/**
 * concat demuxer용 인자.
 * listFile: "file '/abs/01.mp4'\nfile '/abs/02.mp4'\n..." 형식
 */
export function buildConcatFfmpegArgs(
  listFile: string,
  outPath: string
): string[] {
  return [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    // 코덱은 이미 동일하므로 stream copy
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outPath,
  ];
}
