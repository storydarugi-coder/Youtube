import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runDir } from "@/lib/runs/paths";

type Params = Promise<{ runId: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { runId } = await params;
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(runId)) {
    return NextResponse.json({ error: "invalid runId" }, { status: 400 });
  }
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run || !run.srtPath) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const resolved = path.resolve(run.srtPath);
  const expectedRoot = path.resolve(runDir(runId));
  if (!resolved.startsWith(expectedRoot + path.sep)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await fs.readFile(resolved, "utf8");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-subrip; charset=utf-8",
        "Content-Disposition": `inline; filename="video_${runId.slice(0, 8)}.srt"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 410 });
  }
}
