import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runFactcheck } from "@/lib/research/factcheck";
import { inngest } from "../client";

interface SelectionCompletedData {
  runId: string;
  status: string;
}

export const factcheckTopicFunction = inngest.createFunction(
  {
    id: "factcheck-topic",
    triggers: [{ event: "run/selection.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as SelectionCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "selected") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-factchecking", async () => {
      await db
        .update(runs)
        .set({ status: "factchecking", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let factcheckPath: string;
    try {
      factcheckPath = await step.run("run-factcheck", async () => {
        return await runFactcheck(runId);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "factcheck_failed",
          errorMessage: message,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
      throw err;
    }

    await step.run("save-factcheck-path", async () => {
      await db
        .update(runs)
        .set({
          factcheckPath,
          status: "factchecked",
          errorMessage: null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("factcheck-completed", {
      name: "run/factcheck.completed",
      data: { runId, status: "factchecked", factcheckPath },
    });

    return { runId, factcheckPath };
  }
);
