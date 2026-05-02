import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { runDir } from "@/lib/runs/paths";

type Params = Promise<{ runId: string; index: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { runId, index } = await params;

  if (!/^[A-Za-z0-9_-]{6,40}$/.test(runId)) {
    return NextResponse.json({ error: "invalid runId" }, { status: 400 });
  }
  if (!/^\d{1,4}$/.test(index)) {
    return NextResponse.json({ error: "invalid index" }, { status: 400 });
  }
  const sceneIndex = parseInt(index, 10);
  if (sceneIndex < 1 || sceneIndex > 9999) {
    return NextResponse.json({ error: "invalid index" }, { status: 400 });
  }

  const dir = runDir(runId);
  const candidates = [
    path.join(dir, "audio", `${String(sceneIndex).padStart(2, "0")}.mp3`),
    path.join(dir, "audio", `${String(sceneIndex).padStart(3, "0")}.mp3`),
  ];

  let candidatePath: string | null = null;
  for (const c of candidates) {
    try {
      await fs.access(c);
      candidatePath = c;
      break;
    } catch {
      /* try next */
    }
  }

  if (!candidatePath) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const resolved = path.resolve(candidatePath);
  const expectedRoot = path.resolve(dir);
  if (!resolved.startsWith(expectedRoot + path.sep)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const data = await fs.readFile(resolved);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(data.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}
