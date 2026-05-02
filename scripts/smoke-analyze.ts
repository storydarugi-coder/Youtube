/**
 * smoke-analyze: 인제스트가 끝난 run의 자막+댓글+메타를 읽어 Claude로 분석.
 * DB를 거치지 않고 파일시스템만 사용하므로, smoke-ingest로 만든 _smoke 데이터를 그대로 재활용 가능.
 *
 * 사용:
 *   ANTHROPIC_API_KEY=... npx tsx scripts/smoke-analyze.ts [run-id]
 *
 * 결과: runs/{runId}/style_guide.json + 콘솔에 JSON + zod 통과 표시
 *
 * 주의: Claude API 비용이 발생합니다. PO가 명시적으로 OK한 뒤에만 실행하세요.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { refsRoot } from "@/lib/runs/paths";
import { analyzeFromInputs } from "@/lib/analyze/style-guide";
import type { RefInput } from "@/lib/analyze/prompts";
import { StyleGuideSchema } from "@/lib/analyze/schema";

const SUBTITLE_CAP = 8000;
const COMMENT_CAP = 30;

interface MetaJson {
  title?: string;
  channel?: string;
  viewCount?: number | null;
  uploadDate?: string | null;
  durationSec?: number | null;
}

interface CommentJson {
  text?: string;
  likes?: number;
  author?: string;
}

async function readDirSafe(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
  } catch {
    return [];
  }
}

async function loadRefFromDir(dir: string, index: number): Promise<RefInput | null> {
  const subtitlesPath = path.join(dir, "subtitles.txt");
  const commentsPath = path.join(dir, "comments.json");
  const metaPath = path.join(dir, "meta.json");

  let subtitles = "";
  try {
    subtitles = (await fs.readFile(subtitlesPath, "utf8")).trim();
  } catch {
    return null;
  }
  if (subtitles.length === 0) return null;

  let comments: CommentJson[] = [];
  try {
    const raw = await fs.readFile(commentsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) comments = parsed;
  } catch {
    /* empty */
  }

  let meta: MetaJson = {};
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    meta = JSON.parse(raw);
  } catch {
    /* empty */
  }

  return {
    index,
    title: meta.title ?? null,
    channelName: meta.channel ?? null,
    viewCount: meta.viewCount ?? null,
    uploadedAt: meta.uploadDate ?? null,
    durationSec: meta.durationSec ?? null,
    subtitles: subtitles.slice(0, SUBTITLE_CAP),
    comments: comments.slice(0, COMMENT_CAP).map((c) => ({
      text: c.text ?? "",
      likeCount: c.likes,
      author: c.author,
    })),
  };
}

async function main() {
  const runId = process.argv[2] ?? "_smoke";
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[smoke-analyze] ❌ ANTHROPIC_API_KEY 환경변수가 필요합니다.");
    process.exit(1);
  }

  console.log(`[smoke-analyze] runId=${runId}`);
  const refsDir = refsRoot(runId);
  const videoDirs = await readDirSafe(refsDir);
  if (videoDirs.length === 0) {
    console.error(`[smoke-analyze] ❌ ${refsDir} 아래 비디오 디렉토리가 없습니다. smoke-ingest를 먼저 실행하세요.`);
    process.exit(2);
  }

  const inputs: RefInput[] = [];
  for (const v of videoDirs) {
    const ref = await loadRefFromDir(path.join(refsDir, v), inputs.length + 1);
    if (ref) {
      console.log(`  ✓ ${v} (자막 ${ref.subtitles.length}자, 댓글 ${ref.comments.length}개)`);
      inputs.push(ref);
    } else {
      console.log(`  ✗ ${v} (자막 없음 — 제외)`);
    }
  }
  if (inputs.length === 0) {
    console.error("[smoke-analyze] ❌ 분석 가능한 자막이 있는 레퍼런스가 없습니다.");
    process.exit(3);
  }

  console.log(`\n[smoke-analyze] Claude Sonnet 4.6 호출 중... (${inputs.length}개 레퍼런스)`);
  const start = Date.now();
  const outPath = await analyzeFromInputs(runId, inputs);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[smoke-analyze] ✅ 분석 완료 in ${elapsed}s`);
  console.log(`[smoke-analyze] 산출: ${outPath}\n`);

  const raw = await fs.readFile(outPath, "utf8");
  const parsed = StyleGuideSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    console.error("[smoke-analyze] ❌ zod 재검증 실패:", parsed.error.message);
    process.exit(4);
  }
  console.log("[smoke-analyze] ✅ zod 검증 통과\n");
  console.log("=== StyleGuide JSON ===");
  console.log(JSON.stringify(parsed.data, null, 2));
}

main().catch((err) => {
  console.error("\n[smoke-analyze] ❌ 실패:", err);
  process.exit(1);
});
