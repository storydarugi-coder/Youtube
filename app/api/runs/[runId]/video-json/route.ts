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
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run || !run.videoMdPath) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const jsonPath = path.join(runDir(runId), "video.json");
  try {
    const body = await fs.readFile(jsonPath, "utf8");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `inline; filename="video_${runId.slice(0, 8)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 410 });
  }
}
