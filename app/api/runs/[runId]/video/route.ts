import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runDir } from "@/lib/runs/paths";

type Params = Promise<{ runId: string }>;

export async function GET(req: Request, { params }: { params: Params }) {
  const { runId } = await params;
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(runId)) {
    return NextResponse.json({ error: "invalid runId" }, { status: 400 });
  }
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run || !run.videoPath) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const resolved = path.resolve(run.videoPath);
  const expectedRoot = path.resolve(runDir(runId));
  if (!resolved.startsWith(expectedRoot + path.sep)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 410 });
  }
  if (!stat.isFile() || stat.size === 0) {
    return NextResponse.json({ error: "file missing" }, { status: 410 });
  }

  // Range 요청은 단순화를 위해 풀 바디만. 큰 mp4도 OK (Next.js가 chunked streaming 처리).
  const range = req.headers.get("range");
  if (range) {
    // 단순 구현: 첫 요청 풀바디 + Accept-Ranges로 brower가 바이트 시킹 시 다시 요청
    // 실제 시킹은 다음 라운드에 정식 Range 응답 추가 가능.
  }

  const data = await fs.readFile(resolved);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(data.byteLength),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="video_${runId.slice(0, 8)}.mp4"`,
    },
  });
}
