import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runFinalizeMeta } from "@/lib/upload-meta/generate";
import { inngest } from "../client";

interface StoryboardCompletedData {
  runId: string;
  status: string;
}

export const finalizeMetaFunction = inngest.createFunction(
  {
    id: "finalize-meta",
    triggers: [{ event: "run/storyboard.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as StoryboardCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "storyboarded") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-finalizing", async () => {
      await db
        .update(runs)
        .set({ status: "finalizing", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let metaPath: string;
    let metaMdPath: string;
    try {
      const result = await step.run("run-finalize", async () => {
        return await runFinalizeMeta(runId);
      });
      metaPath = result.metaPath;
      metaMdPath = result.metaMdPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "finalize_failed",
          errorMessage: message,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
      throw err;
    }

    await step.run("save-paths", async () => {
      await db
        .update(runs)
        .set({
          metaPath,
          metaMdPath,
          status: "finalized",
          errorMessage: null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("finalize-completed", {
      name: "run/finalize.completed",
      data: { runId, status: "finalized", metaPath, metaMdPath },
    });

    return { runId, metaPath, metaMdPath };
  }
);
