import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";

type Params = Promise<{ runId: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { runId } = await params;
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run || !run.audioPath) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const body = await fs.readFile(run.audioPath, "utf8");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `inline; filename="audio_${runId.slice(0, 8)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 410 });
  }
}
