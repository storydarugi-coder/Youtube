import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, refsTable, channels } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Params = Promise<{ runId: string }>;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  ingesting: "secondary",
  ingested: "default",
  analyzing: "secondary",
  analyzed: "default",
  analyze_failed: "destructive",
  done: "default",
  failed: "destructive",
};

export default async function RunPage({ params }: { params: Params }) {
  noStore();
  const { runId } = await params;

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) notFound();

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));

  const refs = await db
    .select()
    .from(refsTable)
    .where(eq(refsTable.runId, runId));

  const inProgress =
    run.status === "pending" ||
    run.status === "ingesting" ||
    run.status === "analyzing";

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-6">
      {inProgress && (
        <meta httpEquiv="refresh" content="5" />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">런 {runId.slice(0, 8)}</h1>
          <p className="text-sm text-neutral-400 mt-1">
            채널: {channel?.name ?? "(unknown)"} · 길이: {run.durationMin}분
          </p>
        </div>
        <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
          ← 홈
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>전체 상태</CardTitle>
            <Badge variant={STATUS_VARIANT[run.status] ?? "outline"}>
              {run.status}
            </Badge>
          </div>
          {run.errorMessage && (
            <CardDescription className="text-red-400 mt-2">
              {run.errorMessage}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="text-xs text-neutral-500 space-y-1">
          <div>생성: {new Date(run.createdAt * 1000).toLocaleString("ko-KR")}</div>
          <div>업데이트: {new Date(run.updatedAt * 1000).toLocaleString("ko-KR")}</div>
          {run.styleGuidePath && (
            <div className="text-neutral-400">
              스타일 가이드:{" "}
              <Link
                href={`/api/runs/${runId}/style-guide`}
                className="underline hover:text-emerald-400"
              >
                style_guide.json 다운로드
              </Link>
              <div className="text-neutral-600 break-all">{run.styleGuidePath}</div>
            </div>
          )}
          {inProgress && (
            <div className="text-emerald-400">⏳ 진행 중 — 5초마다 자동 새로고침</div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">레퍼런스 ({refs.length})</h2>
        {refs.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base truncate">
                  {r.title ?? r.url}
                </CardTitle>
                <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                  {r.status}
                </Badge>
              </div>
              <CardDescription className="text-xs break-all">
                {r.url}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-neutral-500 space-y-1">
              {r.errorMessage && (
                <div className="text-red-400">⚠ {r.errorMessage}</div>
              )}
              {r.videoId && <div>비디오 ID: {r.videoId}</div>}
              {r.channelName && <div>채널: {r.channelName}</div>}
              {r.viewCount !== null && r.viewCount !== undefined && (
                <div>조회수: {r.viewCount.toLocaleString()}</div>
              )}
              {r.durationSec !== null && r.durationSec !== undefined && (
                <div>길이: {Math.floor(r.durationSec / 60)}:{String(r.durationSec % 60).padStart(2, "0")}</div>
              )}
              {r.uploadedAt && <div>업로드: {r.uploadedAt}</div>}
              {r.thumbnailPath && <div className="text-neutral-600">썸네일: {r.thumbnailPath}</div>}
              {r.subtitlesPath && <div className="text-neutral-600">자막: {r.subtitlesPath}</div>}
              {r.commentsPath && <div className="text-neutral-600">댓글: {r.commentsPath}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
