import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runResearch } from "@/lib/research/research";
import { inngest } from "../client";

interface FactcheckCompletedData {
  runId: string;
  status: string;
}

export const researchTopicFunction = inngest.createFunction(
  {
    id: "research-topic",
    triggers: [{ event: "run/factcheck.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as FactcheckCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "factchecked") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-researching", async () => {
      await db
        .update(runs)
        .set({ status: "researching", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let researchPath: string;
    try {
      researchPath = await step.run("run-research", async () => {
        return await runResearch(runId);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "research_failed",
          errorMessage: message,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
      throw err;
    }

    await step.run("save-research-path", async () => {
      await db
        .update(runs)
        .set({
          researchPath,
          status: "researched",
          errorMessage: null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("research-completed", {
      name: "run/research.completed",
      data: { runId, status: "researched", researchPath },
    });

    return { runId, researchPath };
  }
);
