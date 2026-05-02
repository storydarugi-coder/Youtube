import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, channels } from "@/lib/db/schema";
import {
  CandidatesSchema,
  SelectionsSchema,
} from "@/lib/candidates/schema";
import type { Selected } from "@/lib/research/prompts";

export interface LoadedSelection {
  selected: Selected;
  channelConcept: string;
  channel: {
    name: string;
    visualStyle: string;
    voiceTone: string;
    concept: string;
  };
}

export async function loadSelectedFromRun(
  runId: string
): Promise<LoadedSelection> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);
  if (!run.candidatesPath || !run.selectionsPath) {
    throw new Error("candidates/selections 경로가 비어있습니다. M4 미완료.");
  }

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));
  if (!channel) throw new Error(`channel not found: ${run.channelId}`);

  const candidates = CandidatesSchema.parse(
    JSON.parse(await fs.readFile(run.candidatesPath, "utf8"))
  );
  const selections = SelectionsSchema.parse(
    JSON.parse(await fs.readFile(run.selectionsPath, "utf8"))
  );

  const topic = candidates.topics.find((t) => t.index === selections.topicIndex);
  const audience = candidates.audiences.find(
    (a) => a.index === selections.audienceIndex
  );
  const title = candidates.titles.find((t) => t.index === selections.titleIndex);
  if (!topic || !audience || !title) {
    throw new Error("선택된 인덱스의 후보를 candidates에서 찾을 수 없습니다.");
  }

  const selected: Selected = {
    topic: {
      title: topic.title,
      description: topic.description,
      rationale: topic.rationale,
    },
    audience: {
      label: audience.label,
      ageRange: audience.ageRange,
      interests: audience.interests,
      motivation: audience.motivation,
    },
    title: {
      text: title.text,
      formula: title.formula,
      rationale: title.rationale,
    },
  };

  return {
    selected,
    channelConcept: channel.concept,
    channel: {
      name: channel.name,
      visualStyle: channel.visualStyle,
      voiceTone: channel.voiceTone,
      concept: channel.concept,
    },
  };
}
