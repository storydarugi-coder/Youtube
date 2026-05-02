"use server";

import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";
import {
  CandidatesSchema,
  SelectionsSchema,
  type Selections,
} from "@/lib/candidates/schema";

const idx = (n: number): 1 | 2 | 3 => {
  if (n !== 1 && n !== 2 && n !== 3) {
    throw new Error(`인덱스는 1, 2, 3 중 하나여야 합니다 (받음: ${n})`);
  }
  return n;
};

export async function submitSelection(runId: string, formData: FormData) {
  const topicIndex = idx(Number(formData.get("topicIndex")));
  const audienceIndex = idx(Number(formData.get("audienceIndex")));
  const titleIndex = idx(Number(formData.get("titleIndex")));
  const customNoteRaw = String(formData.get("customNote") ?? "").trim();
  const customNote = customNoteRaw.length > 0 ? customNoteRaw : undefined;

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error("존재하지 않는 run입니다.");
  if (run.status !== "awaiting_selection") {
    throw new Error(`현재 상태(${run.status})에서는 선택을 제출할 수 없습니다.`);
  }
  if (!run.candidatesPath) {
    throw new Error("candidates.json 경로가 비어있습니다.");
  }

  const candidatesRaw = await fs.readFile(run.candidatesPath, "utf8");
  const candidates = CandidatesSchema.parse(JSON.parse(candidatesRaw));

  const find = <T extends { index: number }>(arr: T[], i: number) =>
    arr.find((x) => x.index === i);
  if (!find(candidates.topics, topicIndex))
    throw new Error(`주제 후보 ${topicIndex}번이 없습니다.`);
  if (!find(candidates.audiences, audienceIndex))
    throw new Error(`타겟 후보 ${audienceIndex}번이 없습니다.`);
  if (!find(candidates.titles, titleIndex))
    throw new Error(`제목 후보 ${titleIndex}번이 없습니다.`);

  const selections: Selections = SelectionsSchema.parse({
    topicIndex,
    audienceIndex,
    titleIndex,
    customNote,
    submittedAt: new Date().toISOString(),
  });

  await inngest.send({
    name: "run/selection.submitted",
    data: { runId, selections },
  });

  revalidatePath(`/runs/${runId}`);
}
