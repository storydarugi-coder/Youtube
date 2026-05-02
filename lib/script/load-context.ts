import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs, channels } from "@/lib/db/schema";
import { StyleGuideSchema, type StyleGuide } from "@/lib/analyze/schema";
import {
  CandidatesSchema,
  SelectionsSchema,
} from "@/lib/candidates/schema";
import {
  FactcheckSchema,
  ResearchSchema,
} from "@/lib/research/schema";
import type { Selected } from "@/lib/research/prompts";

export interface ScriptContext {
  runId: string;
  channel: { name: string; concept: string; voiceTone: string };
  selected: Selected;
  customNote?: string;
  durationMin: number;
  styleGuide: StyleGuide;
  factcheck: {
    verifiedClaims: Array<{ claim: string; explanation: string }>;
    disputedClaims: Array<{ claim: string; explanation: string }>;
    redFlags: string[];
    assessment: string;
  };
  research: {
    anecdotes: Array<{ title: string; summary: string; relevance: string }>;
    quotes: Array<{ text: string; speaker?: string; context: string }>;
    modernConnections: Array<{ point: string; explanation: string }>;
    visualAssetIdeas: Array<{ description: string; purpose: string }>;
  };
  scriptGuideText: string;
}

const SCRIPT_GUIDE_PATH = path.join(
  process.cwd(),
  ".claude",
  "skills",
  "youtube-script-factory",
  "references",
  "script-guide.md"
);

export async function loadScriptContext(runId: string): Promise<ScriptContext> {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error(`run not found: ${runId}`);

  const required: Array<[string, string | null]> = [
    ["styleGuidePath", run.styleGuidePath],
    ["candidatesPath", run.candidatesPath],
    ["selectionsPath", run.selectionsPath],
    ["factcheckPath", run.factcheckPath],
    ["researchPath", run.researchPath],
  ];
  for (const [name, value] of required) {
    if (!value) {
      throw new Error(`${name}이 비어있습니다. 이전 단계가 끝나지 않은 상태로 보입니다.`);
    }
  }

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, run.channelId));
  if (!channel) throw new Error(`channel not found: ${run.channelId}`);

  const [styleGuide, candidates, selections, factcheck, research, scriptGuideText] =
    await Promise.all([
      fs
        .readFile(run.styleGuidePath!, "utf8")
        .then((raw) => StyleGuideSchema.parse(JSON.parse(raw))),
      fs
        .readFile(run.candidatesPath!, "utf8")
        .then((raw) => CandidatesSchema.parse(JSON.parse(raw))),
      fs
        .readFile(run.selectionsPath!, "utf8")
        .then((raw) => SelectionsSchema.parse(JSON.parse(raw))),
      fs
        .readFile(run.factcheckPath!, "utf8")
        .then((raw) => FactcheckSchema.parse(JSON.parse(raw))),
      fs
        .readFile(run.researchPath!, "utf8")
        .then((raw) => ResearchSchema.parse(JSON.parse(raw))),
      fs.readFile(SCRIPT_GUIDE_PATH, "utf8"),
    ]);

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
    runId,
    channel: {
      name: channel.name,
      concept: channel.concept,
      voiceTone: channel.voiceTone,
    },
    selected,
    customNote: selections.customNote,
    durationMin: run.durationMin,
    styleGuide,
    factcheck: {
      verifiedClaims: factcheck.claims
        .filter((c) => c.verdict === "verified")
        .map((c) => ({ claim: c.claim, explanation: c.explanation })),
      disputedClaims: factcheck.claims
        .filter((c) => c.verdict === "disputed")
        .map((c) => ({ claim: c.claim, explanation: c.explanation })),
      redFlags: factcheck.redFlags,
      assessment: factcheck.overallAssessment,
    },
    research: {
      anecdotes: research.anecdotes.map((a) => ({
        title: a.title,
        summary: a.summary,
        relevance: a.relevance,
      })),
      quotes: research.quotes.map((q) => ({
        text: q.text,
        speaker: q.speaker,
        context: q.context,
      })),
      modernConnections: research.modernConnections.map((m) => ({
        point: m.point,
        explanation: m.explanation,
      })),
      visualAssetIdeas: research.visualAssetIdeas.map((v) => ({
        description: v.description,
        purpose: v.purpose,
      })),
    },
    scriptGuideText,
  };
}
