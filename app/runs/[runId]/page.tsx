import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import fs from "node:fs/promises";
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
import {
  CandidatesSchema,
  SelectionsSchema,
  type Candidates,
  type Selections,
} from "@/lib/candidates/schema";
import {
  FactcheckSchema,
  ResearchSchema,
  type Factcheck,
  type Research,
} from "@/lib/research/schema";
import { ScriptOutputSchema, type ScriptOutput } from "@/lib/script/schema";
import {
  StoryboardSchema,
  type Storyboard,
} from "@/lib/storyboard/schema";
import {
  UploadMetaSchemaWithThumbnailRefine,
  type UploadMeta,
} from "@/lib/upload-meta/schema";
import {
  ImagesJsonSchema,
  type ImagesJson,
} from "@/lib/images/schema";
import { AudioJsonSchema, type AudioJson } from "@/lib/audio/schema";
import { VideoJsonSchema, type VideoJson } from "@/lib/video/schema";
import { runDir } from "@/lib/runs/paths";
import path from "node:path";
import { SelectionForm } from "./_components/selection-form";

type Params = Promise<{ runId: string }>;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  ingesting: "secondary",
  ingested: "default",
  analyzing: "secondary",
  analyzed: "default",
  analyze_failed: "destructive",
  generating_candidates: "secondary",
  awaiting_selection: "secondary",
  selected: "default",
  selection_timeout: "destructive",
  generate_failed: "destructive",
  factchecking: "secondary",
  factchecked: "default",
  factcheck_failed: "destructive",
  researching: "secondary",
  researched: "default",
  research_failed: "destructive",
  writing: "secondary",
  scripted: "default",
  write_failed: "destructive",
  storyboarding: "secondary",
  storyboarded: "default",
  storyboard_failed: "destructive",
  finalizing: "secondary",
  finalized: "default",
  finalize_failed: "destructive",
  generating_images: "secondary",
  images_generated: "default",
  images_failed: "destructive",
  tts_generating: "secondary",
  audio_generated: "default",
  audio_failed: "destructive",
  rendering: "secondary",
  video_rendered: "default",
  render_failed: "destructive",
  done: "default",
  failed: "destructive",
};

const CONFIDENCE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  high: "default",
  medium: "secondary",
  low: "outline",
};

const VERDICT_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  verified: "default",
  disputed: "secondary",
  false: "destructive",
  unknown: "outline",
};

const FORMULA_LABEL: Record<string, string> = {
  shock: "충격·반전",
  question: "의문·미스터리",
  contrast: "대비·비교",
  list: "숫자 나열",
  storytelling: "서사·감정",
};

async function readJsonSafe<T>(
  path: string | null,
  parse: (raw: unknown) => T
): Promise<T | null> {
  if (!path) return null;
  try {
    const raw = await fs.readFile(path, "utf8");
    return parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

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
    run.status === "analyzing" ||
    run.status === "generating_candidates" ||
    run.status === "factchecking" ||
    run.status === "researching" ||
    run.status === "writing" ||
    run.status === "storyboarding" ||
    run.status === "finalizing" ||
    run.status === "generating_images" ||
    run.status === "tts_generating" ||
    run.status === "rendering";

  const candidates: Candidates | null = run.candidatesPath
    ? await readJsonSafe(run.candidatesPath, (raw) =>
        CandidatesSchema.parse(raw)
      )
    : null;

  const selections: Selections | null = run.selectionsPath
    ? await readJsonSafe(run.selectionsPath, (raw) =>
        SelectionsSchema.parse(raw)
      )
    : null;

  const factcheck: Factcheck | null = run.factcheckPath
    ? await readJsonSafe(run.factcheckPath, (raw) =>
        FactcheckSchema.parse(raw)
      )
    : null;

  const research: Research | null = run.researchPath
    ? await readJsonSafe(run.researchPath, (raw) => ResearchSchema.parse(raw))
    : null;

  const script: ScriptOutput | null = run.scriptPath
    ? await readJsonSafe(run.scriptPath, (raw) => ScriptOutputSchema.parse(raw))
    : null;

  const storyboard: Storyboard | null = run.storyboardPath
    ? await readJsonSafe(run.storyboardPath, (raw) =>
        StoryboardSchema.parse(raw)
      )
    : null;

  const uploadMeta: UploadMeta | null = run.metaPath
    ? await readJsonSafe(run.metaPath, (raw) =>
        UploadMetaSchemaWithThumbnailRefine.parse(raw)
      )
    : null;

  const imagesJson: ImagesJson | null = run.imagesPath
    ? await readJsonSafe(run.imagesPath, (raw) => ImagesJsonSchema.parse(raw))
    : null;

  const audioJson: AudioJson | null = run.audioPath
    ? await readJsonSafe(run.audioPath, (raw) => AudioJsonSchema.parse(raw))
    : null;

  const videoJson: VideoJson | null = run.videoMdPath
    ? await readJsonSafe(path.join(runDir(runId), "video.json"), (raw) =>
        VideoJsonSchema.parse(raw)
      )
    : null;

  return (
    <main className="mx-auto max-w-4xl p-8 space-y-6">
      {inProgress && <meta httpEquiv="refresh" content="5" />}

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
                style_guide.json
              </Link>
            </div>
          )}
          {run.candidatesPath && (
            <div className="text-neutral-400">
              후보:{" "}
              <Link
                href={`/api/runs/${runId}/candidates`}
                className="underline hover:text-emerald-400"
              >
                candidates.json
              </Link>
            </div>
          )}
          {run.selectionsPath && (
            <div className="text-neutral-400">
              선택:{" "}
              <Link
                href={`/api/runs/${runId}/selections`}
                className="underline hover:text-emerald-400"
              >
                selections.json
              </Link>
            </div>
          )}
          {run.factcheckPath && (
            <div className="text-neutral-400">
              팩트체크:{" "}
              <Link
                href={`/api/runs/${runId}/factcheck`}
                className="underline hover:text-emerald-400"
              >
                factcheck.json
              </Link>
            </div>
          )}
          {run.researchPath && (
            <div className="text-neutral-400">
              추가 정보:{" "}
              <Link
                href={`/api/runs/${runId}/research`}
                className="underline hover:text-emerald-400"
              >
                research.json
              </Link>
            </div>
          )}
          {run.scriptMdPath && (
            <div className="text-neutral-400">
              대본:{" "}
              <Link
                href={`/api/runs/${runId}/script`}
                className="underline hover:text-emerald-400"
              >
                script.md
              </Link>
              {" · "}
              <Link
                href={`/api/runs/${runId}/script-json`}
                className="underline hover:text-emerald-400"
              >
                script.json
              </Link>
            </div>
          )}
          {run.storyboardMdPath && (
            <div className="text-neutral-400">
              스토리보드:{" "}
              <Link
                href={`/api/runs/${runId}/storyboard`}
                className="underline hover:text-emerald-400"
              >
                storyboard.md
              </Link>
              {" · "}
              <Link
                href={`/api/runs/${runId}/storyboard-json`}
                className="underline hover:text-emerald-400"
              >
                storyboard.json
              </Link>
            </div>
          )}
          {run.metaMdPath && (
            <div className="text-neutral-400">
              업로드 메타:{" "}
              <Link
                href={`/api/runs/${runId}/meta`}
                className="underline hover:text-emerald-400"
              >
                meta.md
              </Link>
              {" · "}
              <Link
                href={`/api/runs/${runId}/meta-json`}
                className="underline hover:text-emerald-400"
              >
                meta.json
              </Link>
            </div>
          )}
          {run.imagesMdPath && (
            <div className="text-neutral-400">
              이미지:{" "}
              <Link
                href={`/api/runs/${runId}/images-md`}
                className="underline hover:text-emerald-400"
              >
                images.md
              </Link>
              {" · "}
              <Link
                href={`/api/runs/${runId}/images-json`}
                className="underline hover:text-emerald-400"
              >
                images.json
              </Link>
              {run.totalImageCostUsd !== null &&
                run.totalImageCostUsd !== undefined && (
                  <span className="ml-2 text-emerald-400">
                    실제 ${run.totalImageCostUsd.toFixed(2)}
                  </span>
                )}
            </div>
          )}
          {run.audioMdPath && (
            <div className="text-neutral-400">
              음성:{" "}
              <Link
                href={`/api/runs/${runId}/audio-md`}
                className="underline hover:text-emerald-400"
              >
                audio.md
              </Link>
              {" · "}
              <Link
                href={`/api/runs/${runId}/audio-json`}
                className="underline hover:text-emerald-400"
              >
                audio.json
              </Link>
              {run.totalAudioCostUsd !== null &&
                run.totalAudioCostUsd !== undefined && (
                  <span className="ml-2 text-emerald-400">
                    실제 ${run.totalAudioCostUsd.toFixed(2)}
                  </span>
                )}
            </div>
          )}
          {run.videoPath && (
            <div className="text-neutral-400">
              영상:{" "}
              <Link
                href={`/api/runs/${runId}/video`}
                className="underline hover:text-emerald-400"
              >
                final.mp4
              </Link>
              {" · "}
              <Link
                href={`/api/runs/${runId}/srt`}
                className="underline hover:text-emerald-400"
              >
                final.srt
              </Link>
              {" · "}
              <Link
                href={`/api/runs/${runId}/video-md`}
                className="underline hover:text-emerald-400"
              >
                video.md
              </Link>
              {" · "}
              <Link
                href={`/api/runs/${runId}/video-json`}
                className="underline hover:text-emerald-400"
              >
                video.json
              </Link>
            </div>
          )}
          {inProgress && (
            <div className="text-emerald-400">⏳ 진행 중 — 5초마다 자동 새로고침</div>
          )}
        </CardContent>
      </Card>

      {run.status === "awaiting_selection" && candidates && (
        <>
          <Separator />
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold">1.5단계 — 선택해주세요</h2>
              <p className="text-sm text-neutral-400 mt-1">
                Claude Sonnet 4.6이 채널·스타일 가이드 기반으로 주제·타겟·제목 후보를 각 3개씩 제안했습니다.
                각 카테고리에서 1개씩 골라야 다음 단계(팩트체크)로 넘어갑니다.
              </p>
            </div>
            <SelectionForm runId={runId} candidates={candidates} />
          </section>
        </>
      )}

      {selections && candidates && run.status !== "awaiting_selection" && (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">선택 결과</h2>
            <Card>
              <CardContent className="space-y-3 pt-6 text-sm">
                {(() => {
                  const t = candidates.topics.find(
                    (x) => x.index === selections.topicIndex
                  );
                  return t ? (
                    <div>
                      <div className="text-xs text-neutral-500">주제 #{t.index}</div>
                      <div className="font-medium">{t.title}</div>
                      <div className="text-neutral-400 text-xs mt-1">{t.description}</div>
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const a = candidates.audiences.find(
                    (x) => x.index === selections.audienceIndex
                  );
                  return a ? (
                    <div>
                      <div className="text-xs text-neutral-500">타겟 #{a.index}</div>
                      <div className="font-medium">
                        {a.label} <span className="text-neutral-500">· {a.ageRange}</span>
                      </div>
                      <div className="text-neutral-400 text-xs mt-1">{a.motivation}</div>
                    </div>
                  ) : null;
                })()}
                {(() => {
                  const t = candidates.titles.find(
                    (x) => x.index === selections.titleIndex
                  );
                  return t ? (
                    <div>
                      <div className="text-xs text-neutral-500">
                        제목 #{t.index} ·{" "}
                        <Badge variant="secondary" className="ml-1">
                          {FORMULA_LABEL[t.formula] ?? t.formula}
                        </Badge>
                      </div>
                      <div className="font-medium text-base">{t.text}</div>
                    </div>
                  ) : null;
                })()}
                {selections.customNote && (
                  <div className="border-t border-neutral-800 pt-3">
                    <div className="text-xs text-neutral-500">메모</div>
                    <div className="text-neutral-300">{selections.customNote}</div>
                  </div>
                )}
                <div className="text-xs text-neutral-600 pt-2">
                  제출: {new Date(selections.submittedAt).toLocaleString("ko-KR")}
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {factcheck && (
        <>
          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">팩트체크</h2>
              <span className="text-xs text-neutral-500">
                claims {factcheck.claims.length} · web_search{" "}
                {factcheck.meta.webSearchCount}회 · {factcheck.meta.model}
              </span>
            </div>
            <Card>
              <CardContent className="space-y-3 pt-6 text-sm">
                <div className="text-neutral-300">{factcheck.overallAssessment}</div>
                <div className="space-y-2">
                  {factcheck.claims.map((c, i) => (
                    <div
                      key={i}
                      className="border border-neutral-800 rounded p-3 space-y-1"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={VERDICT_VARIANT[c.verdict] ?? "outline"}
                        >
                          {c.verdict}
                        </Badge>
                        <Badge variant="outline">{c.confidence}</Badge>
                        <span className="font-medium">{c.claim}</span>
                      </div>
                      <div className="text-xs text-neutral-400">
                        {c.explanation}
                      </div>
                      <div className="text-xs text-neutral-600">
                        출처 {c.sources.length}개 ·{" "}
                        {c.sources.slice(0, 2).map((s, k) => (
                          <a
                            key={k}
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-emerald-400 mr-2"
                          >
                            {s.title.slice(0, 40)}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {factcheck.redFlags.length > 0 && (
                  <div className="border-t border-neutral-800 pt-3">
                    <div className="text-xs text-red-400 font-medium mb-1">
                      ⚠ redFlags (다루지 말 것)
                    </div>
                    <ul className="text-xs text-red-300 space-y-0.5 list-disc list-inside">
                      {factcheck.redFlags.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {research && (
        <>
          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">추가 정보</h2>
              <span className="text-xs text-neutral-500">
                일화 {research.anecdotes.length} · 인용 {research.quotes.length} ·
                현대연결 {research.modernConnections.length} · 시각자료{" "}
                {research.visualAssetIdeas.length} · web_search{" "}
                {research.meta.webSearchCount}회
              </span>
            </div>
            <Card>
              <CardContent className="pt-6 text-sm space-y-4">
                {research.anecdotes.length > 0 && (
                  <div>
                    <div className="text-xs text-neutral-500 mb-2">일화</div>
                    <div className="space-y-2">
                      {research.anecdotes.map((a, i) => (
                        <div
                          key={i}
                          className="border border-neutral-800 rounded p-3"
                        >
                          <div className="font-medium">{a.title}</div>
                          <div className="text-xs text-neutral-400 mt-1">
                            {a.summary}
                          </div>
                          <div className="text-xs text-neutral-600 mt-1">
                            왜? — {a.relevance}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {research.quotes.length > 0 && (
                  <div>
                    <div className="text-xs text-neutral-500 mb-2">인용</div>
                    <div className="space-y-2">
                      {research.quotes.map((q, i) => (
                        <blockquote
                          key={i}
                          className="border-l-2 border-emerald-700 pl-3 text-neutral-300"
                        >
                          “{q.text}”
                          {q.speaker && (
                            <div className="text-xs text-neutral-500 mt-0.5">
                              — {q.speaker}
                            </div>
                          )}
                          <div className="text-xs text-neutral-600 mt-0.5">
                            {q.context}
                          </div>
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}
                {research.modernConnections.length > 0 && (
                  <div>
                    <div className="text-xs text-neutral-500 mb-2">
                      현대 연결고리
                    </div>
                    <ul className="text-sm space-y-1 list-disc list-inside text-neutral-300">
                      {research.modernConnections.map((m, i) => (
                        <li key={i}>
                          <span className="font-medium">{m.point}</span>{" "}
                          <span className="text-neutral-500">— {m.explanation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {research.visualAssetIdeas.length > 0 && (
                  <div>
                    <div className="text-xs text-neutral-500 mb-2">
                      시각자료 아이디어
                    </div>
                    <ul className="text-xs text-neutral-400 space-y-1 list-disc list-inside">
                      {research.visualAssetIdeas.map((v, i) => (
                        <li key={i}>
                          {v.description}{" "}
                          <span className="text-neutral-600">({v.purpose})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {research.additionalNotes && (
                  <div className="border-t border-neutral-800 pt-3 text-xs text-neutral-400">
                    {research.additionalNotes}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {script && (
        <>
          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold">대본</h2>
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Badge
                  variant={
                    CONFIDENCE_VARIANT[script.selfReview.confidenceLevel] ?? "outline"
                  }
                >
                  confidence: {script.selfReview.confidenceLevel}
                </Badge>
                <span>
                  {script.meta.actualCharCount}/{script.meta.targetCharCount}자
                  ({script.meta.sectionCount}개 섹션, retries{" "}
                  {script.meta.retries})
                </span>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6 text-sm space-y-3">
                <div className="space-y-2">
                  {script.sections.map((s, i) => (
                    <div
                      key={i}
                      className="border border-neutral-800 rounded p-3"
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge variant="outline">{i + 1}</Badge>
                        <Badge variant="secondary">{s.role}</Badge>
                        <span className="font-medium">{s.title}</span>
                        <span className="text-xs text-neutral-500">
                          ~{s.estimatedSeconds}s · {s.text.length}자
                        </span>
                      </div>
                      <div className="text-neutral-300 whitespace-pre-line text-xs">
                        {s.text}
                      </div>
                      {s.transitionToNext && (
                        <div className="text-xs text-emerald-500 mt-2">
                          → {s.transitionToNext}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <details className="border-t border-neutral-800 pt-3">
                  <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">
                    자체 검토 노트 펼치기
                  </summary>
                  <div className="mt-2 space-y-3 text-xs">
                    {script.selfReview.issuesFound.length > 0 && (
                      <div>
                        <div className="text-neutral-500 mb-1">발견한 문제</div>
                        <ul className="list-disc list-inside text-neutral-400 space-y-0.5">
                          {script.selfReview.issuesFound.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {script.selfReview.revisionsApplied.length > 0 && (
                      <div>
                        <div className="text-neutral-500 mb-1">적용한 수정</div>
                        <ul className="list-disc list-inside text-neutral-400 space-y-0.5">
                          {script.selfReview.revisionsApplied.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {script.selfReview.factualClaimsUsed.length > 0 && (
                      <div>
                        <div className="text-neutral-500 mb-1">
                          사용한 verified 클레임
                        </div>
                        <ul className="list-disc list-inside text-neutral-400 space-y-0.5">
                          {script.selfReview.factualClaimsUsed.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {script.selfReview.redFlagsAvoided.length > 0 && (
                      <div>
                        <div className="text-neutral-500 mb-1">
                          회피한 redFlags
                        </div>
                        <ul className="list-disc list-inside text-neutral-400 space-y-0.5">
                          {script.selfReview.redFlagsAvoided.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {storyboard && (
        <>
          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold">스토리보드</h2>
              <span className="text-xs text-neutral-500">
                씬 {storyboard.meta.sceneCount}개 ·{" "}
                {storyboard.totalDurationSec}/{storyboard.meta.targetTotalSec}초 ·
                평균 {storyboard.meta.avgSceneSec.toFixed(1)}초/씬 · retries{" "}
                {storyboard.meta.retries}
              </span>
            </div>
            <Card>
              <CardContent className="pt-6 text-sm space-y-3">
                <div className="text-xs text-neutral-500">
                  Visual Style Prefix:{" "}
                  <code className="text-neutral-300 bg-neutral-900 px-1 rounded">
                    {storyboard.visualStylePrefix}
                  </code>
                </div>
                <div className="space-y-2">
                  {storyboard.scenes.slice(0, 5).map((s) => (
                    <div
                      key={s.index}
                      className="border border-neutral-800 rounded p-3"
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline">#{s.index}</Badge>
                        <Badge variant="secondary">{s.sectionRole}</Badge>
                        <span className="text-xs text-neutral-500">
                          §{s.sectionIndex} · {s.durationSec}s
                        </span>
                      </div>
                      <div className="text-neutral-300 text-xs">{s.caption}</div>
                      <div className="text-xs text-neutral-500 mt-1 line-clamp-2">
                        {s.imagePrompt}
                      </div>
                    </div>
                  ))}
                  {storyboard.scenes.length > 5 && (
                    <div className="text-xs text-neutral-500 text-center py-2">
                      … {storyboard.scenes.length - 5}개 더 — 전체는{" "}
                      <Link
                        href={`/api/runs/${runId}/storyboard`}
                        className="underline hover:text-emerald-400"
                      >
                        storyboard.md
                      </Link>{" "}
                      참고
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {uploadMeta && (
        <>
          <Separator />
          <section className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold">업로드 메타</h2>
              <span className="text-xs text-neutral-500">
                titleSource: {uploadMeta.meta.titleSource} · 설명{" "}
                {uploadMeta.meta.descriptionCharCount}자 · 태그{" "}
                {uploadMeta.tags.length} · retries {uploadMeta.meta.retries}
              </span>
            </div>
            <Card>
              <CardContent className="pt-6 text-sm space-y-4">
                <div>
                  <div className="text-xs text-neutral-500 mb-1">
                    제목 ({Array.from(uploadMeta.title).length}자)
                  </div>
                  <div className="text-lg font-semibold text-neutral-100">
                    {uploadMeta.title}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 mb-1">
                    카테고리: <span className="text-neutral-300">{uploadMeta.category}</span>
                  </div>
                  <div className="text-xs text-neutral-500 mb-1">태그</div>
                  <div className="flex flex-wrap gap-1">
                    {uploadMeta.tags.map((t, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <details className="border-t border-neutral-800 pt-3">
                  <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">
                    설명 + 타임스탬프 펼치기 ({uploadMeta.description.timestamps.length}개)
                  </summary>
                  <div className="mt-2 space-y-2 text-xs">
                    <div className="text-neutral-300 whitespace-pre-line">
                      {uploadMeta.description.intro}
                    </div>
                    <div className="border-t border-neutral-800 pt-2">
                      <div className="text-neutral-500 mb-1">📌 타임스탬프</div>
                      <ul className="space-y-0.5">
                        {uploadMeta.description.timestamps.map((ts, i) => (
                          <li key={i} className="text-neutral-400">
                            <code className="text-emerald-400">{ts.time}</code>{" "}
                            {ts.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="text-neutral-300 whitespace-pre-line border-t border-neutral-800 pt-2">
                      {uploadMeta.description.summary}
                    </div>
                    <div className="text-neutral-500">
                      {uploadMeta.description.hashtags.join(" ")}
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h3 className="text-base font-semibold">썸네일 프롬프트 3종</h3>
              {(["emotion", "contrast", "mystery"] as const).map((strategy) => {
                const t = uploadMeta.thumbnails.find(
                  (x) => x.strategy === strategy
                );
                if (!t) return null;
                return (
                  <Card key={strategy}>
                    <CardContent className="pt-6 text-sm space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{t.strategy}</Badge>
                        <span className="font-medium">
                          텍스트: 「{t.textOverlay}」
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400">
                        왜? — {t.rationale}
                      </div>
                      <details>
                        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">
                          영문 프롬프트 펼치기 ({t.imagePrompt.length}자)
                        </summary>
                        <pre className="mt-2 text-xs text-neutral-300 bg-neutral-900 p-3 rounded whitespace-pre-wrap">
                          {t.imagePrompt}
                        </pre>
                      </details>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}

      {imagesJson && (
        <>
          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold">이미지</h2>
              <div className="text-right">
                <div className="text-2xl font-bold text-emerald-400">
                  ${imagesJson.meta.totalCostUsd.toFixed(2)}
                </div>
                <div className="text-xs text-neutral-500">실제 비용</div>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6 text-sm space-y-4">
                <div className="text-xs text-neutral-500">
                  씬 {imagesJson.meta.succeeded -
                    imagesJson.thumbnails.filter((t) => t.status === "done")
                      .length}
                  /{imagesJson.meta.totalScenes} 성공 · 썸네일{" "}
                  {imagesJson.thumbnails.filter((t) => t.status === "done").length}/3
                  {imagesJson.meta.skippedExisting > 0 && (
                    <span> · 재개 스킵 {imagesJson.meta.skippedExisting}</span>
                  )}
                  {imagesJson.meta.failed > 0 && (
                    <span className="text-red-400">
                      {" "}
                      · 실패 {imagesJson.meta.failed}
                    </span>
                  )}{" "}
                  · {imagesJson.meta.model}
                </div>

                <div>
                  <div className="text-xs text-neutral-500 mb-2">썸네일 3종</div>
                  <div className="grid grid-cols-3 gap-2">
                    {imagesJson.thumbnails.map((t) => (
                      <div
                        key={t.thumbnailStrategy ?? "?"}
                        className="space-y-1"
                      >
                        {t.status === "done" && t.thumbnailStrategy ? (
                          <img
                            src={`/api/runs/${runId}/image/thumbnail/${t.thumbnailStrategy}`}
                            alt={t.thumbnailStrategy}
                            className="w-full aspect-video object-cover rounded border border-neutral-800"
                          />
                        ) : (
                          <div className="w-full aspect-video flex items-center justify-center bg-neutral-900 rounded border border-neutral-800 text-xs text-neutral-500">
                            {t.status === "failed" ? "❌ 실패" : "—"}
                          </div>
                        )}
                        <div className="text-xs text-center text-neutral-400">
                          {t.thumbnailStrategy}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {imagesJson.scenes.length > 0 && (
                  <div>
                    <div className="text-xs text-neutral-500 mb-2">
                      씬 갤러리 (상위 12장)
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {imagesJson.scenes
                        .filter((s) => s.status === "done")
                        .slice(0, 12)
                        .map((s) => (
                          <div key={s.sceneIndex ?? "?"} className="space-y-1">
                            <img
                              src={`/api/runs/${runId}/image/scene/${s.sceneIndex}`}
                              alt={`scene ${s.sceneIndex}`}
                              loading="lazy"
                              className="w-full aspect-video object-cover rounded border border-neutral-800"
                            />
                            <div className="text-xs text-neutral-500">
                              #{s.sceneIndex}
                            </div>
                          </div>
                        ))}
                    </div>
                    {imagesJson.scenes.filter((s) => s.status === "done").length >
                      12 && (
                      <div className="text-xs text-neutral-500 text-center mt-2">
                        … 전체는{" "}
                        <Link
                          href={`/api/runs/${runId}/images-md`}
                          className="underline hover:text-emerald-400"
                        >
                          images.md
                        </Link>
                      </div>
                    )}
                  </div>
                )}

                {imagesJson.meta.failed > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs text-red-400 hover:text-red-300">
                      실패 {imagesJson.meta.failed}개 펼치기
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {[
                        ...imagesJson.scenes,
                        ...imagesJson.thumbnails,
                      ]
                        .filter((r) => r.status === "failed")
                        .map((r, i) => (
                          <li key={i} className="text-red-300">
                            {r.type === "scene"
                              ? `씬 ${r.sceneIndex}`
                              : `썸네일 ${r.thumbnailStrategy}`}
                            : {r.errorMessage}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {audioJson && (
        <>
          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold">음성</h2>
              <div className="text-right">
                <div className="text-2xl font-bold text-emerald-400">
                  ${audioJson.meta.totalCostUsd.toFixed(2)}
                </div>
                <div className="text-xs text-neutral-500">
                  총 길이{" "}
                  {Math.floor(audioJson.meta.totalDurationMs / 60000)}:
                  {String(
                    Math.round(
                      (audioJson.meta.totalDurationMs % 60000) / 1000
                    )
                  ).padStart(2, "0")}
                </div>
              </div>
            </div>
            <Card>
              <CardContent className="pt-6 text-sm space-y-3">
                <div className="text-xs text-neutral-500">
                  씬 {audioJson.meta.succeeded}/{audioJson.meta.totalScenes}{" "}
                  성공
                  {audioJson.meta.skippedExisting > 0 && (
                    <span> · 재개 스킵 {audioJson.meta.skippedExisting}</span>
                  )}
                  {audioJson.meta.failed > 0 && (
                    <span className="text-red-400">
                      {" "}
                      · 실패 {audioJson.meta.failed}
                    </span>
                  )}
                  {" "}· {audioJson.meta.totalCharCount}자 ·{" "}
                  <code>{audioJson.meta.voiceId}</code>
                </div>

                <div>
                  <div className="text-xs text-neutral-500 mb-2">
                    미리듣기 (첫 3개 씬)
                  </div>
                  <div className="space-y-2">
                    {audioJson.scenes
                      .filter((s) => s.status === "done")
                      .slice(0, 3)
                      .map((s) => (
                        <div
                          key={s.sceneIndex}
                          className="flex items-center gap-3 border border-neutral-800 rounded p-2"
                        >
                          <Badge variant="outline">#{s.sceneIndex}</Badge>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-neutral-300 truncate">
                              {s.text}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {s.durationMs !== null
                                ? `${(s.durationMs / 1000).toFixed(1)}s`
                                : "—"}{" "}
                              · {s.charCount}자
                            </div>
                          </div>
                          <audio
                            controls
                            preload="none"
                            src={`/api/runs/${runId}/audio/${s.sceneIndex}`}
                            className="h-8 max-w-[200px]"
                          />
                        </div>
                      ))}
                  </div>
                </div>

                {audioJson.meta.failed > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs text-red-400 hover:text-red-300">
                      실패 {audioJson.meta.failed}개 펼치기
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {audioJson.scenes
                        .filter((s) => s.status === "failed")
                        .map((s) => (
                          <li key={s.sceneIndex} className="text-red-300">
                            씬 {s.sceneIndex}: {s.errorMessage}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      {videoJson && run.videoPath && (
        <>
          <Separator />
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold">최종 영상</h2>
              <span className="text-xs text-neutral-500">
                {videoJson.meta.width}x{videoJson.meta.height} ·{" "}
                {videoJson.meta.fps}fps · {videoJson.meta.videoCodec} (crf{" "}
                {videoJson.meta.crf}) · ffmpeg {videoJson.meta.ffmpegVersion}
              </span>
            </div>
            <Card>
              <CardContent className="pt-6 text-sm space-y-3">
                <video
                  controls
                  preload="metadata"
                  src={`/api/runs/${runId}/video`}
                  className="w-full rounded border border-neutral-800 bg-black"
                />
                <div className="text-xs text-neutral-500">
                  씬 {videoJson.meta.succeeded}/{videoJson.meta.totalScenes} 성공
                  {videoJson.meta.placeholders > 0 && (
                    <span className="text-neutral-400">
                      {" "}· placeholder {videoJson.meta.placeholders}
                    </span>
                  )}
                  {videoJson.meta.skippedExisting > 0 && (
                    <span> · 재개 스킵 {videoJson.meta.skippedExisting}</span>
                  )}
                  {videoJson.meta.failed > 0 && (
                    <span className="text-red-400">
                      {" "}· 실패 {videoJson.meta.failed}
                    </span>
                  )}{" "}
                  · 총 길이 {Math.floor(videoJson.meta.totalDurationMs / 60000)}:
                  {String(
                    Math.round(
                      (videoJson.meta.totalDurationMs % 60000) / 1000
                    )
                  ).padStart(2, "0")}
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}

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
