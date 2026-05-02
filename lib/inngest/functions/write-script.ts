import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { runs } from "@/lib/db/schema";
import { runWriteScript } from "@/lib/script/write-script";
import { inngest } from "../client";

interface ResearchCompletedData {
  runId: string;
  status: string;
}

export const writeScriptFunction = inngest.createFunction(
  {
    id: "write-script",
    triggers: [{ event: "run/research.completed" }],
  },
  async ({ event, step }) => {
    const { runId, status } = event.data as ResearchCompletedData;
    const now = () => Math.floor(Date.now() / 1000);

    if (status !== "researched") {
      return { runId, skipped: true, reason: `status=${status}` };
    }

    await step.run("set-status-writing", async () => {
      await db
        .update(runs)
        .set({ status: "writing", updatedAt: now() })
        .where(eq(runs.id, runId));
    });

    let scriptPath: string;
    let scriptMdPath: string;
    try {
      const result = await step.run("run-write", async () => {
        return await runWriteScript(runId);
      });
      scriptPath = result.scriptPath;
      scriptMdPath = result.scriptMdPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({
          status: "write_failed",
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
          scriptPath,
          scriptMdPath,
          status: "scripted",
          errorMessage: null,
          updatedAt: now(),
        })
        .where(eq(runs.id, runId));
    });

    await step.sendEvent("script-completed", {
      name: "run/script.completed",
      data: { runId, status: "scripted", scriptPath, scriptMdPath },
    });

    return { runId, scriptPath, scriptMdPath };
  }
);
