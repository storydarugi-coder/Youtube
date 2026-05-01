/**
 * smoke-ingest: 단일 URL을 인제스트해서 4개 산출물이 생성되는지 검증.
 *
 * 사용:
 *   npx tsx scripts/smoke-ingest.ts <youtube-url> [run-id]
 *
 * 결과: runs/{runId}/refs/{videoId}/{subtitles.txt, comments.json, thumbnail.jpg, meta.json}
 */
import path from "node:path";
import fs from "node:fs/promises";
import { ingestReference } from "@/lib/ingest";
import { refDir, refFiles } from "@/lib/runs/paths";

async function main() {
  const url = process.argv[2];
  const runId = process.argv[3] ?? "_smoke";
  if (!url) {
    console.error("사용: tsx scripts/smoke-ingest.ts <youtube-url> [run-id]");
    process.exit(1);
  }

  console.log(`\n[smoke] runId=${runId}\n[smoke] url=${url}`);
  const start = Date.now();
  const data = await ingestReference(url, runId);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n[smoke] ✅ 인제스트 완료 in ${elapsed}s`);
  console.log(`[smoke] videoId: ${data.videoId}`);
  console.log(`[smoke] title:   ${data.title}`);
  console.log(`[smoke] channel: ${data.channelName}`);
  console.log(`[smoke] views:   ${data.viewCount}`);
  console.log(`[smoke] dur:     ${data.durationSec}s`);

  const dir = refDir(runId, data.videoId);
  console.log(`\n[smoke] 산출 디렉터리: ${dir}\n`);

  const required = [
    refFiles.subtitles,
    refFiles.comments,
    refFiles.thumbnail,
    refFiles.meta,
  ];
  let allPresent = true;
  for (const f of required) {
    const p = path.join(dir, f);
    try {
      const stat = await fs.stat(p);
      console.log(`  ✓ ${f.padEnd(16)} ${stat.size} bytes`);
    } catch {
      console.log(`  ✗ ${f.padEnd(16)} MISSING`);
      allPresent = false;
    }
  }

  if (!allPresent) {
    console.error("\n[smoke] ❌ 일부 파일이 없습니다.");
    process.exit(2);
  }
  console.log("\n[smoke] ✅ 4개 파일 모두 존재");
}

main().catch((err) => {
  console.error("\n[smoke] ❌ 실패:", err);
  process.exit(1);
});
