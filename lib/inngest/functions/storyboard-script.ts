import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runStoryboard } from "@/lib/storyboard/generate";
import { inngest } from "../client";

interface ScriptCompletedData {
  runId: string;
  status: string;
}

export const storyboardScriptFunction = inngest.createFunction(
  {
    id: "storyboard-script",
    triggers: [{ event: "run/script.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as ScriptCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "scripted") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-storyboarding", async () => {
      await db
        .update(runs)
        .set({ status: "storyboarding", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let storyboardPath: string;
    let storyboardMdPath: string;
    try {
      const result = await step.run("run-generate", async () => {
        return await runStoryboard(runId);
      });
      storyboardPath = result.storyboardPath;
      storyboardMdPath = result.storyboardMdPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "storyboard_failed",
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
          storyboardPath,
          storyboardMdPath,
          status: "storyboarded",
          errorMessage: null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("storyboard-completed", {
      name: "run/storyboard.completed",
      data: { runId, status: "storyboarded", storyboardPath, storyboardMdPath },
    });

    return { runId, storyboardPath, storyboardMdPath };
  }
);
