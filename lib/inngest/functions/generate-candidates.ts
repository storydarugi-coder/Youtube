import path from "node:path";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runDir, ensureDir } from "@/lib/runs/paths";
import { generateCandidates } from "@/lib/candidates/generate";
import { SelectionsSchema } from "@/lib/candidates/schema";
import { inngest } from "../client";

interface AnalyzeCompletedData {
  runId: string;
  status: string;
}

const SELECTION_TIMEOUT = "7d";

export const generateCandidatesFunction = inngest.createFunction(
  {
    id: "generate-candidates",
    triggers: [{ event: "run/analyze.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as AnalyzeCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "analyzed") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-generating", async () => {
      await db
        .update(runs)
        .set({ status: "generating_candidates", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let candidatesPath: string;
    try {
      candidatesPath = await step.run("run-generation", async () => {
        return await generateCandidates(runId);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "generate_failed",
          errorMessage: message,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
      throw err;
    }

    await step.run("save-candidates-path", async () => {
      await db
        .update(runs)
        .set({
          candidatesPath,
          status: "awaiting_selection",
          errorMessage: null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    const selectionEvent = await step.waitForEvent("wait-for-selection", {
      event: "run/selection.submitted",
      timeout: SELECTION_TIMEOUT,
      if: `event.data.runId == "${runId}"`,
    });

    if (!selectionEvent) {
      await db
        .update(runs)
        .set({
          status: "selection_timeout",
          errorMessage: `사용자 선택 대기 타임아웃 (${SELECTION_TIMEOUT})`,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
      return { runId, timedOut: true };
    }

    const rawSelections = (selectionEvent.data as { selections?: unknown }).selections;
    const parsed = SelectionsSchema.safeParse(rawSelections);
    if (!parsed.success) {
      const message = `selection 이벤트 페이로드 검증 실패: ${parsed.error.message}`;
      await db
        .update(runs)
        .set({
          status: "generate_failed",
          errorMessage: message,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
      throw new Error(message);
    }

    const selections = parsed.data;

    const selectionsPath = await step.run("write-selections-file", async () => {
      const dir = runDir(runId);
      await ensureDir(dir);
      const out = path.join(dir, "selections.json");
      await fs.writeFile(out, JSON.stringify(selections, null, 2), "utf8");
      return out;
    });

    await step.run("update-db-selected", async () => {
      await db
        .update(runs)
        .set({
          selectionsPath,
          status: "selected",
          errorMessage: null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("selection-completed", {
      name: "run/selection.completed",
      data: { runId, status: "selected", selectionsPath, selections },
    });

    return { runId, candidatesPath, selectionsPath };
  }
);
