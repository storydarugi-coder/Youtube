import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { analyzeReferences } from "@/lib/analyze/style-guide";
import { inngest } from "../client";

interface IngestCompletedData {
  runId: string;
  status: string;
}

export const analyzeReferencesFunction = inngest.createFunction(
  {
    id: "analyze-references",
    triggers: [{ event: "run/ingest.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as IngestCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "ingested") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-analyzing", async () => {
      await db
        .update(runs)
        .set({ status: "analyzing", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let styleGuidePath: string;
    try {
      styleGuidePath = await step.run("run-analysis", async () => {
        return await analyzeReferences(runId);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "analyze_failed",
          errorMessage: message,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
      throw err;
    }

    await step.run("save-style-guide-path", async () => {
      await db
        .update(runs)
        .set({
          styleGuidePath,
          status: "analyzed",
          errorMessage: null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("analyze-completed", {
      name: "run/analyze.completed",
      data: { runId, status: "analyzed", styleGuidePath },
    });

    return { runId, styleGuidePath };
  }
);
