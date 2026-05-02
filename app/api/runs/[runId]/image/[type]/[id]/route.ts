import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { runDir } from "@/lib/runs/paths";

type Params = Promise<{ runId: string; type: string; id: string }>;

const THUMBNAIL_STRATEGIES = ["emotion", "contrast", "mystery"] as const;

export async function GET(_req: Request, { params }: { params: Params }) {
  const { runId, type, id } = await params;

  // runId 형식 가드 (영숫자 + - + _ 만)
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(runId)) {
    return NextResponse.json({ error: "invalid runId" }, { status: 400 });
  }

  const dir = runDir(runId);
  let candidatePath: string | null = null;

  if (type === "scene") {
    if (!/^\d{1,4}$/.test(id)) {
      return NextResponse.json({ error: "invalid scene id" }, { status: 400 });
    }
    const sceneIndex = parseInt(id, 10);
    if (sceneIndex < 1 || sceneIndex > 9999) {
      return NextResponse.json({ error: "invalid scene id" }, { status: 400 });
    }
    // 2자리/3자리 zero-pad 둘 다 시도 (실제 파일명은 스토리보드 sceneCount 자릿수에 따름)
    const candidates = [
      path.join(dir, "scenes", `${String(sceneIndex).padStart(2, "0")}.png`),
      path.join(dir, "scenes", `${String(sceneIndex).padStart(3, "0")}.png`),
    ];
    for (const c of candidates) {
      try {
        await fs.access(c);
        candidatePath = c;
        break;
      } catch {
        /* try next */
      }
    }
  } else if (type === "thumbnail") {
    if (!THUMBNAIL_STRATEGIES.includes(id as (typeof THUMBNAIL_STRATEGIES)[number])) {
      return NextResponse.json(
        { error: "invalid thumbnail strategy" },
        { status: 400 }
      );
    }
    candidatePath = path.join(dir, "thumbnails", `${id}.png`);
  } else {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  if (!candidatePath) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // path traversal 정규화 검증
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
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "file missing" }, { status: 404 });
  }
}
